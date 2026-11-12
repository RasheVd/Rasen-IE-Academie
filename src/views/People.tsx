import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GainBar, GainLegend, nameOf } from '../components/bits';
import { PersonDialog } from '../components/dialogs';
import { Empty } from '../components/ui';
import { studentSummary } from '../domain/progress';
import type { Profile, Role } from '../domain/types';
import { useNow, useTitle } from '../hooks';
import { useData, useMe } from '../store';

export default function People({ role }: { role: Extract<Role, 'student' | 'mentor'> }) {
  const me = useMe(), data = useData(), now = useNow();
  const label = role === 'student' ? 'Peserta' : 'Mentor';
  useTitle(label);
  const admin = me.role === 'admin';
  const [edit, setEdit] = useState<Profile | 'new' | null>(null);
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const list = data.profiles.filter((p) => p.role === role && (!ql || nameOf(p).toLowerCase().includes(ql) || p.email.includes(ql)));
  const code = (id: string) => data.courses.find((c) => c.id === id)?.code;

  return (
    <>
      <header className="page-head">
        <div><div className="eyebrow"><span className="mono">{list.filter((p) => p.active).length} aktif</span>{role === 'student' && <GainLegend />}</div><h1 className="page-title">{label}</h1></div>
        <div className="actions">
          <input className="input" style={{ width: 200 }} placeholder="Cari nama atau email" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Cari ${label.toLowerCase()}`} />
          {admin && <button className="btn primary" onClick={() => setEdit('new')}>Tambah {label.toLowerCase()}</button>}
        </div>
      </header>
      {list.length === 0 ? (
        <Empty title={ql ? 'Tidak ada yang cocok' : `Belum ada ${label.toLowerCase()}`} action={admin && !ql ? <button className="btn primary" onClick={() => setEdit('new')}>Tambah {label.toLowerCase()}</button> : undefined}>
          {admin ? `Daftarkan ${label.toLowerCase()} dengan nama dan emailnya. Ia membuat akun sendiri di halaman Masuk dengan email itu.` : 'Peserta yang kamu ajar muncul di sini.'}
        </Empty>
      ) : (
        <ul className="list stagger">
          {list.map((p) => {
            if (role === 'student') {
              const s = studentSummary(data, p.id, now);
              const courses = data.enrollments.filter((e) => e.student_id === p.id).map((e) => code(e.course_id)).filter(Boolean);
              return (
                <li key={p.id}>
                  <Link to={`/peserta/${p.id}`} className="rowlink person-row" data-testid="person-row">
                    <span><span className="strong">{nameOf(p)}</span>{!p.active && <span className="tag plain" style={{ marginLeft: 8 }}>Nonaktif</span>}{!p.user_id && p.active && <span className="tag yellow" style={{ marginLeft: 8 }}>Belum membuat akun</span>}<span className="muted small" style={{ display: 'block' }}>{p.email}</span></span>
                    <span className="sub small muted">{courses.length ? courses.join(', ') : 'Belum ambil mata kuliah'} · {s.done} sesi</span>
                    <span className="g"><GainBar pre={s.avgPre} post={s.avgPost} compact /></span>
                    <span className="mono muted">Lihat</span>
                  </Link>
                </li>
              );
            }
            const sessions = data.sessions.filter((x) => x.mentor_id === p.id);
            const students = new Set(data.links.filter((l) => sessions.some((x) => x.id === l.session_id)).map((l) => l.student_id));
            return (
              <li key={p.id}>
                <button className="rowlink person-row" style={{ width: '100%', background: 'none', border: 0, textAlign: 'left', borderLeft: '4px solid transparent' }} onClick={() => setEdit(p)}>
                  <span><span className="strong">{nameOf(p)}</span>{!p.active && <span className="tag plain" style={{ marginLeft: 8 }}>Nonaktif</span>}{!p.user_id && p.active && <span className="tag yellow" style={{ marginLeft: 8 }}>Belum membuat akun</span>}<span className="muted small" style={{ display: 'block' }}>{p.email}</span></span>
                  <span className="sub small muted">{p.note || 'Tanpa catatan'}</span>
                  <span className="g mono">{sessions.filter((x) => x.status === 'done').length} sesi selesai · {sessions.filter((x) => x.status === 'scheduled').length} terjadwal · {students.size} peserta</span>
                  <span className="mono muted">Ubah</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {edit && <PersonDialog role={role} person={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}
