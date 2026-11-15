import { useState } from 'react';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { Field, InlineInput, Modal, confirmDialog, colorVar } from '../../components/ui';
import { useAction } from '../../components/bits';
import { moveTopic, removeTopic, saveCourse, saveTopic, useData } from '../../store';
import { useTitle } from '../../hooks';
import { COURSE_COLORS, groupCourses, type Course, type CourseColor, type Data } from '../../domain/types';

export default function Catalog() {
  useTitle('Katalog');
  const data = useData();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Course> | null>(null);
  const n = q.trim().toLowerCase();
  const list = data.courses.filter((c) => !n || c.title.toLowerCase().includes(n) || c.code.toLowerCase().includes(n));
  const cats = [...new Set(data.courses.map((c) => c.category))];
  const groups = groupCourses(list);
  return (
    <Shell title="Katalog">
      <div className="page-head">
        <div><h1 className="h-page">Katalog mata kuliah</h1><p className="lead">Satu-satunya tempat nama mata kuliah dan topik dibuat. Mentor dan peserta hanya memilih dari sini, jadi tidak ada "statistika" vs "Statistika".</p></div>
        <button className="btn primary" onClick={() => setEditing({ color: 'teal', category: cats[0] ?? 'Lainnya' })}><Icon name="plus" />Mata kuliah</button>
      </div>
      <input className="input" style={{ maxWidth: 320 }} placeholder="Cari mata kuliah" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari mata kuliah" />
      {groups.map(([cat, items]) => (
        <section key={cat} className="card flush">
          <div className="eyebrow" style={{ padding: '14px 16px 6px' }}>{cat} · {items.length}</div>
          {items.map((c) => {
            const topics = data.topics.filter((t) => t.course_id === c.id);
            const isOpen = open === c.id;
            return (
              <div key={c.id} style={{ borderTop: '1px solid var(--line)' }}>
                <div className="row" style={{ padding: '10px 16px' }}>
                  <button className="link-btn row grow" style={{ textDecoration: 'none', color: 'inherit', textAlign: 'left' }} onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen}>
                    <Icon name={isOpen ? 'chevD' : 'chevR'} size={14} />
                    <span className="chip" style={colorVar(c.color)}>{c.code}</span>
                    <span className="strong">{c.title}</span>
                    <span className="small muted">{c.category}</span>
                    {!c.active && <span className="pill">Nonaktif</span>}
                    <span className="small muted ml-auto">{topics.length} topik · {topics.filter((t) => t.pretest_url && t.posttest_url).length} lengkap tesnya</span>
                  </button>
                  <button className="btn ghost icon sm" aria-label={`Ubah ${c.title}`} onClick={() => setEditing(c)}><Icon name="edit" /></button>
                </div>
                {isOpen && <TopicEditor course={c} data={data} />}
              </div>
            );
          })}
        </section>
      ))}
      {editing && <CourseForm initial={editing} data={data} onClose={() => setEditing(null)} />}
    </Shell>
  );
}

function TopicEditor({ course, data }: { course: Course; data: Data }) {
  const { busy, run } = useAction();
  const [title, setTitle] = useState('');
  const topics = data.topics.filter((t) => t.course_id === course.id).sort((a, b) => a.position - b.position);
  const urlOk = (v: string) => v === '' || /^https?:\/\//i.test(v.trim());
  return (
    <div style={{ padding: '4px 16px 16px', background: '#fafbfb' }}>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>#</th><th>Topik</th><th>Tautan pretest (Google Form)</th><th>Tautan posttest</th><th /></tr></thead>
          <tbody>
            {topics.map((t, i) => (
              <tr key={t.id}>
                <td className="muted num">{i + 1}</td>
                <td style={{ minWidth: 200 }}><InlineInput className="input sm" value={t.title} ariaLabel="Nama topik" onCommit={(v) => v.trim().length > 1 && run('t', () => saveTopic({ id: t.id, title: v }))} /></td>
                <td style={{ minWidth: 200 }}><InlineInput className="input sm" value={t.pretest_url} placeholder="https://forms.gle/…" ariaLabel={`Pretest ${t.title}`} onCommit={(v) => urlOk(v) ? run('p', () => saveTopic({ id: t.id, pretest_url: v }), 'Tautan pretest tersimpan.') : undefined} /></td>
                <td style={{ minWidth: 200 }}><InlineInput className="input sm" value={t.posttest_url} placeholder="https://forms.gle/…" ariaLabel={`Posttest ${t.title}`} onCommit={(v) => urlOk(v) ? run('q', () => saveTopic({ id: t.id, posttest_url: v }), 'Tautan posttest tersimpan.') : undefined} /></td>
                <td className="nowrap">
                  <button className="btn ghost icon sm" aria-label="Naikkan" disabled={i === 0 || !!busy} onClick={() => run('u', () => moveTopic(t, -1))}><Icon name="arrowUp" size={14} /></button>
                  <button className="btn ghost icon sm" aria-label="Turunkan" disabled={i === topics.length - 1 || !!busy} onClick={() => run('d', () => moveTopic(t, 1))}><Icon name="arrowDown" size={14} /></button>
                  <button className="btn ghost icon sm" aria-label={`Hapus ${t.title}`} onClick={async () => {
                    const used = data.sessions.filter((s) => s.topic_id === t.id).length;
                    if (await confirmDialog({ title: 'Hapus topik?', body: used ? `${t.title} dipakai ${used} sesi. Nilai sesi itu tidak lagi terhubung ke topik ini di dasbor.` : t.title, confirm: 'Hapus', danger: true }))
                      run('x', () => removeTopic(t.id), 'Topik dihapus.');
                  }}><Icon name="trash" size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="row wrap" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); if (title.trim().length > 1) run('a', async () => { await saveTopic({ course_id: course.id, title, position: topics.length + 1 }); setTitle(''); }, 'Topik ditambahkan.'); }}>
        <input className="input sm" style={{ maxWidth: 320 }} placeholder="Topik baru" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Topik baru" />
        <button className="btn sm" disabled={title.trim().length < 2 || !!busy}><Icon name="plus" size={14} />Tambah topik</button>
      </form>
      <p className="tiny muted" style={{ marginTop: 8 }}>Tautan tes tampil di halaman sesi dan di deskripsi acara Google Calendar. Admin bisa menimpa tautan untuk sesi tertentu.</p>
    </div>
  );
}

function CourseForm({ initial, data, onClose }: { initial: Partial<Course>; data: Data; onClose: () => void }) {
  const { busy, run } = useAction();
  const cats = [...new Set(data.courses.map((c) => c.category))];
  const [f, setF] = useState({ code: initial.code ?? '', title: initial.title ?? '', category: initial.category ?? 'Lainnya', newCat: '', description: initial.description ?? '', color: (initial.color ?? 'teal') as CourseColor, active: initial.active ?? true, semester: initial.semester ?? null as number | null, kind: (initial.kind ?? 'wajib') as 'wajib' | 'pilihan' });
  const category = f.category === '__new' ? f.newCat.trim() : f.category;
  const similar = data.courses.find((c) => c.id !== initial.id && c.title.trim().toLowerCase().replace(/\s+/g, ' ') === f.title.trim().toLowerCase().replace(/\s+/g, ' '));
  const valid = f.code.trim() && f.title.trim().length > 1 && category && !similar;
  return (
    <Modal title={initial.id ? 'Ubah mata kuliah' : 'Mata kuliah baru'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Batal</button>
      <button className="btn primary" disabled={!valid || !!busy} onClick={() => run('s', async () => { await saveCourse({ id: initial.id, code: f.code, title: f.title, category, description: f.description.trim(), color: f.color, active: f.active, semester: f.kind === 'pilihan' ? null : f.semester, kind: f.kind }); onClose(); }, 'Mata kuliah tersimpan.')}>Simpan</button>
    </>}>
      <div className="form-grid">
        <Field label="Kode" hint="Unik, dipakai di kode sesi (mis. STI1-0001).">{(id) => <input id={id} className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/\s+/g, '') })} />}</Field>
        <Field label="Nama" error={similar ? `Sudah ada: ${similar.code} · ${similar.title}` : undefined}>{(id) => <input id={id} className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
        <Field label="Kelompok">{(id) => (
          <select id={id} className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}<option value="__new">Kelompok baru…</option>
          </select>
        )}</Field>
        {f.category === '__new' ? <Field label="Nama kelompok baru">{(id) => <input id={id} className="input" value={f.newCat} onChange={(e) => setF({ ...f, newCat: e.target.value })} />}</Field> : <div />}
        <Field label="Jenis">{(id) => (
          <select id={id} className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'wajib' | 'pilihan' })}><option value="wajib">Wajib</option><option value="pilihan">Pilihan</option></select>
        )}</Field>
        <Field label="Semester" hint="Kosongkan untuk mata kuliah umum atau pilihan.">{(id) => (
          <select id={id} className="select" value={f.semester ?? ''} disabled={f.kind === 'pilihan'} onChange={(e) => setF({ ...f, semester: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Umum</option>{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>Semester {n}</option>)}
          </select>
        )}</Field>
        <Field label="Warna" className="full">{() => (
          <div className="row wrap">
            {COURSE_COLORS.map((c) => <button key={c} type="button" className="btn icon sm" aria-label={c} aria-pressed={f.color === c} onClick={() => setF({ ...f, color: c })} style={{ background: `var(--${c})`, borderColor: f.color === c ? 'var(--ink)' : 'transparent', borderWidth: 2 }} />)}
          </div>
        )}</Field>
        <Field label="Deskripsi" className="full">{(id) => <textarea id={id} className="textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
        {initial.id && <label className="check full"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Aktif (nonaktifkan untuk menyembunyikan dari pilihan baru)</label>}
      </div>
    </Modal>
  );
}
