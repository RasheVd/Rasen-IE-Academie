import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { GainLegend, SessionDays, fmt, nameOf } from '../components/bits';
import { EnrollDialog, MaterialDialog, PersonDialog, SessionDialog } from '../components/dialogs';
import { Empty } from '../components/ui';
import { endOf, studentCourseIds, studentSummary } from '../domain/progress';
import { KIND_LABEL, type Enrollment, type Material } from '../domain/types';
import { useNow, useTitle } from '../hooks';
import { useData, useMe } from '../store';
import { CourseBlock } from './Progress';

export default function PersonDetail() {
  const { id = '' } = useParams();
  const me = useMe(), data = useData(), now = useNow();
  const p = data.profiles.find((x) => x.id === id && x.role === 'student');
  const [dialog, setDialog] = useState<null | 'person' | 'enroll' | 'session' | 'material' | { enr: Enrollment } | { mat: Material }>(null);
  useTitle(p ? nameOf(p) : 'Peserta');
  if (!p) return <Navigate to="/peserta" replace />;
  const admin = me.role === 'admin';
  const ids = studentCourseIds(data, p.id);
  const sum = studentSummary(data, p.id, now);
  const mySessions = new Set(data.links.filter((l) => l.student_id === p.id).map((l) => l.session_id));
  const upcoming = data.sessions.filter((s) => mySessions.has(s.id) && s.status === 'scheduled' && endOf(s) >= now);
  const enrolledCourses = new Set(data.enrollments.filter((e) => e.student_id === p.id).map((e) => e.course_id));
  const materials = data.materials.filter((m) => m.student_id === p.id || (m.student_id == null && enrolledCourses.has(m.course_id)));
  const code = (cid: string) => data.courses.find((c) => c.id === cid)?.code;

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow"><Link className="link" to="/peserta">Peserta</Link><span className="mono">{p.email}</span>{!p.user_id && <span className="tag yellow">Belum membuat akun</span>}{!p.active && <span className="tag plain">Nonaktif</span>}</div>
          <h1 className="page-title">{nameOf(p)}</h1>
          {p.note && <p className="muted" style={{ marginTop: 8 }}>{p.note}</p>}
        </div>
        {admin && (
          <div className="actions">
            <button className="btn primary" onClick={() => setDialog('session')}>Tambah sesi</button>
            <button className="btn" onClick={() => setDialog('material')} disabled={data.courses.length === 0}>Tambah materi</button>
            <button className="btn" onClick={() => setDialog('enroll')}>Daftarkan mata kuliah</button>
            <button className="btn quiet" onClick={() => setDialog('person')}>Ubah data</button>
          </div>
        )}
      </header>

      <section className="section">
        <div className="section-head"><h2 className="h-section">Progres per mata kuliah</h2><GainLegend /></div>
        {ids.length === 0 && <Empty title="Belum ambil mata kuliah" action={admin ? <button className="btn primary" onClick={() => setDialog('enroll')}>Daftarkan mata kuliah</button> : undefined}>Daftarkan peserta ke mata kuliah yang ia ambil. Progresnya dihitung per mata kuliah dari nilai pretest dan posttest.</Empty>}
      </section>
      {ids.map((cid) => <CourseBlock key={cid} data={data} studentId={p.id} courseId={cid} now={now} onEditEnrollment={admin ? (enr) => setDialog({ enr }) : undefined} />)}

      <div className="split">
        <section className="section">
          <div className="section-head"><h2 className="h-section">Sesi mendatang</h2><span className="mono muted">{sum.done} sesi selesai</span></div>
          {upcoming.length === 0 ? <p className="muted">Tidak ada sesi terjadwal.</p> : <SessionDays sessions={upcoming} data={data} />}
        </section>
        <section className="section">
          <div className="section-head"><h2 className="h-section">Materi peserta ini</h2>{admin && data.courses.length > 0 && <button className="btn sm" onClick={() => setDialog('material')}>Tambah</button>}</div>
          {materials.length === 0 ? <p className="muted">Belum ada materi. {admin && 'Tambah materi khusus peserta ini, atau materi umum untuk mata kuliahnya.'}</p> : (
            <ul className="list">{materials.map((m) => (
              <li key={m.id}>
                <div className="rowlink" style={{ gridTemplateColumns: '64px minmax(0,1fr) auto' }}>
                  <span className="tag plain">{KIND_LABEL[m.kind]}</span>
                  <span><a className="strong" href={m.url} target="_blank" rel="noopener noreferrer">{m.title}</a><span className="muted small" style={{ display: 'block' }}>{code(m.course_id)} · {m.student_id ? 'Khusus peserta ini' : 'Semua peserta'} · {fmt(m.created_at, 'd MMM')}</span></span>
                  {admin && <button className="btn sm quiet" onClick={() => setDialog({ mat: m })}>Ubah</button>}
                </div>
              </li>
            ))}</ul>
          )}
        </section>
      </div>

      {dialog === 'person' && <PersonDialog role="student" person={p} onClose={() => setDialog(null)} />}
      {dialog === 'enroll' && <EnrollDialog studentId={p.id} onClose={() => setDialog(null)} />}
      {dialog === 'session' && <SessionDialog preset={{ student_id: p.id, course_id: [...enrolledCourses][0] }} onClose={() => setDialog(null)} />}
      {dialog === 'material' && <MaterialDialog preset={{ student_id: p.id, course_id: [...enrolledCourses][0] }} onClose={() => setDialog(null)} />}
      {dialog && typeof dialog === 'object' && 'enr' in dialog && <EnrollDialog studentId={p.id} enrollment={dialog.enr} onClose={() => setDialog(null)} />}
      {dialog && typeof dialog === 'object' && 'mat' in dialog && <MaterialDialog material={dialog.mat} onClose={() => setDialog(null)} />}
    </>
  );
}
