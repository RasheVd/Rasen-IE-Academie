import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { SessionBar, StatusTag, fmt, fmtTime, nameOf, signed } from '../components/bits';
import { MaterialDialog, ReportDialog, SessionDialog } from '../components/dialogs';
import { endOf, gcalTemplateLink, reportsDue } from '../domain/progress';
import { ATT_LABEL, KIND_LABEL } from '../domain/types';
import { useNow, useTitle } from '../hooks';
import { useData, useMe, useStore } from '../store';

export default function SessionDetail() {
  const { id = '' } = useParams();
  const me = useMe(), data = useData(), now = useNow();
  const gcal = useStore((r) => r.gcal);
  const s = data.sessions.find((x) => x.id === id);
  const [dialog, setDialog] = useState<'edit' | 'report' | 'material' | null>(null);
  useTitle(s ? s.code : 'Sesi');
  if (!s) return <Navigate to="/jadwal" replace />;
  const course = data.courses.find((c) => c.id === s.course_id);
  const mentor = data.profiles.find((p) => p.id === s.mentor_id);
  const links = data.links.filter((l) => l.session_id === s.id);
  const materials = data.materials.filter((m) => m.session_id === s.id);
  const canReport = me.role === 'admin' || (me.role === 'mentor' && s.mentor_id === me.id);
  const due = canReport && reportsDue(data, now).some((x) => x.id === s.id);
  const over = endOf(s) < now;
  const title = `IE.Academie · ${course?.code ?? ''} ${s.topic || course?.title || ''}`.trim();

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow"><Link className="link" to="/jadwal">Jadwal</Link><span className="code">{s.code}</span><StatusTag s={s} due={due} /><span className="tag plain">{s.mode === 'private' ? 'Private' : 'Kelas bersama'}</span></div>
          <h1 className="page-title">{fmt(s.starts_at, 'EEEE')}<br />{fmtTime(s.starts_at)}</h1>
        </div>
        <div className="actions">
          {canReport && <button className={`btn ${due ? 'orange' : 'primary'}`} onClick={() => setDialog('report')}>{s.status === 'done' ? 'Ubah laporan' : 'Isi laporan'}</button>}
          {me.role === 'admin' && <button className="btn" onClick={() => setDialog('edit')}>Ubah sesi</button>}
        </div>
      </header>

      <div className="split">
        <div>
          <section className="section">
            <div className="section-head"><h2 className="h-section">{course?.title}{s.topic ? `: ${s.topic}` : ''}</h2></div>
            <SessionBar />
            <div className="row wrap" style={{ marginTop: 14 }}>
              {s.pretest_url ? <a className="btn orange" href={s.pretest_url} target="_blank" rel="noopener noreferrer">{me.role === 'student' ? 'Kerjakan pretest' : 'Buka pretest'}</a> : <span className="tag plain">Tautan pretest belum diisi</span>}
              {s.posttest_url ? <a className="btn green" href={s.posttest_url} target="_blank" rel="noopener noreferrer">{me.role === 'student' ? 'Kerjakan posttest' : 'Buka posttest'}</a> : <span className="tag plain">Tautan posttest belum diisi</span>}
            </div>
          </section>

          <section className="section">
            <div className="section-head"><h2 className="h-section">{me.role === 'student' ? 'Nilai kamu' : 'Kehadiran dan nilai'}</h2>{s.reported_at && <span className="mono muted">Dilaporkan {fmt(s.reported_at, 'd MMM, HH.mm')}</span>}</div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Peserta</th><th>Kehadiran</th><th className="r">Pretest</th><th className="r">Posttest</th><th className="r">Selisih</th></tr></thead>
                <tbody>
                  {links.map((l) => {
                    const p = data.profiles.find((x) => x.id === l.student_id);
                    const g = l.pretest_score != null && l.posttest_score != null ? Math.round((l.posttest_score - l.pretest_score) * 10) / 10 : null;
                    return (
                      <tr key={l.student_id}>
                        <td className="strong">{me.role !== 'student' && p ? <Link to={`/peserta/${p.id}`}>{nameOf(p)}</Link> : nameOf(p)}</td>
                        <td>{l.attendance ? ATT_LABEL[l.attendance] : <span className="muted">Belum dicatat</span>}</td>
                        <td className="num">{l.pretest_score ?? '–'}</td>
                        <td className="num">{l.posttest_score ?? '–'}</td>
                        <td className={`num ${g == null ? '' : g >= 0 ? 'up' : 'down'}`}>{signed(g)}</td>
                      </tr>
                    );
                  })}
                  {links.length === 0 && <tr><td colSpan={5} className="muted">Belum ada peserta di sesi ini.</td></tr>}
                </tbody>
              </table>
            </div>
            {s.status === 'scheduled' && !over && <p className="small muted" style={{ marginTop: 8 }}>Nilai diisi mentor setelah sesi selesai.</p>}
          </section>

          {(s.report || s.followup) && (
            <section className="section">
              <div className="section-head"><h2 className="h-section">{s.status === 'cancelled' ? 'Alasan batal' : 'Catatan mentor'}</h2></div>
              <div className="panel pad stack">
                {s.report && <p style={{ whiteSpace: 'pre-wrap' }}>{s.report}</p>}
                {s.followup && <div><div className="field-label" style={{ marginBottom: 4 }}>Tindak lanjut</div><p style={{ whiteSpace: 'pre-wrap' }}>{s.followup}</p></div>}
              </div>
            </section>
          )}
        </div>

        <div>
          <section className="section">
            <div className="section-head"><h2 className="h-section">Rincian</h2></div>
            <div className="panel pad">
              <dl className="kv">
                <dt>Tanggal</dt><dd>{fmt(s.starts_at, 'EEEE, d MMMM yyyy')}</dd>
                <dt>Waktu</dt><dd>{fmtTime(s.starts_at)} sampai {fmt(new Date(endOf(s)), 'HH.mm')} ({s.duration_min} menit)</dd>
                <dt>Tempat</dt><dd>{/^https?:\/\//.test(s.place) ? <a href={s.place} target="_blank" rel="noopener noreferrer">{s.place}</a> : s.place || 'Belum ditentukan'}</dd>
                <dt>Mentor</dt><dd>{nameOf(mentor)}</dd>
                <dt>Mata kuliah</dt><dd>{course?.code} · {course?.title}</dd>
              </dl>
              {s.status !== 'cancelled' && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }} className="stack">
                  {s.gcal_event_id ? <span className="tag green" style={{ alignSelf: 'flex-start' }}>Sudah masuk Google Calendar</span> : <a className="btn" href={gcalTemplateLink(s, title)} target="_blank" rel="noopener noreferrer">Tambah ke Google Calendar</a>}
                  {!s.gcal_event_id && me.role === 'admin' && !gcal?.connected && <p className="small muted">Sambungkan Google Calendar di <Link to="/pengaturan">Pengaturan</Link> supaya sesi masuk otomatis ke kalender mentor dan peserta.</p>}
                </div>
              )}
            </div>
          </section>

          <section className="section">
            <div className="section-head"><h2 className="h-section">Materi sesi</h2>{me.role === 'admin' && <button className="btn sm" onClick={() => setDialog('material')}>Tambah</button>}</div>
            {materials.length === 0 ? <p className="muted">{me.role === 'admin' ? 'Belum ada materi. PPT disediakan paling lambat H-2.' : 'Belum ada materi untuk sesi ini.'}</p> : (
              <ul className="list">{materials.map((m) => (
                <li key={m.id}><a className="rowlink" style={{ gridTemplateColumns: '64px minmax(0,1fr)' }} href={m.url} target="_blank" rel="noopener noreferrer"><span className="tag plain">{KIND_LABEL[m.kind]}</span><span><span className="strong">{m.title}</span>{m.description && <span className="muted small" style={{ display: 'block' }}>{m.description}</span>}</span></a></li>
              ))}</ul>
            )}
          </section>
        </div>
      </div>

      {dialog === 'edit' && <SessionDialog session={s} onClose={() => setDialog(null)} />}
      {dialog === 'report' && <ReportDialog session={s} onClose={() => setDialog(null)} />}
      {dialog === 'material' && <MaterialDialog preset={{ course_id: s.course_id, session_id: s.id, student_id: s.mode === 'private' ? links[0]?.student_id : undefined }} onClose={() => setDialog(null)} />}
    </>
  );
}
