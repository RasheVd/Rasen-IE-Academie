import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GainBar, GainLegend, ProgressCard, SessionDays, fmt, fmtDay, fmtTime, nameOf, signed } from '../components/bits';
import { SessionDialog } from '../components/dialogs';
import { Empty } from '../components/ui';
import { avg, courseOverview, courseProgress, endOf, reportsDue, studentCourseIds } from '../domain/progress';
import { KIND_LABEL } from '../domain/types';
import { useNow, useTitle } from '../hooks';
import { useData, useMe } from '../store';

export default function Home() {
  const me = useMe();
  useTitle('Beranda');
  return me.role === 'student' ? <StudentHome /> : me.role === 'mentor' ? <MentorHome /> : <AdminHome />;
}

const hello = () => { const h = new Date().getHours(); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam'; };

/* ── Peserta ─────────────────────────────────────────────── */
function StudentHome() {
  const me = useMe(), data = useData(), now = useNow();
  const upcoming = data.sessions.filter((s) => s.status === 'scheduled' && endOf(s) >= now);
  const next = upcoming[0];
  const course = (id: string) => data.courses.find((c) => c.id === id);
  const progress = studentCourseIds(data, me.id).map((c) => ({ course: course(c), p: courseProgress(data, me.id, c, now) })).filter((x) => x.course);
  const lastDone = [...data.sessions].reverse().find((s) => s.status === 'done' || (s.status === 'scheduled' && endOf(s) < now));
  const materials = data.materials.slice(0, 5);
  const started = next && new Date(next.starts_at).getTime() <= now;

  return (
    <>
      <header className="page-head">
        <div><div className="eyebrow"><span className="mono">{fmt(new Date(), 'EEEE, d MMMM yyyy')}</span></div><h1 className="page-title">{hello()},<br />{nameOf(me).split(' ')[0]}</h1></div>
      </header>

      <section className="section">
        <div className="section-head"><h2 className="h-section">Sesi berikutnya</h2><Link className="link" to="/jadwal">Semua jadwal</Link></div>
        {next ? (
          <div className="next">
            <div className="when">
              <span className="mono">{started ? 'Sedang berlangsung' : fmt(next.starts_at, 'd MMMM yyyy')}</span>
              <span className="big">{fmtDay(next.starts_at)}<br />{fmtTime(next.starts_at)}</span>
              <span className="mono">{next.duration_min} menit · {next.place || 'Tempat menyusul'}</span>
            </div>
            <div className="what">
              <div className="row wrap"><span className="code">{next.code}</span><span className="tag plain">{next.mode === 'private' ? 'Private' : 'Kelas bersama'}</span></div>
              <div className="title">{course(next.course_id)?.title}{next.topic ? `: ${next.topic}` : ''}</div>
              <div className="muted">Mentor: {nameOf(data.profiles.find((p) => p.id === next.mentor_id))}</div>
              <div className="row wrap" style={{ marginTop: 'auto' }}>
                {next.pretest_url && <a className="btn orange" href={next.pretest_url} target="_blank" rel="noopener noreferrer">Kerjakan pretest</a>}
                <Link className="btn" to={`/sesi/${next.id}`}>Lihat sesi</Link>
              </div>
            </div>
          </div>
        ) : <Empty title="Belum ada sesi terjadwal">Jadwal muncul di sini setelah admin menyusunnya. Hubungi admin bila kamu sudah membayar tetapi jadwal belum ada.</Empty>}
        {lastDone?.posttest_url && data.links.some((l) => l.session_id === lastDone.id && l.posttest_score == null) && (
          <div className="banner" style={{ marginTop: 16, marginBottom: 0 }}><span className="grow">Posttest sesi <b>{lastDone.code}</b> belum ada nilainya.</span><a className="btn green sm" href={lastDone.posttest_url} target="_blank" rel="noopener noreferrer">Kerjakan posttest</a></div>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2 className="h-section">Progres per mata kuliah</h2><GainLegend /></div>
        {progress.length === 0 ? <Empty title="Belum terdaftar di mata kuliah">Admin mendaftarkanmu ke mata kuliah yang kamu ambil. Setelah itu progresmu tampil di sini.</Empty> : (
          <div className="cards stagger">{progress.map(({ course: c, p }) => <ProgressCard key={c!.id} course={c!} p={p} to={`/progres#${c!.code}`} />)}</div>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2 className="h-section">Materi terbaru</h2><Link className="link" to="/materi">Semua materi</Link></div>
        {materials.length === 0 ? <p className="muted">Belum ada materi untukmu.</p> : (
          <ul className="list stagger">{materials.map((m) => (
            <li key={m.id}><a className="rowlink material-row" href={m.url} target="_blank" rel="noopener noreferrer">
              <span className="tag plain">{KIND_LABEL[m.kind]}</span><span className="strong ellipsis">{m.title}</span><span className="muted small aud">{course(m.course_id)?.code}{m.student_id ? ' · khusus kamu' : ''}</span><span className="mono muted act">Buka</span>
            </a></li>
          ))}</ul>
        )}
      </section>
    </>
  );
}

/* ── Mentor ──────────────────────────────────────────────── */
function MentorHome() {
  const me = useMe(), data = useData(), now = useNow();
  const due = reportsDue(data, now, me.id);
  const upcoming = data.sessions.filter((s) => s.mentor_id === me.id && s.status === 'scheduled' && endOf(s) >= now).slice(0, 8);
  const students = new Set(data.links.filter((l) => data.sessions.some((s) => s.id === l.session_id && s.mentor_id === me.id)).map((l) => l.student_id));
  const doneCount = data.sessions.filter((s) => s.mentor_id === me.id && s.status === 'done').length;
  return (
    <>
      <header className="page-head">
        <div><div className="eyebrow"><span className="mono">{fmt(new Date(), 'EEEE, d MMMM yyyy')}</span></div><h1 className="page-title">{hello()},<br />{nameOf(me).split(' ')[0]}</h1></div>
      </header>
      <section className="section">
        <div className="stats">
          <div className="stat"><span className="v">{upcoming.length}</span><span className="l">Sesi mendatang</span></div>
          <div className={`stat ${due.length ? 'alert' : ''}`}><span className="v">{due.length}</span><span className="l">Laporan belum diisi</span></div>
          <div className="stat"><span className="v">{students.size}</span><span className="l">Peserta kamu</span></div>
          <div className="stat"><span className="v">{doneCount}</span><span className="l">Sesi terlaksana</span></div>
        </div>
      </section>
      {due.length > 0 && (
        <section className="section">
          <div className="section-head"><h2 className="h-section">Laporan yang harus diisi</h2><span className="mono muted">Batas 24 jam setelah sesi</span></div>
          <SessionDays sessions={due} data={data} dueIds={new Set(due.map((s) => s.id))} />
        </section>
      )}
      <section className="section">
        <div className="section-head"><h2 className="h-section">Sesi mendatang</h2><Link className="link" to="/jadwal">Semua jadwal</Link></div>
        {upcoming.length === 0 ? <Empty title="Tidak ada sesi mendatang">Admin menugaskan sesi untukmu lewat jadwal induk.</Empty> : <SessionDays sessions={upcoming} data={data} />}
      </section>
    </>
  );
}

/* ── Admin ───────────────────────────────────────────────── */
function AdminHome() {
  const data = useData(), now = useNow();
  const [add, setAdd] = useState(false);
  const due = useMemo(() => reportsDue(data, now), [data, now]);
  const weekEnd = now + 7 * 864e5;
  const week = data.sessions.filter((s) => s.status === 'scheduled' && endOf(s) >= now && new Date(s.starts_at).getTime() <= weekEnd);
  const activeStudents = data.profiles.filter((p) => p.role === 'student' && p.active).length;
  const scored = data.links.filter((l) => l.pretest_score != null && l.posttest_score != null);
  const gain = scored.length ? Math.round((avg(scored.map((l) => l.posttest_score))! - avg(scored.map((l) => l.pretest_score))!) * 10) / 10 : null;
  const overview = data.courses.filter((c) => c.active).map((c) => ({ c, o: courseOverview(data, c.id) }));
  const fresh = data.courses.length === 0 && activeStudents === 0;

  return (
    <>
      <header className="page-head">
        <div><div className="eyebrow"><span className="mono">{fmt(new Date(), 'EEEE, d MMMM yyyy')}</span></div><h1 className="page-title">Dasbor admin</h1></div>
        <div className="actions"><button className="btn primary" onClick={() => setAdd(true)}>Tambah sesi</button></div>
      </header>

      {fresh && (
        <div className="banner">
          <span className="grow"><b>Mulai dari sini.</b> Tambah mata kuliah, lalu mentor dan peserta, lalu susun sesi pertama.</span>
          <Link className="btn sm" to="/matkul">1. Mata kuliah</Link><Link className="btn sm" to="/mentor">2. Mentor</Link><Link className="btn sm" to="/peserta">3. Peserta</Link>
        </div>
      )}

      <section className="section">
        <div className="stats">
          <div className="stat"><span className="v">{activeStudents}</span><span className="l">Peserta aktif</span></div>
          <div className="stat"><span className="v">{week.length}</span><span className="l">Sesi 7 hari ke depan</span></div>
          <div className={`stat ${due.length ? 'alert' : ''}`}><span className="v">{due.length}</span><span className="l">Laporan belum diisi</span></div>
          <div className="stat"><span className={`v ${gain == null ? '' : gain >= 0 ? 'up' : 'down'}`}>{signed(gain)}</span><span className="l">Rata-rata kenaikan nilai</span></div>
        </div>
      </section>

      <div className="split">
        <div>
          {due.length > 0 && (
            <section className="section">
              <div className="section-head"><h2 className="h-section">Laporan belum diisi</h2></div>
              <SessionDays sessions={due.slice(0, 6)} data={data} dueIds={new Set(due.map((s) => s.id))} />
            </section>
          )}
          <section className="section">
            <div className="section-head"><h2 className="h-section">Jadwal 7 hari ke depan</h2><Link className="link" to="/jadwal">Jadwal induk</Link></div>
            {week.length === 0 ? <Empty title="Belum ada sesi minggu ini" action={<button className="btn primary" onClick={() => setAdd(true)}>Tambah sesi</button>}>Sesi yang kamu tulis di sini langsung terlihat oleh mentor dan pesertanya.</Empty> : <SessionDays sessions={week} data={data} />}
          </section>
        </div>
        <section className="section">
          <div className="section-head"><h2 className="h-section">Progres per mata kuliah</h2></div>
          {overview.length === 0 ? <p className="muted">Belum ada mata kuliah.</p> : (
            <div className="panel">
              {overview.map(({ c, o }) => (
                <div key={c.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
                  <div className="row between" style={{ marginBottom: 8 }}><span className="row grow"><span className="swatch" style={{ background: `var(--${c.color})` }} /><span className="strong">{c.code}</span><span className="muted small ellipsis">{c.title}</span></span><span className="mono muted" style={{ whiteSpace: 'nowrap' }}>{o.students} peserta · {o.sessionsDone} sesi</span></div>
                  <GainBar pre={o.avgPre} post={o.avgPost} compact />
                </div>
              ))}
              <div style={{ padding: '12px 16px' }}><GainLegend /></div>
            </div>
          )}
        </section>
      </div>
      {add && <SessionDialog onClose={() => setAdd(false)} />}
    </>
  );
}
