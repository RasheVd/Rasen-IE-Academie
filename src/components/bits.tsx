import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { colorVar } from './ui';
import { AppError, logError, toast } from '../store';
import { STATE_LABEL, stateOf, type TopicState } from '../domain/mastery';
import { MODE_LABEL, type Course, type Data, type Profile, type Seat, type Session, type Settings } from '../domain/types';
import { dayShort, hm, shortDate, timeOf, toLocal } from '../domain/time';
import { prettyPhone, waLink } from '../domain/wa';

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
export function Avatar({ name, sm }: { name: string; sm?: boolean }) {
  return <span className={`avatar ${sm ? 'sm' : ''}`} aria-hidden="true">{initials(name)}</span>;
}

export function CourseChip({ course }: { course?: Course | null }) {
  if (!course) return null;
  return <span className="chip" style={colorVar(course.color)} title={course.title}>{course.code} · {course.title}</span>;
}

const STATE_ICON: Record<TopicState, IconName> = { need: 'alert', practice: 'refresh', mastered: 'check', none: 'minus' };
export function StatePill({ state }: { state: TopicState }) {
  const cls = state === 'need' ? 'bad' : state === 'practice' ? 'warn' : state === 'mastered' ? 'ok' : '';
  return <span className={`pill ${cls}`}><Icon name={STATE_ICON[state]} size={12} />{STATE_LABEL[state]}</span>;
}
export const stateIcon = (s: TopicState) => STATE_ICON[s];

export function Score({ value, settings }: { value: number | null | undefined; settings: Settings }) {
  if (value == null) return <span className="faint">–</span>;
  return <span className={`score ${stateOf(value, settings)}`}>{Math.round(value)}</span>;
}
export function ScoreChange({ pre, post, settings }: { pre: number | null; post: number | null; settings: Settings }) {
  return (
    <span className="row nowrap" style={{ gap: 6 }}>
      <Score value={pre} settings={settings} />
      <Icon name="arrowR" size={12} className="faint" />
      <Score value={post} settings={settings} />
    </span>
  );
}

export function WaButton({ phone, text, label = 'WhatsApp', sm, block }: { phone: string; text?: string; label?: string; sm?: boolean; block?: boolean }) {
  if (!phone) return null;
  return (
    <a className={`btn wa ${sm ? 'sm' : ''} ${block ? 'block' : ''}`} href={waLink(phone, text)} target="_blank" rel="noreferrer">
      <Icon name="chat" size={sm ? 14 : 16} />{label}
    </a>
  );
}

export function AdminContact({ settings, text, compact, bare }: { settings: Settings; text?: string; compact?: boolean; bare?: boolean }) {
  const pretty = prettyPhone(settings.admin_whatsapp);
  if (compact) return <WaButton phone={settings.admin_whatsapp} text={text} label={`Admin ${settings.admin_whatsapp_label}`} sm />;
  return (
    <div className={bare ? 'stack sm' : 'card stack sm'}>
      {!bare && <div className="h-card">Butuh bantuan?</div>}
      <p className="small muted">Jadwal, pembayaran, laporan, atau merasa kurang cocok dengan sesi: hubungi admin.</p>
      <div className="strong num">{pretty} <span className="muted" style={{ fontWeight: 500 }}>({settings.admin_whatsapp_label})</span></div>
      <WaButton phone={settings.admin_whatsapp} text={text ?? 'Halo admin IE.Academie, saya mau bertanya.'} label="Chat admin di WhatsApp" block />
    </div>
  );
}
export { prettyPhone };

export function SessionPill({ session, seat }: { session: Session; seat?: Seat | null }) {
  if (session.status === 'cancelled') return <span className="pill bad">Batal</span>;
  if (session.status === 'done') return <span className="pill">Selesai</span>;
  if (seat?.payment_status === 'pending') return <span className="pill warn">{seat.proof_path ? 'Menunggu konfirmasi' : 'Menunggu bayar'}</span>;
  if (Date.parse(session.ends_at) < Date.now()) return <span className="pill warn">Perlu laporan</span>;
  return <span className="pill ok">Terjadwal</span>;
}

export function WhenBox({ iso }: { iso: string }) {
  const l = toLocal(iso);
  return (
    <div className="when" aria-hidden="true">
      <div className="d">{dayShort(l.date)}</div>
      <div className="n">{l.d}</div>
      <div className="h">{hm(l.min)}</div>
    </div>
  );
}

/** Satu baris sesi untuk daftar: tanggal, mata kuliah, topik, mentor/peserta, status. */
export function SessionItem({ s, data, me, showStudents }: { s: Session; data: Data; me: Profile; showStudents?: boolean }) {
  const course = data.courses.find((c) => c.id === s.course_id);
  const topic = data.topics.find((t) => t.id === s.topic_id);
  const mentor = data.profiles.find((p) => p.id === s.mentor_id);
  const seats = data.seats.filter((x) => x.session_id === s.id);
  const mySeat = seats.find((x) => x.student_id === me.id);
  const names = seats.map((x) => data.profiles.find((p) => p.id === x.student_id)?.full_name.split(' ')[0] ?? 'Peserta');
  const l = toLocal(s.starts_at);
  return (
    <Link to={`/sesi/${s.id}`} className="list-item link">
      <WhenBox iso={s.starts_at} />
      <div className="grow">
        <div className="t">{course?.title ?? 'Mata kuliah'}{topic ? <span className="muted" style={{ fontWeight: 500 }}> · {topic.title}</span> : null}</div>
        <div className="meta">
          {shortDate(l.date)} {timeOf(s.starts_at)}–{timeOf(s.ends_at)} WIB · {MODE_LABEL[s.mode]}{s.mode === 'group' ? ` ${seats.length}/5` : ''}
          {me.role !== 'mentor' && mentor ? ` · ${mentor.full_name}` : ''}
          {showStudents && names.length ? ` · ${names.join(', ')}` : ''}
        </div>
      </div>
      <SessionPill session={s} seat={mySeat} />
    </Link>
  );
}

export function Banner({ tone = 'info', icon = 'info', title, children, action }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; icon?: IconName; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`banner ${tone}`} role={tone === 'bad' ? 'alert' : undefined}>
      <Icon name={icon} size={18} className="ic" />
      <div className="grow">
        <div>{title}</div>
        {children && <p>{children}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}

export function Loading({ label = 'Memuat…' }: { label?: string }) {
  return <div className="loading"><div className="row"><div className="spinner" /><span>{label}</span></div></div>;
}

/** Jalankan aksi async: tombol nonaktif selama proses, galat tampil sebagai toast. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  async function run<T>(key: string, f: () => Promise<T>, success?: string): Promise<T | undefined> {
    setBusy(key);
    try {
      const r = await f();
      if (success) toast(success);
      return r;
    } catch (e) {
      toast((e as Error).message, 'error');
      // Pesan aturan bisnis (AppError) bukan galat; selain itu dicatat untuk admin.
      if (!(e instanceof AppError)) logError((e as Error).message || String(e), (e as Error).stack ?? '');
      return undefined;
    } finally {
      setBusy(null);
    }
  }
  return { busy, run };
}

export function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className="row" style={{ display: 'inline-flex', gap: 4 }}>{children}<Icon name="external" size={13} /></a>;
}
