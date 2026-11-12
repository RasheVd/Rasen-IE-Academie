import { Link } from 'react-router-dom';
import { GainBar, GainLegend, ScoreChart, fmt, nameOf, signed } from '../components/bits';
import { Empty, colorVar } from '../components/ui';
import { courseProgress, studentCourseIds, studentSummary } from '../domain/progress';
import { ATT_LABEL, type Data, type Enrollment } from '../domain/types';
import { useNow, useTitle } from '../hooks';
import { useData, useMe } from '../store';

/** Blok progres satu mata kuliah untuk satu peserta. Dipakai juga di halaman detail peserta. */
export function CourseBlock({ data, studentId, courseId, now, onEditEnrollment }: { data: Data; studentId: string; courseId: string; now: number; onEditEnrollment?: (e: Enrollment) => void }) {
  const c = data.courses.find((x) => x.id === courseId);
  if (!c) return null;
  const p = courseProgress(data, studentId, courseId, now);
  const enr = data.enrollments.find((e) => e.student_id === studentId && e.course_id === courseId);
  const mentor = data.profiles.find((x) => x.id === enr?.mentor_id);
  return (
    <section className="section" id={c.code}>
      <div className="panel" style={{ borderTop: '8px solid var(--c)', ...colorVar(c.color) }}>
        <div className="pad" style={{ padding: '16px 20px' }}>
          <div className="row between wrap" style={{ marginBottom: 12 }}>
            <div className="row wrap"><span className="code">{c.code}</span><h2 className="h-section">{c.title}</h2>{enr && enr.status !== 'active' && <span className="tag plain">{enr.status === 'paused' ? 'Jeda' : 'Selesai'}</span>}</div>
            <div className="row"><span className="mono muted">{p.done} dari {p.target} sesi{mentor ? ` · ${nameOf(mentor)}` : ''}</span>{onEditEnrollment && enr && <button className="btn sm quiet" onClick={() => onEditEnrollment(enr)}>Ubah</button>}</div>
          </div>
          <GainBar pre={p.avgPre} post={p.avgPost} />
          <div className="stats" style={{ marginTop: 14 }}>
            <div className="stat"><span className="v">{p.avgPre ?? '–'}</span><span className="l">Rata-rata pretest</span></div>
            <div className="stat"><span className="v">{p.avgPost ?? '–'}</span><span className="l">Rata-rata posttest</span></div>
            <div className="stat"><span className={`v ${p.gain == null ? '' : p.gain >= 0 ? 'up' : 'down'}`}>{signed(p.gain)}</span><span className="l">Kenaikan per sesi</span></div>
            <div className="stat"><span className="v">{p.done ? `${p.attended}/${p.done}` : '–'}</span><span className="l">Kehadiran</span></div>
          </div>
        </div>
        <div style={{ padding: '4px 20px 16px' }}><ScoreChart points={p.points} /></div>
        {p.points.length > 0 && (
          <div className="table-wrap" style={{ border: 0, borderTop: '1.5px solid var(--ink)' }}>
            <table className="table">
              <thead><tr><th>Sesi</th><th>Tanggal</th><th>Topik</th><th>Kehadiran</th><th className="r">Pre</th><th className="r">Post</th><th className="r">Selisih</th></tr></thead>
              <tbody>{p.points.map((pt) => {
                const g = pt.pre != null && pt.post != null ? Math.round((pt.post - pt.pre) * 10) / 10 : null;
                return <tr key={pt.session.id}><td><Link to={`/sesi/${pt.session.id}`} className="code">{pt.session.code}</Link></td><td className="mono">{fmt(pt.session.starts_at, 'd MMM')}</td><td>{pt.session.topic || '–'}</td><td>{pt.attendance ? ATT_LABEL[pt.attendance] : '–'}</td><td className="num">{pt.pre ?? '–'}</td><td className="num">{pt.post ?? '–'}</td><td className={`num ${g == null ? '' : g >= 0 ? 'up' : 'down'}`}>{signed(g)}</td></tr>;
              })}</tbody>
            </table>
          </div>
        )}
        {p.next && <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line)' }} className="small">Sesi berikutnya: <Link to={`/sesi/${p.next.id}`} className="strong">{fmt(p.next.starts_at, 'EEEE, d MMM, HH.mm')}</Link></div>}
      </div>
    </section>
  );
}

export default function Progress() {
  const me = useMe(), data = useData(), now = useNow();
  useTitle('Progres');
  const ids = studentCourseIds(data, me.id);
  const sum = studentSummary(data, me.id, now);
  return (
    <>
      <header className="page-head">
        <div><div className="eyebrow"><span className="mono">{sum.done} sesi selesai · {ids.length} mata kuliah</span></div><h1 className="page-title">Progres</h1></div>
        <div className="actions"><GainLegend /></div>
      </header>
      {ids.length === 0 ? <Empty title="Belum ada progres">Progres dihitung dari nilai pretest dan posttest tiap sesi. Setelah sesi pertamamu selesai dan mentor mengisi nilai, hasilnya tampil di sini.</Empty> : ids.map((id) => <CourseBlock key={id} data={data} studentId={me.id} courseId={id} now={now} />)}
    </>
  );
}
