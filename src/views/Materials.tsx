import { useState } from 'react';
import { fmt, nameOf } from '../components/bits';
import { MaterialDialog } from '../components/dialogs';
import { Empty, colorVar } from '../components/ui';
import { KIND_LABEL, type Material } from '../domain/types';
import { useTitle } from '../hooks';
import { useData, useMe } from '../store';

export default function Materials() {
  const me = useMe(), data = useData();
  useTitle('Materi');
  const admin = me.role === 'admin';
  const [edit, setEdit] = useState<Material | 'new' | null>(null);
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const list = data.materials.filter((m) => !ql || m.title.toLowerCase().includes(ql) || m.description.toLowerCase().includes(ql));
  const courses = data.courses.filter((c) => list.some((m) => m.course_id === c.id));

  return (
    <>
      <header className="page-head">
        <div><div className="eyebrow"><span className="mono">{data.materials.length} materi</span></div><h1 className="page-title">Materi</h1></div>
        <div className="actions">
          <input className="input" style={{ width: 200 }} placeholder="Cari judul" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari materi" />
          {admin && <button className="btn primary" onClick={() => setEdit('new')} disabled={data.courses.length === 0}>Tambah materi</button>}
        </div>
      </header>
      {list.length === 0 ? (
        <Empty title={ql ? 'Tidak ada materi yang cocok' : 'Belum ada materi'} action={admin && !ql && data.courses.length > 0 ? <button className="btn primary" onClick={() => setEdit('new')}>Tambah materi</button> : undefined}>
          {admin ? (data.courses.length ? 'Tempel tautan PPT, PDF, atau latihan dari Google Drive. Pilih untuk semua peserta mata kuliah atau satu peserta saja.' : 'Tambah mata kuliah dulu, lalu isi materinya.') : 'Materi dari admin muncul di sini, dikelompokkan per mata kuliah.'}
        </Empty>
      ) : courses.map((c) => (
        <section className="section" key={c.id}>
          <div className="section-head"><h2 className="h-section"><span className="swatch" style={{ ...colorVar(c.color), marginRight: 8 }} />{c.code} · {c.title}</h2></div>
          <ul className="list stagger">
            {list.filter((m) => m.course_id === c.id).map((m) => {
              const who = data.profiles.find((p) => p.id === m.student_id);
              const sess = data.sessions.find((s) => s.id === m.session_id);
              return (
                <li key={m.id}>
                  <div className="rowlink material-row">
                    <span className="tag plain">{KIND_LABEL[m.kind]}</span>
                    <span className="grow"><a className="strong" href={m.url} target="_blank" rel="noopener noreferrer">{m.title}</a>{m.description && <span className="muted small" style={{ display: 'block' }}>{m.description}</span>}</span>
                    <span className="small muted aud">{m.student_id ? (me.role === 'student' ? 'Khusus kamu' : `Hanya ${nameOf(who)}`) : 'Semua peserta'}{sess ? ` · ${sess.code}` : ''} · {fmt(m.created_at, 'd MMM')}</span>
                    <span className="row act"><a className="btn sm" href={m.url} target="_blank" rel="noopener noreferrer">Buka</a>{admin && <button className="btn sm quiet" onClick={() => setEdit(m)}>Ubah</button>}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {edit && <MaterialDialog material={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}
