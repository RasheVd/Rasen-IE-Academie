import { Link } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { CourseChip, Score, StatePill, WaButton } from '../../components/bits';
import { Empty } from '../../components/ui';
import { useData, useMe } from '../../store';
import { useTitle } from '../../hooks';
import { courseProgress, stateMessage, topicProgress } from '../../domain/mastery';
import { shortDate, toLocal } from '../../domain/time';

export default function Topics() {
  useTitle('Topik & nilai');
  const me = useMe();
  const data = useData();
  const s = data.settings;
  const courses = data.courses.filter((c) => data.enrollments.some((e) => e.student_id === me.id && e.course_id === c.id));
  return (
    <Shell title="Topik & nilai">
      <div className="page-head"><div><h1 className="h-page">Topik & nilai</h1><p className="lead">Status tiap topik memakai nilai posttest terakhirmu.</p></div></div>
      <div className="row wrap small">
        <span className="pill bad">Perlu konsultasi: di bawah {s.threshold_need_help}</span>
        <span className="pill warn">Sedang dilatih: {s.threshold_need_help} sampai {s.threshold_mastered - 1}</span>
        <span className="pill ok">Dikuasai: {s.threshold_mastered} ke atas</span>
      </div>
      {!courses.length && <div className="card"><Empty title="Belum ada mata kuliah">Admin akan memasang mata kuliahmu.</Empty></div>}
      {courses.map((c) => {
        const list = topicProgress(data, me.id, c.id);
        const cp = courseProgress(data, me.id, c.id);
        const needs = list.filter((x) => x.state === 'need');
        return (
          <section key={c.id} className="card flush">
            <div className="row wrap between" style={{ padding: 16 }}>
              <div className="stack sm"><CourseChip course={c} /><div className="small muted">{cp.mastered} dari {cp.total} topik dikuasai ({cp.pct}%)</div></div>
              <Link className="btn primary sm" to={`/booking?course=${c.id}`}>Booking {c.code}</Link>
            </div>
            {needs.length > 0 && (
              <div style={{ padding: '0 16px 12px' }}>
                <div className="banner bad"><div className="grow"><div>{needs.length} topik perlu konsultasi</div><p>{stateMessage('need', s)}</p></div>
                  <WaButton phone={s.admin_whatsapp} text={`Halo admin IE.Academie, saya ${me.full_name}. Saya butuh konsultasi untuk ${c.title}: ${needs.map((n) => n.topic.title).join(', ')}.`} label="Hubungi admin" sm /></div>
              </div>
            )}
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>#</th><th>Topik</th><th>Status</th><th className="r">Pretest</th><th className="r">Posttest</th><th>Terakhir</th><th>Tes</th><th /></tr></thead>
                <tbody>
                  {list.map((p, i) => (
                    <tr key={p.topic.id}>
                      <td className="muted num">{i + 1}</td>
                      <td>{p.sessionId ? <Link to={`/sesi/${p.sessionId}`}>{p.topic.title}</Link> : p.topic.title}{p.attempts > 1 && <span className="tiny muted"> · {p.attempts} sesi</span>}</td>
                      <td><StatePill state={p.state} /></td>
                      <td className="r"><Score value={p.pre} settings={s} /></td>
                      <td className="r"><Score value={p.last} settings={s} /></td>
                      <td className="small muted nowrap">{p.lastAt ? shortDate(toLocal(p.lastAt).date) : '–'}</td>
                      <td className="small nowrap">
                        {p.topic.pretest_url && <a href={p.topic.pretest_url} target="_blank" rel="noreferrer">Pre</a>}
                        {p.topic.pretest_url && p.topic.posttest_url && ' · '}
                        {p.topic.posttest_url && <a href={p.topic.posttest_url} target="_blank" rel="noreferrer">Post</a>}
                        {!p.topic.pretest_url && !p.topic.posttest_url && <span className="faint">–</span>}
                      </td>
                      <td className="r"><Link className="btn sm" to={`/booking?course=${c.id}&topic=${p.topic.id}`}>Booking</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </Shell>
  );
}
