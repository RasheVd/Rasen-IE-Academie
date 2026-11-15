/** Ruang kerja: tugas sesuai peran, to-do pribadi, agenda, ringkasan. Urutan dan isinya diatur sendiri. */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { Icon, type IconName } from '../components/Icon';
import { AdminContact, SessionItem, useAction } from '../components/bits';
import { Empty } from '../components/ui';
import { addTodo, removeTodo, toggleTodo, updatePrefs, useData, useMe, useStore, type Gcal } from '../store';
import { useNow, useTitle } from '../hooks';
import { earnings } from '../domain/money';
import { stateCounts, topicProgress } from '../domain/mastery';
import { addDays, longDate, rupiah, shortDate, timeOf, toLocal, until } from '../domain/time';
import type { Data, Profile } from '../domain/types';

interface Task { id: string; title: string; sub?: string; to: string; tone?: 'bad' | 'warn'; icon: IconName }

/** Tugas yang muncul dari data, berbeda untuk tiap peran. */
export function tasksFor(data: Data, me: Profile, now: number, gcal: Gcal | null): Task[] {
  const out: Task[] = [];
  const course = (id: string) => data.courses.find((c) => c.id === id);
  const topicOf = (id: string | null) => data.topics.find((t) => t.id === id);
  if (me.role === 'student') {
    const mySeats = data.seats.filter((x) => x.student_id === me.id);
    for (const x of mySeats) {
      const s = data.sessions.find((y) => y.id === x.session_id);
      if (!s || s.status === 'cancelled') continue;
      const start = Date.parse(s.starts_at);
      if (s.status === 'scheduled' && x.payment_status === 'pending' && !x.proof_path) out.push({ id: `pay${s.id}`, icon: 'card', tone: 'warn', title: `Upload bukti bayar ${s.code}`, sub: x.hold_expires_at ? `Slot dilepas ${until(x.hold_expires_at, now)}` : course(s.course_id)?.title, to: `/sesi/${s.id}` });
      const pre = s.pretest_url || topicOf(s.topic_id)?.pretest_url;
      if (s.status === 'scheduled' && x.payment_status === 'paid' && start > now && start - now < 48 * 3_600_000 && pre) out.push({ id: `pre${s.id}`, icon: 'note', title: `Siapkan pretest ${course(s.course_id)?.code ?? ''}`, sub: `Sesi ${longDate(toLocal(s.starts_at).date)} ${timeOf(s.starts_at)} WIB`, to: `/sesi/${s.id}` });
      if (s.status === 'done' && !x.rating) out.push({ id: `rate${s.id}`, icon: 'star', title: `Beri ulasan sesi ${s.code}`, sub: topicOf(s.topic_id)?.title, to: `/sesi/${s.id}` });
    }
    const credits = data.credits.filter((c) => c.student_id === me.id && !c.used_session).length;
    if (credits) out.push({ id: 'credit', icon: 'star', title: `Pakai ${credits} kredit sesi`, sub: 'Booking berikutnya gratis', to: '/booking' });
    if (!data.enrollments.some((e) => e.student_id === me.id)) out.push({ id: 'enrol', icon: 'layers', tone: 'warn', title: 'Mata kuliahmu belum dipasang', sub: 'Kabari admin lewat WhatsApp', to: '/beranda' });
    const need = topicProgress(data, me.id).filter((p) => p.state === 'need')[0];
    if (need) out.push({ id: 'need', icon: 'target', title: `Ulangi topik ${need.topic.title}`, sub: `Nilai terakhir ${Math.round(need.last ?? 0)}`, to: `/booking?course=${need.topic.course_id}&topic=${need.topic.id}` });
  }
  if (me.role === 'mentor') {
    const mine = data.sessions.filter((s) => s.mentor_id === me.id && s.status === 'scheduled');
    for (const s of mine) {
      const start = Date.parse(s.starts_at), end = Date.parse(s.ends_at);
      if (end < now) out.push({ id: `rep${s.id}`, icon: 'note', tone: end + 864e5 < now ? 'bad' : 'warn', title: `Isi laporan ${s.code}`, sub: end + 864e5 < now ? 'Lewat batas 24 jam' : `Batas ${until(end + 864e5, now)}`, to: `/sesi/${s.id}` });
      else if (!s.mentor_ready_at && start - now < 48 * 3_600_000) out.push({ id: `ready${s.id}`, icon: 'clock', tone: start - now < 864e5 ? 'warn' : undefined, title: `Konfirmasi siap ${s.code}`, sub: `Mulai ${until(start, now)}`, to: `/sesi/${s.id}` });
      const t = topicOf(s.topic_id);
      if (start > now && start - now < 7 * 864e5 && !(s.pretest_url || t?.pretest_url) ) out.push({ id: `test${s.id}`, icon: 'link', title: `Isi link pretest ${s.code}`, sub: t?.title ?? course(s.course_id)?.title, to: `/sesi/${s.id}` });
    }
    if (!data.mentorCourses.some((x) => x.mentor_id === me.id && x.status === 'approved')) out.push({ id: 'comp', icon: 'layers', tone: 'warn', title: 'Ajukan mata kuliah yang kamu ajar', sub: 'Peserta belum bisa melihatmu', to: '/ketersediaan' });
    if (!data.rules.some((r) => r.mentor_id === me.id && r.active)) out.push({ id: 'rules', icon: 'clock', tone: 'warn', title: 'Isi jam ketersediaan', sub: 'Tanpa jam, tidak ada yang bisa booking', to: '/ketersediaan' });
    for (const m of data.materials.filter((x) => x.created_by === me.id && x.status === 'rejected')) out.push({ id: `mat${m.id}`, icon: 'book', title: `Perbaiki bahan "${m.title}"`, sub: m.review_note || 'Ditolak admin', to: '/materi' });
  }
  if (me.role === 'admin') {
    const proofs = data.seats.filter((x) => x.payment_status === 'pending' && x.proof_path).length;
    if (proofs) out.push({ id: 'proofs', icon: 'card', tone: 'warn', title: `Konfirmasi ${proofs} pembayaran`, to: '/pembayaran' });
    const comps = data.mentorCourses.filter((x) => x.status === 'pending').length;
    if (comps) out.push({ id: 'comps', icon: 'layers', title: `Tinjau ${comps} kompetensi mentor`, to: '/mentor' });
    const mats = data.materials.filter((m) => m.status === 'pending').length;
    if (mats) out.push({ id: 'mats', icon: 'book', title: `Tinjau ${mats} bahan mentor`, to: '/materi' });
    const late = data.sessions.filter((s) => s.status === 'scheduled' && Date.parse(s.ends_at) + 864e5 < now).length;
    if (late) out.push({ id: 'late', icon: 'note', tone: 'bad', title: `${late} laporan sesi terlambat`, to: '/sesi' });
    const invited = data.profiles.filter((p) => !p.user_id && p.active).length;
    if (invited) out.push({ id: 'inv', icon: 'mail', title: `${invited} undangan belum diterima`, sub: 'Kirim ulang atau tautan WA', to: '/peserta' });
    if (!data.settings.bank_account) out.push({ id: 'bank', icon: 'wallet', tone: 'warn', title: 'Isi nomor rekening pembayaran', to: '/pengaturan/bisnis' });
    if (gcal?.configured && !gcal.connected) out.push({ id: 'gcal', icon: 'calendar', title: 'Sambungkan Google Calendar admin', to: '/pengaturan' });
  }
  if (me.role === 'mentor' && gcal?.configured && !gcal.connected) out.push({ id: 'gcal', icon: 'calendar', title: 'Sambungkan Google Calendar', sub: 'Slot dan sesimu masuk kalender', to: '/pengaturan' });
  return out;
}

const WIDGETS: Record<string, string> = { tugas: 'Tugas', todo: 'To-do pribadi', agenda: 'Agenda 7 hari', ringkas: 'Ringkasan', kontak: 'Kontak admin' };
const DEFAULT_ORDER = ['tugas', 'todo', 'agenda', 'ringkas', 'kontak'];

export default function Workspace() {
  useTitle('Ruang kerja');
  const me = useMe();
  const data = useData();
  const now = useNow();
  const gcal = useStore((r) => r.gcal);
  const [editing, setEditing] = useState(false);
  const available = DEFAULT_ORDER.filter((w) => !(w === 'kontak' && me.role === 'admin'));
  const saved = (me.prefs?.widgets ?? []).filter((w) => available.includes(w));
  const order = [...saved, ...available.filter((w) => !saved.includes(w))];
  const hidden = new Set(me.prefs?.hidden ?? []);
  const shown = order.filter((w) => !hidden.has(w));
  const move = (w: string, dir: -1 | 1) => { const o = [...order]; const i = o.indexOf(w), j = i + dir; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; updatePrefs({ widgets: o }); };
  const hide = (w: string, on: boolean) => updatePrefs({ hidden: on ? [...hidden, w] : [...hidden].filter((x) => x !== w) });
  const tasks = tasksFor(data, me, now, gcal);

  const body: Record<string, ReactNode> = {
    tugas: tasks.length ? (
      <div className="list">
        {tasks.map((t) => (
          <Link key={t.id} to={t.to} className="list-item link">
            <span className="avatar sm" style={t.tone === 'bad' ? { background: 'var(--need-bg)', color: 'var(--need-ink)' } : t.tone === 'warn' ? { background: 'var(--practice-bg)', color: 'var(--practice-ink)' } : undefined}><Icon name={t.icon} size={14} /></span>
            <div className="grow"><div className="t">{t.title}</div>{t.sub && <div className="meta">{t.sub}</div>}</div>
            <Icon name="chevR" size={14} className="faint" />
          </Link>
        ))}
      </div>
    ) : <Empty title="Tidak ada tugas">Semua yang perlu kamu kerjakan sudah beres.</Empty>,
    todo: <Todos />,
    agenda: <Agenda data={data} me={me} now={now} />,
    ringkas: <Summary data={data} me={me} now={now} />,
    kontak: <AdminContact settings={data.settings} />,
  };

  return (
    <Shell title="Ruang kerja">
      <div className="page-head">
        <div><h1 className="h-page">Ruang kerja {me.full_name.split(' ')[0]}</h1><p className="lead">{longDate(toLocal(now).date)} · {tasks.length ? `${tasks.length} tugas menunggu` : 'tidak ada tugas menunggu'}</p></div>
        <button className="btn" aria-pressed={editing} onClick={() => setEditing(!editing)}><Icon name="settings" size={16} />{editing ? 'Selesai mengatur' : 'Atur ruang kerja'}</button>
      </div>
      {editing && hidden.size > 0 && (
        <div className="row wrap small"><span className="muted">Tersembunyi:</span>
          {[...hidden].filter((w) => available.includes(w)).map((w) => <button key={w} className="btn sm" onClick={() => hide(w, false)}><Icon name="plus" size={12} />{WIDGETS[w]}</button>)}
        </div>
      )}
      <div className="ws-grid">
        {shown.map((w, i) => (
          <section key={w} className={`card ws-${w}`}>
            <div className="card-head">
              <div className="h-card">{WIDGETS[w]}{w === 'tugas' && tasks.length > 0 && <span className="badge" style={{ marginLeft: 8 }}>{tasks.length}</span>}</div>
              {editing && (
                <div className="row">
                  <button className="btn ghost icon sm" aria-label={`Naikkan ${WIDGETS[w]}`} disabled={i === 0} onClick={() => move(w, -1)}><Icon name="arrowUp" size={14} /></button>
                  <button className="btn ghost icon sm" aria-label={`Turunkan ${WIDGETS[w]}`} disabled={i === shown.length - 1} onClick={() => move(w, 1)}><Icon name="arrowDown" size={14} /></button>
                  <button className="btn ghost sm" onClick={() => hide(w, true)}>Sembunyikan</button>
                </div>
              )}
            </div>
            {body[w]}
          </section>
        ))}
      </div>
    </Shell>
  );
}

function Todos() {
  const todos = useData().todos;
  const { busy, run } = useAction();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [showDone, setShowDone] = useState(false);
  const today = toLocal(Date.now()).date;
  const open = todos.filter((t) => !t.done).sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'));
  const done = todos.filter((t) => t.done);
  const row = (t: (typeof todos)[number]) => (
    <div key={t.id} className="list-item" style={{ padding: '8px 0' }}>
      <input type="checkbox" checked={t.done} onChange={(e) => toggleTodo(t.id, e.target.checked)} aria-label={`Tandai ${t.title}`} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} />
      <div className="grow" style={t.done ? { textDecoration: 'line-through', color: 'var(--faint)' } : undefined}>
        {t.title}
        {t.due_on && <span className={`small ${!t.done && t.due_on < today ? '' : 'muted'}`} style={!t.done && t.due_on < today ? { color: 'var(--danger)', fontWeight: 700 } : undefined}> · {t.due_on === today ? 'hari ini' : shortDate(t.due_on)}</span>}
      </div>
      <button className="btn ghost icon sm" aria-label={`Hapus ${t.title}`} onClick={() => run('d', () => removeTodo(t.id))}><Icon name="trash" size={14} /></button>
    </div>
  );
  return (
    <div className="stack sm">
      <form className="row wrap" onSubmit={(e) => { e.preventDefault(); if (title.trim()) run('a', async () => { await addTodo(title, due || null); setTitle(''); setDue(''); }); }}>
        <input className="input sm grow" placeholder="Tambah to-do, misalnya: kerjakan latihan bab 3" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="To-do baru" maxLength={200} />
        <input className="input sm" type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} aria-label="Tenggat" style={{ width: 150 }} />
        <button className="btn sm primary" disabled={!title.trim() || !!busy}>Tambah</button>
      </form>
      {open.length === 0 && <p className="small muted">Belum ada to-do. Catat apa saja yang mau kamu kerjakan.</p>}
      <div className="list">{open.map(row)}</div>
      {done.length > 0 && <button className="link-btn small" style={{ justifySelf: 'start' }} onClick={() => setShowDone(!showDone)}>{showDone ? 'Sembunyikan' : 'Lihat'} {done.length} selesai</button>}
      {showDone && <div className="list">{done.map(row)}</div>}
    </div>
  );
}

function Agenda({ data, me, now }: { data: Data; me: Profile; now: number }) {
  const end = now + 7 * 864e5;
  const list = data.sessions.filter((s) => s.status === 'scheduled' && Date.parse(s.ends_at) > now && Date.parse(s.starts_at) < end
    && (me.role === 'admin' || s.mentor_id === me.id || data.seats.some((x) => x.session_id === s.id && x.student_id === me.id)));
  return (
    <div className="stack sm">
      {list.length ? <div className="list">{list.slice(0, 8).map((s) => <SessionItem key={s.id} s={s} data={data} me={me} showStudents={me.role !== 'student'} />)}</div>
        : <p className="small muted">Tidak ada sesi sampai {shortDate(addDays(toLocal(now).date, 7))}.</p>}
      <Link to={me.role === 'admin' ? '/kalender' : '/jadwal'} className="small">Buka kalender</Link>
    </div>
  );
}

function Summary({ data, me, now }: { data: Data; me: Profile; now: number }) {
  const month = toLocal(now).date.slice(0, 7);
  if (me.role === 'student') {
    const c = stateCounts(topicProgress(data, me.id));
    return (
      <div className="tiles" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <div className="tile need" style={{ padding: 10 }}><div className="tile-top"><Icon name="alert" size={14} /><span className="small">Konsultasi</span><span className="count num" style={{ fontSize: 24 }}>{c.need}</span></div></div>
        <div className="tile practice" style={{ padding: 10 }}><div className="tile-top"><Icon name="refresh" size={14} /><span className="small">Dilatih</span><span className="count num" style={{ fontSize: 24 }}>{c.practice}</span></div></div>
        <div className="tile mastered" style={{ padding: 10 }}><div className="tile-top"><Icon name="check" size={14} /><span className="small">Dikuasai</span><span className="count num" style={{ fontSize: 24 }}>{c.mastered}</span></div></div>
      </div>
    );
  }
  if (me.role === 'mentor') {
    const e = earnings(data, me.id).find((x) => x.month === month);
    return (
      <div className="stack sm">
        <div className="stat"><div className="label">Hak bulan ini</div><div className="value">{rupiah(e?.amount ?? 0)}</div></div>
        <div className="small muted">{e ? `${e.privateCount} private, ${e.groupCount} kelas bersama` : 'Belum ada sesi selesai bulan ini.'}</div>
        <Link to="/hak" className="small">Rincian hak</Link>
      </div>
    );
  }
  const students = data.profiles.filter((p) => p.role === 'student' && p.active).length;
  const mentors = data.profiles.filter((p) => p.role === 'mentor' && p.active).length;
  const sessions = data.sessions.filter((s) => s.status !== 'cancelled' && toLocal(s.starts_at).date.slice(0, 7) === month).length;
  return (
    <div className="grid g3">
      <div className="stat"><div className="label">Peserta</div><div className="value">{students}</div></div>
      <div className="stat"><div className="label">Mentor</div><div className="value">{mentors}</div></div>
      <div className="stat"><div className="label">Sesi bulan ini</div><div className="value">{sessions}</div></div>
    </div>
  );
}
