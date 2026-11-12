import { Link } from 'react-router-dom';
import { format, isToday, isTomorrow } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import type { CourseProgress, Point } from '../domain/progress';
import { STATUS_LABEL, type Course, type Data, type Profile, type Session } from '../domain/types';
import { colorVar } from './ui';

/* ── Format waktu (Indonesia) ────────────────────────────── */
export const fmt = (iso: string | Date, pattern: string) => format(typeof iso === 'string' ? new Date(iso) : iso, pattern, { locale: localeId });
export const fmtTime = (iso: string) => fmt(iso, 'HH.mm');
export const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return isToday(d) ? 'Hari ini' : isTomorrow(d) ? 'Besok' : fmt(d, 'EEEE');
};
export const fmtDate = (iso: string) => fmt(iso, 'd MMM yyyy');
export const dayKey = (iso: string) => fmt(iso, 'yyyy-MM-dd');
export const nameOf = (p?: Profile | null) => (p ? p.full_name || p.email : 'Belum ditentukan');
export const signed = (n: number | null) => (n == null ? '–' : `${n > 0 ? '+' : ''}${n}`);

/* ── Batang kenaikan: elemen khas ────────────────────────── */
export function GainBar({ pre, post, compact }: { pre: number | null; post: number | null; compact?: boolean }) {
  const has = pre != null && post != null;
  const gain = has ? Math.round((post! - pre!) * 10) / 10 : null;
  const lo = has ? Math.min(pre!, post!) : 0, hi = has ? Math.max(pre!, post!) : 0;
  return (
    <div className="gain" role="img" aria-label={has ? `Rata-rata pretest ${pre}, posttest ${post}, selisih ${signed(gain)}` : 'Belum ada nilai pretest dan posttest'}>
      <div className="track" style={compact ? { height: 18 } : undefined}>
        {has && <div className={`seg-fill ${gain! < 0 ? 'neg' : ''}`} style={{ left: `${lo}%`, width: `${hi - lo}%`, ...(compact ? { top: 4, bottom: 4 } : {}) }} />}
        {has && <div className="mark" style={{ left: `${pre}%`, ...(compact ? { top: 0.5, width: 12, height: 12, marginLeft: -6 } : {}) }} title={`Pretest ${pre}`} />}
        {has && <div className="mark post" style={{ left: `${post}%`, ...(compact ? { top: 0.5, width: 12, height: 12, marginLeft: -6 } : {}) }} title={`Posttest ${post}`} />}
      </div>
      <div className={`delta ${gain == null ? 'muted' : gain >= 0 ? 'up' : 'down'}`}>{signed(gain)}</div>
    </div>
  );
}
export function GainLegend() {
  return <div className="gain-legend"><span><i />Pretest</span><span><i className="post" />Posttest</span><span>Skala 0 sampai 100</span></div>;
}

/* ── Batang sesi 60 menit ────────────────────────────────── */
export function SessionBar({ tall }: { tall?: boolean }) {
  return (
    <div className={`sbar ${tall ? 'tall' : ''}`} role="img" aria-label="Susunan sesi 60 menit: pretest 5 menit, materi dan latihan 40 menit, pembahasan 10 menit, posttest 5 menit">
      <div className="p1">Pre<small>5′</small></div>
      <div className="p2">Materi dan latihan<small>40 menit</small></div>
      <div className="p3">Bahas<small>10′</small></div>
      <div className="p4">Post<small>5′</small></div>
    </div>
  );
}

/* ── Grafik pretest dan posttest per sesi ────────────────── */
export function ScoreChart({ points }: { points: Point[] }) {
  const pts = points.filter((p) => p.pre != null || p.post != null);
  if (pts.length === 0) return <p className="muted small">Grafik muncul setelah nilai sesi pertama diisi.</p>;
  const W = 640, H = 220, L = 34, R = 12, T = 12, B = 30;
  const x = (i: number) => (pts.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (pts.length - 1));
  const y = (v: number) => T + ((100 - v) * (H - T - B)) / 100;
  const line = (k: 'pre' | 'post') => pts.map((p, i) => (p[k] == null ? null : `${x(i)},${y(p[k]!)}`)).filter(Boolean).join(' ');
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Nilai per sesi. ${pts.map((p) => `${p.session.code}: pretest ${p.pre ?? 'kosong'}, posttest ${p.post ?? 'kosong'}`).join('. ')}`}>
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={v === 0 ? 1.5 : 1} /><text x={L - 6} y={y(v) + 4} textAnchor="end">{v}</text></g>
      ))}
      {pts.map((p, i) => p.pre != null && p.post != null && <line key={p.session.id} x1={x(i)} x2={x(i)} y1={y(p.pre)} y2={y(p.post)} stroke={p.post >= p.pre ? 'var(--green)' : 'var(--orange)'} strokeWidth={8} />)}
      <polyline points={line('pre')} fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 4" />
      <polyline points={line('post')} fill="none" stroke="var(--ink)" strokeWidth={2} />
      {pts.map((p, i) => (
        <g key={p.session.id}>
          {p.pre != null && <rect x={x(i) - 5} y={y(p.pre) - 5} width={10} height={10} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.5} />}
          {p.post != null && <rect x={x(i) - 5} y={y(p.post) - 5} width={10} height={10} fill="var(--ink)" />}
          <text x={x(i)} y={H - 10} textAnchor="middle">{fmt(p.session.starts_at, 'd/M')}</text>
        </g>
      ))}
    </svg>
  );
}

/* ── Tag status, kode, mata kuliah ───────────────────────── */
export function StatusTag({ s, due }: { s: Session; due?: boolean }) {
  if (s.status === 'cancelled') return <span className="tag cancelled">Batal</span>;
  if (due) return <span className="tag orange">Laporan belum diisi</span>;
  if (s.status === 'done') return <span className="tag green">Selesai</span>;
  return <span className="tag plain">{STATUS_LABEL[s.status]}</span>;
}
export function CourseChip({ course }: { course?: Course }) {
  if (!course) return null;
  return <span className="row" style={{ gap: 7 }}><span className="swatch" style={colorVar(course.color)} /><span className="strong">{course.code}</span></span>;
}

/* ── Baris sesi ──────────────────────────────────────────── */
export function SessionRow({ s, data, due, showStudents = true }: { s: Session; data: Data; due?: boolean; showStudents?: boolean }) {
  const course = data.courses.find((c) => c.id === s.course_id);
  const mentor = data.profiles.find((p) => p.id === s.mentor_id);
  const students = data.links.filter((l) => l.session_id === s.id).map((l) => data.profiles.find((p) => p.id === l.student_id)).filter(Boolean) as Profile[];
  return (
    <Link to={`/sesi/${s.id}`} className="rowlink session-row" data-testid="session-row">
      <span className="time">{fmtTime(s.starts_at)}</span>
      <span className="c-code"><span className="code">{s.code}</span></span>
      <span className="grow"><span className="row" style={{ gap: 8 }}><CourseChip course={course} /><span className="ellipsis">{s.topic || course?.title}</span></span></span>
      <span className="who ellipsis">{mentor ? nameOf(mentor) : 'Mentor belum ditentukan'}{showStudents && students.length ? ` · ${students.map(nameOf).join(', ')}` : ''}{s.place ? ` · ${s.place}` : ''}</span>
      <StatusTag s={s} due={due} />
    </Link>
  );
}

/** Daftar sesi berkelompok per hari. */
export function SessionDays({ sessions, data, dueIds }: { sessions: Session[]; data: Data; dueIds?: Set<string> }) {
  const days = new Map<string, Session[]>();
  for (const s of sessions) { const k = dayKey(s.starts_at); (days.get(k) ?? days.set(k, []).get(k)!).push(s); }
  return (
    <>
      {[...days.entries()].map(([k, list]) => (
        <div key={k}>
          <div className={`day-head ${isToday(new Date(list[0].starts_at)) ? 'today' : ''}`}><span className="d">{fmtDay(list[0].starts_at)}</span><span className="mono muted">{fmt(list[0].starts_at, 'd MMMM yyyy')}</span></div>
          <ul className="list stagger">{list.map((s) => <li key={s.id}><SessionRow s={s} data={data} due={dueIds?.has(s.id)} /></li>)}</ul>
        </div>
      ))}
    </>
  );
}

/* ── Kartu progres mata kuliah ───────────────────────────── */
export function ProgressCard({ course, p, to }: { course: Course; p: CourseProgress; to?: string }) {
  const body = (
    <>
      <div className="row between"><span className="code">{course.code}</span><span className="mono muted">{p.done} dari {p.target} sesi</span></div>
      <div className="t">{course.title}</div>
      <GainBar pre={p.avgPre} post={p.avgPost} />
      <div className="meta">
        <div><b>{p.avgPre ?? '–'}</b><span>Pretest</span></div>
        <div><b>{p.avgPost ?? '–'}</b><span>Posttest</span></div>
        <div><b>{p.done ? `${p.attended}/${p.done}` : '–'}</b><span>Hadir</span></div>
      </div>
    </>
  );
  return to ? <Link to={to} className="pcard" style={colorVar(course.color)}>{body}</Link> : <div className="pcard" style={colorVar(course.color)}>{body}</div>;
}
