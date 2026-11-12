/**
 * Hitungan progres. Semua angka berasal dari nilai pretest dan posttest yang
 * diisi mentor atau admin; tidak ada perkiraan.
 */
import type { Data, Session, SessionStudent } from './types';

export interface Point { session: Session; pre: number | null; post: number | null; attendance: SessionStudent['attendance'] }
export interface CourseProgress {
  courseId: string;
  points: Point[];          // sesi selesai, urut waktu
  done: number;             // sesi selesai
  upcoming: number;         // sesi terjadwal yang belum lewat
  target: number;           // target sesi dari pendaftaran
  attended: number;
  avgPre: number | null;
  avgPost: number | null;
  gain: number | null;      // rata-rata (post - pre) pada sesi yang punya dua nilai
  lastPost: number | null;
  next: Session | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
export const avg = (xs: (number | null | undefined)[]): number | null => {
  const v = xs.filter((x): x is number => typeof x === 'number');
  return v.length ? round1(v.reduce((a, b) => a + b, 0) / v.length) : null;
};
export const endOf = (s: Session) => new Date(s.starts_at).getTime() + s.duration_min * 60_000;

export function courseProgress(data: Data, studentId: string, courseId: string, now = Date.now()): CourseProgress {
  const mine = new Map(data.links.filter((l) => l.student_id === studentId).map((l) => [l.session_id, l]));
  const sessions = data.sessions.filter((s) => s.course_id === courseId && mine.has(s.id)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const done = sessions.filter((s) => s.status === 'done');
  const points: Point[] = done.map((s) => {
    const l = mine.get(s.id)!;
    return { session: s, pre: l.pretest_score, post: l.posttest_score, attendance: l.attendance };
  });
  const both = points.filter((p) => p.pre != null && p.post != null);
  const upcomingList = sessions.filter((s) => s.status === 'scheduled' && endOf(s) >= now);
  const enr = data.enrollments.find((e) => e.student_id === studentId && e.course_id === courseId);
  const posts = points.filter((p) => p.post != null);
  return {
    courseId, points, done: done.length, upcoming: upcomingList.length, target: enr?.target_sessions ?? Math.max(done.length + upcomingList.length, 1),
    attended: points.filter((p) => p.attendance === 'present').length,
    avgPre: avg(both.map((p) => p.pre)), avgPost: avg(both.map((p) => p.post)),
    gain: both.length ? round1(both.reduce((s, p) => s + (p.post! - p.pre!), 0) / both.length) : null,
    lastPost: posts.length ? posts[posts.length - 1].post : null,
    next: upcomingList[0] ?? null,
  };
}

/** Mata kuliah yang diikuti seorang peserta: dari pendaftaran, ditambah mata kuliah sesi yang pernah ia ikuti. */
export function studentCourseIds(data: Data, studentId: string): string[] {
  const ids = new Set(data.enrollments.filter((e) => e.student_id === studentId).map((e) => e.course_id));
  const sess = new Map(data.sessions.map((s) => [s.id, s]));
  for (const l of data.links) if (l.student_id === studentId) { const s = sess.get(l.session_id); if (s) ids.add(s.course_id); }
  return [...ids];
}

/** Ringkasan satu peserta lintas mata kuliah. */
export function studentSummary(data: Data, studentId: string, now = Date.now()) {
  const per = studentCourseIds(data, studentId).map((c) => courseProgress(data, studentId, c, now));
  const pts = per.flatMap((p) => p.points).filter((p) => p.pre != null && p.post != null);
  return {
    per,
    done: per.reduce((s, p) => s + p.done, 0),
    avgPre: avg(pts.map((p) => p.pre)), avgPost: avg(pts.map((p) => p.post)),
    gain: pts.length ? round1(pts.reduce((s, p) => s + (p.post! - p.pre!), 0) / pts.length) : null,
  };
}

/** Sesi yang sudah lewat tetapi laporannya belum lengkap (status masih terjadwal, atau nilai kosong). */
export function reportsDue(data: Data, now = Date.now(), mentorId?: string): Session[] {
  return data.sessions
    .filter((s) => s.status !== 'cancelled' && endOf(s) < now && (!mentorId || s.mentor_id === mentorId))
    .filter((s) => {
      if (s.status === 'scheduled') return true;
      const ls = data.links.filter((l) => l.session_id === s.id);
      return ls.some((l) => l.attendance == null || (l.attendance === 'present' && (l.pretest_score == null || l.posttest_score == null)));
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** Rata-rata kenaikan seluruh peserta dalam satu mata kuliah. */
export function courseOverview(data: Data, courseId: string) {
  const sess = new Set(data.sessions.filter((s) => s.course_id === courseId && s.status === 'done').map((s) => s.id));
  const ls = data.links.filter((l) => sess.has(l.session_id) && l.pretest_score != null && l.posttest_score != null);
  const students = new Set([...data.enrollments.filter((e) => e.course_id === courseId && e.status === 'active').map((e) => e.student_id)]);
  return {
    students: students.size, sessionsDone: sess.size,
    avgPre: avg(ls.map((l) => l.pretest_score)), avgPost: avg(ls.map((l) => l.posttest_score)),
    gain: ls.length ? round1(ls.reduce((s, l) => s + (l.posttest_score! - l.pretest_score!), 0) / ls.length) : null,
  };
}

/** Kode sesi berikutnya untuk sebuah mata kuliah, mis. IE2101-07. */
export function nextSessionCode(courseCode: string, existing: string[]): string {
  const prefix = courseCode.toUpperCase().replace(/\s+/g, '') + '-';
  const nums = existing.filter((c) => c.startsWith(prefix)).map((c) => parseInt(c.slice(prefix.length), 10)).filter((n) => !isNaN(n));
  return prefix + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, '0');
}

/** Tautan "Tambah ke Google Calendar" yang bekerja tanpa integrasi apa pun. */
export function gcalTemplateLink(s: Session, title: string): string {
  const f = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const start = new Date(s.starts_at), end = new Date(endOf(s));
  const details = [`Kode sesi: ${s.code}`, s.topic && `Topik: ${s.topic}`, s.pretest_url && `Pretest: ${s.pretest_url}`, s.posttest_url && `Posttest: ${s.posttest_url}`].filter(Boolean).join('\n');
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${f(start)}/${f(end)}`, details, location: s.place });
  return `https://calendar.google.com/calendar/render?${q}`;
}
