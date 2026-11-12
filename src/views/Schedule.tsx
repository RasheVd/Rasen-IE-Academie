import { useMemo, useState } from 'react';
import { SessionDays } from '../components/bits';
import { SessionDialog } from '../components/dialogs';
import { Empty } from '../components/ui';
import { endOf, reportsDue } from '../domain/progress';
import { useNow, useTitle } from '../hooks';
import { useData, useMe } from '../store';

type Tab = 'upcoming' | 'due' | 'past';

export default function Schedule() {
  const me = useMe(), data = useData(), now = useNow();
  useTitle('Jadwal');
  const staff = me.role !== 'student';
  const [tab, setTab] = useState<Tab>('upcoming');
  const [course, setCourse] = useState('');
  const [mentor, setMentor] = useState('');
  const [add, setAdd] = useState(false);
  const due = useMemo(() => (staff ? reportsDue(data, now, me.role === 'mentor' ? me.id : undefined) : []), [data, now, me, staff]);
  const dueIds = new Set(due.map((s) => s.id));
  const filtered = data.sessions.filter((s) => (!course || s.course_id === course) && (!mentor || s.mentor_id === mentor));
  const upcoming = filtered.filter((s) => s.status === 'scheduled' && endOf(s) >= now);
  const past = filtered.filter((s) => !(s.status === 'scheduled' && endOf(s) >= now)).reverse();
  const list = tab === 'upcoming' ? upcoming : tab === 'due' ? due.filter((s) => filtered.includes(s)) : past;
  const mentors = data.profiles.filter((p) => p.role === 'mentor');

  return (
    <>
      <header className="page-head">
        <div><div className="eyebrow"><span className="mono">{me.role === 'admin' ? 'Jadwal induk' : 'Jadwal kamu'}</span></div><h1 className="page-title">Jadwal</h1></div>
        <div className="actions">
          {data.courses.length > 1 && <select className="select" style={{ width: 'auto' }} value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Saring mata kuliah"><option value="">Semua mata kuliah</option>{data.courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select>}
          {me.role === 'admin' && mentors.length > 1 && <select className="select" style={{ width: 'auto' }} value={mentor} onChange={(e) => setMentor(e.target.value)} aria-label="Saring mentor"><option value="">Semua mentor</option>{mentors.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}</select>}
          {me.role === 'admin' && <button className="btn primary" onClick={() => setAdd(true)}>Tambah sesi</button>}
        </div>
      </header>
      <section className="section">
        <div className="seg" role="group" aria-label="Tampilkan" style={{ marginBottom: 20 }}>
          <button aria-pressed={tab === 'upcoming'} onClick={() => setTab('upcoming')}>Mendatang ({upcoming.length})</button>
          {staff && <button aria-pressed={tab === 'due'} onClick={() => setTab('due')}>Laporan tertunda ({due.length})</button>}
          <button aria-pressed={tab === 'past'} onClick={() => setTab('past')}>Riwayat ({past.length})</button>
        </div>
        {list.length === 0 ? (
          <Empty title={tab === 'upcoming' ? 'Tidak ada sesi mendatang' : tab === 'due' ? 'Semua laporan sudah diisi' : 'Belum ada riwayat sesi'} action={me.role === 'admin' && tab === 'upcoming' ? <button className="btn primary" onClick={() => setAdd(true)}>Tambah sesi</button> : undefined}>
            {tab === 'upcoming' ? (me.role === 'admin' ? 'Tulis sesi baru. Mentor dan peserta langsung melihatnya di akun mereka.' : 'Jadwal muncul di sini setelah admin menyusunnya.') : tab === 'due' ? 'Laporan diisi paling lambat 24 jam setelah sesi.' : 'Sesi yang selesai atau batal tercatat di sini.'}
          </Empty>
        ) : <SessionDays sessions={list} data={data} dueIds={dueIds} />}
      </section>
      {add && <SessionDialog preset={{ course_id: course || undefined }} onClose={() => setAdd(false)} />}
    </>
  );
}
