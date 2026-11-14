/**
 * Status penguasaan per topik dan ringkasan dasbor. Semua angka berasal dari
 * nilai posttest yang diisi mentor; tidak ada tebakan.
 */
import type { Data, Session, Seat, Settings, Topic } from './types';
import { addDays, mondayOf, toLocal } from './time';
import { prettyPhone } from './wa';

export type TopicState = 'need' | 'practice' | 'mastered' | 'none';
export const STATE_LABEL: Record<TopicState, string> = { need: 'Perlu konsultasi', practice: 'Sedang dilatih', mastered: 'Dikuasai', none: 'Belum dinilai' };

export function stateOf(score: number | null | undefined, s: Pick<Settings, 'threshold_need_help' | 'threshold_mastered'>): TopicState {
  if (score == null) return 'none';
  if (score < s.threshold_need_help) return 'need';
  if (score >= s.threshold_mastered) return 'mastered';
  return 'practice';
}

export function stateMessage(state: TopicState, s: Pick<Settings, 'admin_whatsapp' | 'admin_whatsapp_label' | 'threshold_need_help' | 'threshold_mastered'>): string {
  const wa = `${prettyPhone(s.admin_whatsapp)} (${s.admin_whatsapp_label})`;
  switch (state) {
    case 'need':
      return `Nilai posttest di bawah ${s.threshold_need_help}. Topik ini perlu dievaluasi dan dipelajari lagi. Kalau butuh sesi lebih intensif, laporan, atau merasa kurang cocok, langsung hubungi admin di WhatsApp ${wa}.`;
    case 'practice':
      return `Nilaimu sudah di jalur yang benar. Ulangi latihan topik ini, dan booking sesi lagi bila masih ada bagian yang belum mantap. Pertanyaan atau masukan bisa ke admin di WhatsApp ${wa}.`;
    case 'mastered':
      return `Pertahankan dan tetap semangat belajar. Untuk masukan atau ada masalah ke depan, hubungi admin di WhatsApp ${wa}.`;
    default:
      return 'Belum ada nilai posttest untuk topik ini.';
  }
}

export interface TopicProgress { topic: Topic; state: TopicState; last: number | null; pre: number | null; attempts: number; lastAt: string | null; sessionId: string | null }

/** Nilai terakhir per topik untuk satu peserta, di semua sesi yang sudah selesai. */
export function topicProgress(data: Data, studentId: string, courseId?: string): TopicProgress[] {
  const sessions = new Map(data.sessions.filter((s) => s.status === 'done').map((s) => [s.id, s]));
  const seats = data.seats.filter((x) => x.student_id === studentId && sessions.has(x.session_id));
  const byTopic = new Map<string, { seat: Seat; session: Session }[]>();
  for (const seat of seats) {
    const s = sessions.get(seat.session_id)!;
    if (!s.topic_id) continue;
    (byTopic.get(s.topic_id) ?? byTopic.set(s.topic_id, []).get(s.topic_id)!).push({ seat, session: s });
  }
  const enrolled = new Set(data.enrollments.filter((e) => e.student_id === studentId).map((e) => e.course_id));
  const topics = data.topics.filter((t) => (courseId ? t.course_id === courseId : enrolled.has(t.course_id) || byTopic.has(t.id)));
  return topics
    .map((topic) => {
      const list = (byTopic.get(topic.id) ?? []).filter((x) => x.seat.posttest_score != null).sort((a, b) => a.session.starts_at.localeCompare(b.session.starts_at));
      const last = list.at(-1);
      return {
        topic, last: last?.seat.posttest_score ?? null, pre: last?.seat.pretest_score ?? null, attempts: (byTopic.get(topic.id) ?? []).length,
        lastAt: last?.session.starts_at ?? null, sessionId: last?.session.id ?? null,
        state: stateOf(last?.seat.posttest_score, data.settings),
      };
    })
    .sort((a, b) => a.topic.course_id.localeCompare(b.topic.course_id) || a.topic.position - b.topic.position);
}

export function stateCounts(list: TopicProgress[]) {
  return { need: list.filter((x) => x.state === 'need').length, practice: list.filter((x) => x.state === 'practice').length, mastered: list.filter((x) => x.state === 'mastered').length, none: list.filter((x) => x.state === 'none').length };
}

/** Persentase topik dikuasai per mata kuliah, sekarang dan seiring waktu (untuk grafik). */
export function courseProgress(data: Data, studentId: string, courseId: string) {
  const topics = data.topics.filter((t) => t.course_id === courseId);
  const total = topics.length || 1;
  const done = data.sessions.filter((s) => s.status === 'done' && s.course_id === courseId && s.topic_id).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const latest = new Map<string, number>();
  const points: { date: string; pct: number }[] = [];
  for (const s of done) {
    const seat = data.seats.find((x) => x.session_id === s.id && x.student_id === studentId);
    if (seat?.posttest_score == null) continue;
    latest.set(s.topic_id!, seat.posttest_score);
    const mastered = [...latest.values()].filter((v) => v >= data.settings.threshold_mastered).length;
    points.push({ date: toLocal(s.starts_at).date, pct: Math.round((mastered / total) * 100) });
  }
  const list = topicProgress(data, studentId, courseId);
  const mastered = list.filter((x) => x.state === 'mastered').length;
  return { pct: Math.round((mastered / total) * 100), mastered, total: topics.length, points };
}

/** Sesi selesai dan terjadwal per hari dalam satu minggu (Senin sampai Minggu). */
export function weeklyActivity(data: Data, studentId: string, anyDateInWeek: string) {
  const start = mondayOf(anyDateInWeek);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const mine = new Set(data.seats.filter((x) => x.student_id === studentId).map((x) => x.session_id));
  const sessions = data.sessions.filter((s) => mine.has(s.id) && s.status !== 'cancelled');
  return days.map((date) => ({
    date,
    done: sessions.filter((s) => s.status === 'done' && toLocal(s.starts_at).date === date).length,
    planned: sessions.filter((s) => s.status === 'scheduled' && toLocal(s.starts_at).date === date).length,
  }));
}

/** Sesi selesai terbaru dengan nilai. */
export function recentActivity(data: Data, studentId: string, limit = 6) {
  return data.seats
    .filter((x) => x.student_id === studentId)
    .map((seat) => ({ seat, session: data.sessions.find((s) => s.id === seat.session_id)! }))
    .filter((x) => x.session && x.session.status === 'done')
    .sort((a, b) => b.session.starts_at.localeCompare(a.session.starts_at))
    .slice(0, limit);
}

/** Rata-rata kenaikan (post minus pre) dari sesi yang punya dua nilai. */
export function averageGain(seats: Seat[]): number | null {
  const both = seats.filter((x) => x.pretest_score != null && x.posttest_score != null);
  if (!both.length) return null;
  return Math.round((both.reduce((a, x) => a + (x.posttest_score! - x.pretest_score!), 0) / both.length) * 10) / 10;
}
