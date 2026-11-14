import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { SessionItem } from '../components/bits';
import { Empty } from '../components/ui';
import { Icon } from '../components/Icon';
import { useData, useMe } from '../store';
import { useNow, useTitle } from '../hooks';
import type { Session } from '../domain/types';

type Tab = 'upcoming' | 'action' | 'done' | 'cancelled';

export default function Sessions() {
  useTitle('Sesi');
  const me = useMe();
  const data = useData();
  const now = useNow();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [mentor, setMentor] = useState('');
  const [course, setCourse] = useState('');
  const [q, setQ] = useState('');
  let all = data.sessions;
  if (me.role === 'mentor') all = all.filter((s) => s.mentor_id === me.id);
  if (me.role === 'student') all = all.filter((s) => data.seats.some((x) => x.session_id === s.id && x.student_id === me.id));
  if (mentor) all = all.filter((s) => s.mentor_id === mentor);
  if (course) all = all.filter((s) => s.course_id === course);
  if (q.trim()) {
    const n = q.trim().toLowerCase();
    all = all.filter((s) => s.code.toLowerCase().includes(n) || data.seats.some((x) => x.session_id === s.id && data.profiles.find((p) => p.id === x.student_id)?.full_name.toLowerCase().includes(n)));
  }
  const needsAction = (s: Session) => {
    if (s.status !== 'scheduled') return false;
    if (me.role === 'student') return data.seats.some((x) => x.session_id === s.id && x.student_id === me.id && x.payment_status === 'pending' && !x.proof_path);
    if (me.role === 'mentor') return Date.parse(s.ends_at) < now || (!s.mentor_ready_at && Date.parse(s.starts_at) - now < 36 * 3_600_000);
    return Date.parse(s.ends_at) < now || data.seats.some((x) => x.session_id === s.id && x.payment_status === 'pending' && x.proof_path);
  };
  const lists: Record<Tab, Session[]> = {
    upcoming: all.filter((s) => s.status === 'scheduled' && Date.parse(s.ends_at) >= now),
    action: all.filter(needsAction),
    done: all.filter((s) => s.status === 'done').reverse(),
    cancelled: all.filter((s) => s.status === 'cancelled').reverse(),
  };
  const labels: Record<Tab, string> = { upcoming: 'Mendatang', action: 'Perlu tindakan', done: 'Selesai', cancelled: 'Batal' };
  const list = lists[tab];
  const mentors = data.profiles.filter((p) => p.role === 'mentor');
  return (
    <Shell title="Sesi">
      <div className="page-head">
        <div><h1 className="h-page">{me.role === 'admin' ? 'Semua sesi' : me.role === 'mentor' ? 'Sesi mengajar' : 'Sesi saya'}</h1></div>
        {me.role === 'student' && <Link className="btn primary" to="/booking"><Icon name="plus" />Booking sesi</Link>}
      </div>
      <div className="row wrap between">
        <div className="seg" role="tablist" aria-label="Filter sesi">
          {(Object.keys(labels) as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} aria-pressed={tab === t} onClick={() => setTab(t)}>{labels[t]} <span className="num">({lists[t].length})</span></button>
          ))}
        </div>
        {me.role !== 'student' && (
          <div className="row wrap">
            <input className="input sm" style={{ width: 180 }} placeholder="Cari kode atau peserta" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari sesi" />
            {me.role === 'admin' && (
              <select className="select sm" style={{ width: 170 }} value={mentor} onChange={(e) => setMentor(e.target.value)} aria-label="Filter mentor">
                <option value="">Semua mentor</option>
                {mentors.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            )}
            <select className="select sm" style={{ width: 170 }} value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Filter mata kuliah">
              <option value="">Semua mata kuliah</option>
              {data.courses.filter((c) => all.some((s) => s.course_id === c.id) || c.id === course).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="card">
        {list.length ? <div className="list">{list.slice(0, 200).map((s) => <SessionItem key={s.id} s={s} data={data} me={me} showStudents={me.role !== 'student'} />)}</div>
          : <Empty title={tab === 'action' ? 'Tidak ada yang perlu ditindaklanjuti' : 'Belum ada sesi di sini'} />}
      </div>
    </Shell>
  );
}
