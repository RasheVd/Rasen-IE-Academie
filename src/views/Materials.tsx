import { useState } from 'react';
import { Shell } from '../components/Shell';
import { Icon } from '../components/Icon';
import { Field, Modal, Empty, confirmDialog } from '../components/ui';
import { CourseChip, ExtLink, useAction } from '../components/bits';
import { removeMaterial, saveMaterial, useData, useMe } from '../store';
import { useTitle } from '../hooks';
import { shortDate, toLocal } from '../domain/time';
import { KIND_LABEL, type Data, type Material, type MaterialKind, type Profile } from '../domain/types';

export default function Materials() {
  useTitle('Materi');
  const me = useMe();
  const data = useData();
  const [editing, setEditing] = useState<Partial<Material> | null>(null);
  const [course, setCourse] = useState('');
  const pending = data.materials.filter((m) => m.status === 'pending');
  const mine = data.materials.filter((m) => m.created_by === me.id && m.status !== 'approved');
  const visible = data.materials.filter((m) => m.status === 'approved' && (!course || m.course_id === course));
  const byCourse = new Map<string, Material[]>();
  for (const m of visible) (byCourse.get(m.course_id) ?? byCourse.set(m.course_id, []).get(m.course_id)!).push(m);
  const canAdd = me.role === 'admin' || (me.role === 'mentor' && data.mentorCourses.some((x) => x.mentor_id === me.id && x.status === 'approved'));

  return (
    <Shell title="Materi">
      <div className="page-head">
        <div>
          <h1 className="h-page">Materi</h1>
          <p className="lead">{me.role === 'student' ? 'PPT, latihan, dan tautan untuk mata kuliahmu.' : me.role === 'mentor' ? 'Bahan dari pengelola, dan bahan buatanmu (tayang setelah ditinjau admin).' : 'Materi per mata kuliah, topik, sesi, atau peserta tertentu.'}</p>
        </div>
        {canAdd && <button className="btn primary" onClick={() => setEditing({ kind: me.role === 'mentor' ? 'latihan' : 'ppt' })}><Icon name="plus" />{me.role === 'mentor' ? 'Usulkan bahan' : 'Tambah materi'}</button>}
      </div>

      {me.role === 'admin' && pending.length > 0 && (
        <section className="card">
          <div className="card-head"><div className="h-card">Menunggu tinjauan ({pending.length})</div><span className="sub">Bahan dari mentor, belum terlihat peserta</span></div>
          <div className="list">{pending.map((m) => <ReviewRow key={m.id} m={m} data={data} />)}</div>
        </section>
      )}
      {me.role === 'mentor' && mine.length > 0 && (
        <section className="card">
          <div className="card-head"><div className="h-card">Usulanmu</div></div>
          <div className="list">
            {mine.map((m) => (
              <div key={m.id} className="list-item">
                <span className={`pill ${m.status === 'pending' ? 'warn' : 'bad'}`}>{m.status === 'pending' ? 'Ditinjau' : 'Ditolak'}</span>
                <div className="grow"><div className="t">{m.title}</div><div className="meta">{data.courses.find((c) => c.id === m.course_id)?.title}{m.review_note ? ` · Catatan admin: ${m.review_note}` : ''}</div></div>
                <ExtLink href={m.url}>Buka</ExtLink>
                <RemoveButton m={m} />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="row wrap">
        <select className="select sm" style={{ width: 260 }} value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Filter mata kuliah">
          <option value="">Semua mata kuliah</option>
          {data.courses.filter((c) => data.materials.some((m) => m.course_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
        </select>
      </div>
      {byCourse.size === 0 && <div className="card"><Empty title="Belum ada materi">{me.role === 'student' ? 'Materi muncul di sini paling lambat H-2 sebelum sesi.' : 'Tambahkan materi untuk peserta.'}</Empty></div>}
      {[...byCourse.entries()].map(([cid, list]) => (
        <section key={cid} className="card">
          <div className="card-head"><CourseChip course={data.courses.find((c) => c.id === cid)} /></div>
          <div className="list">
            {list.map((m) => {
              const topic = data.topics.find((t) => t.id === m.topic_id);
              const student = m.student_id ? data.profiles.find((p) => p.id === m.student_id) : null;
              const sess = m.session_id ? data.sessions.find((x) => x.id === m.session_id) : null;
              return (
                <div key={m.id} className="list-item">
                  <span className="pill brand">{KIND_LABEL[m.kind]}</span>
                  <div className="grow">
                    <div className="t">{m.title}</div>
                    <div className="meta">
                      {topic ? topic.title : 'Semua topik'}{student ? ` · khusus ${student.full_name}` : ''}{sess ? ` · sesi ${sess.code}` : ''} · {shortDate(toLocal(m.created_at).date)}
                      {m.description ? ` · ${m.description}` : ''}
                    </div>
                  </div>
                  <ExtLink href={m.url}>Buka</ExtLink>
                  {me.role === 'admin' && <><button className="btn ghost icon sm" aria-label="Ubah" onClick={() => setEditing(m)}><Icon name="edit" /></button><RemoveButton m={m} /></>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {editing && <MaterialForm initial={editing} data={data} me={me} onClose={() => setEditing(null)} />}
    </Shell>
  );
}

function RemoveButton({ m }: { m: Material }) {
  const { run } = useAction();
  return (
    <button className="btn ghost icon sm" aria-label={`Hapus ${m.title}`} onClick={async () => {
      if (await confirmDialog({ title: 'Hapus materi?', body: m.title, confirm: 'Hapus', danger: true })) run('d', () => removeMaterial(m.id), 'Materi dihapus.');
    }}><Icon name="trash" /></button>
  );
}

function ReviewRow({ m, data }: { m: Material; data: Data }) {
  const { busy, run } = useAction();
  const who = data.profiles.find((p) => p.id === m.created_by);
  return (
    <div className="list-item">
      <span className="pill brand">{KIND_LABEL[m.kind]}</span>
      <div className="grow"><div className="t">{m.title}</div><div className="meta">{who?.full_name} · {data.courses.find((c) => c.id === m.course_id)?.title}{m.topic_id ? ` · ${data.topics.find((t) => t.id === m.topic_id)?.title}` : ''}{m.description ? ` · ${m.description}` : ''}</div></div>
      <ExtLink href={m.url}>Periksa</ExtLink>
      <button className="btn sm danger" disabled={!!busy} onClick={() => {
        const note = window.prompt('Catatan untuk mentor:', 'Perlu diperbaiki: ');
        if (note !== null) run('r', () => saveMaterial({ id: m.id, status: 'rejected', review_note: note }), 'Bahan ditolak.');
      }}>Tolak</button>
      <button className="btn sm primary" disabled={!!busy} onClick={() => run('a', () => saveMaterial({ id: m.id, status: 'approved', review_note: '' }), 'Bahan disetujui dan tayang.')}>Setujui</button>
    </div>
  );
}

function MaterialForm({ initial, data, me, onClose }: { initial: Partial<Material>; data: Data; me: Profile; onClose: () => void }) {
  const { busy, run } = useAction();
  const [f, setF] = useState({
    course_id: initial.course_id ?? '', topic_id: initial.topic_id ?? '', student_id: initial.student_id ?? '', session_id: initial.session_id ?? '',
    title: initial.title ?? '', kind: (initial.kind ?? 'ppt') as MaterialKind, url: initial.url ?? '', description: initial.description ?? '',
  });
  const courses = me.role === 'mentor'
    ? data.courses.filter((c) => data.mentorCourses.some((x) => x.mentor_id === me.id && x.course_id === c.id && x.status === 'approved'))
    : data.courses;
  const students = data.profiles.filter((p) => p.role === 'student' && data.enrollments.some((e) => e.student_id === p.id && e.course_id === f.course_id));
  const sessions = data.sessions.filter((s) => s.course_id === f.course_id && s.status === 'scheduled');
  const valid = f.course_id && f.title.trim().length > 1 && /^https?:\/\//i.test(f.url.trim());
  const save = () => run('s', async () => {
    await saveMaterial({
      id: initial.id, course_id: f.course_id, topic_id: f.topic_id || null, student_id: f.student_id || null, session_id: f.session_id || null,
      title: f.title.trim(), kind: f.kind, url: f.url.trim(), description: f.description.trim(),
      ...(initial.id ? {} : { created_by: me.id, status: me.role === 'mentor' ? 'pending' : 'approved' }),
    });
    onClose();
  }, me.role === 'mentor' ? 'Terkirim. Bahan tayang setelah disetujui admin.' : 'Materi tersimpan.');
  return (
    <Modal title={initial.id ? 'Ubah materi' : me.role === 'mentor' ? 'Usulkan bahan' : 'Tambah materi'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Batal</button>
      <button className="btn primary" disabled={!valid || !!busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </>}>
      <div className="form-grid">
        <Field label="Mata kuliah">{(id) => (
          <select id={id} className="select" value={f.course_id} onChange={(e) => setF({ ...f, course_id: e.target.value, topic_id: '', student_id: '', session_id: '' })}>
            <option value="">Pilih…</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
          </select>
        )}</Field>
        <Field label="Topik">{(id) => (
          <select id={id} className="select" value={f.topic_id} onChange={(e) => setF({ ...f, topic_id: e.target.value })} disabled={!f.course_id}>
            <option value="">Semua topik</option>{data.topics.filter((t) => t.course_id === f.course_id).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        )}</Field>
        <Field label="Judul" className="full">{(id) => <input id={id} className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="PPT Uji hipotesis dua populasi" />}</Field>
        <Field label="Jenis">{(id) => (
          <select id={id} className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as MaterialKind })}>
            {(Object.keys(KIND_LABEL) as MaterialKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        )}</Field>
        <Field label="Tautan" hint="Google Drive, Slides, YouTube, dll. Pastikan bisa dibuka peserta.">{(id) => <input id={id} className="input" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://…" />}</Field>
        <Field label="Keterangan" className="full">{(id) => <input id={id} className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
        {me.role === 'admin' && f.course_id && (
          <>
            <Field label="Khusus peserta" hint="Kosongkan agar semua peserta mata kuliah ini bisa melihat.">{(id) => (
              <select id={id} className="select" value={f.student_id} onChange={(e) => setF({ ...f, student_id: e.target.value })}>
                <option value="">Semua peserta mata kuliah</option>{students.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            )}</Field>
            <Field label="Khusus sesi">{(id) => (
              <select id={id} className="select" value={f.session_id} onChange={(e) => setF({ ...f, session_id: e.target.value })}>
                <option value="">Tidak terikat sesi</option>{sessions.map((s) => <option key={s.id} value={s.id}>{s.code} · {shortDate(toLocal(s.starts_at).date)}</option>)}
              </select>
            )}</Field>
          </>
        )}
      </div>
    </Modal>
  );
}
