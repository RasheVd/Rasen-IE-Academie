import { Link } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { AdminContact, Banner, ExtLink, SessionItem } from '../../components/bits';
import { Empty } from '../../components/ui';
import { useData, useMe } from '../../store';
import { PlaceInfo } from '../../components/place';
import { useNow, useTitle } from '../../hooks';
import { longDate, timeOf, toLocal, until } from '../../domain/time';
import { MODE_LABEL } from '../../domain/types';
import { StudentDashboard } from './Dashboard';
import { CourseCard } from './Classroom';

export default function StudentHome() {
  useTitle('Dasbor');
  const me = useMe();
  const data = useData();
  const now = useNow();
  const s = data.settings;
  const mySeats = data.seats.filter((x) => x.student_id === me.id);
  const mine = data.sessions.filter((x) => mySeats.some((y) => y.session_id === x.id));
  const upcoming = mine.filter((x) => x.status === 'scheduled' && Date.parse(x.ends_at) > now).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const holds = mySeats.filter((x) => x.payment_status === 'pending' && upcoming.some((u) => u.id === x.session_id));
  const credits = data.credits.filter((c) => c.student_id === me.id && !c.used_session);
  const next = upcoming.find((x) => mySeats.find((y) => y.session_id === x.id)?.payment_status === 'paid');
  const enrolled = data.enrollments.filter((e) => e.student_id === me.id);

  return (
    <Shell title="Dasbor">
      <div className="page-head">
        <div>
          <h1 className="h-page">Halo, {me.full_name.split(' ')[0]}</h1>
          <p className="lead">{longDate(toLocal(now).date)}</p>
        </div>
        {enrolled.length > 0 && <Link className="btn primary lg" to="/booking"><Icon name="plus" />Booking sesi</Link>}
      </div>

      {holds.map((h) => {
        const sess = data.sessions.find((x) => x.id === h.session_id)!;
        const c = data.courses.find((x) => x.id === sess.course_id);
        return h.proof_path ? (
          <Banner key={h.session_id} tone="info" icon="clock" title={`Bukti bayar ${sess.code} sedang dicek admin`}>Sesi masuk Google Calendar setelah dikonfirmasi.</Banner>
        ) : (
          <Banner key={h.session_id} tone="warn" icon="card" title={`Selesaikan pembayaran ${sess.code} (${c?.code})`}
            action={<Link className="btn primary sm" to={`/sesi/${sess.id}`}>Upload bukti</Link>}>
            Slot ditahan sampai {h.hold_expires_at ? `${timeOf(h.hold_expires_at)} WIB (${until(h.hold_expires_at, now)})` : 'batas waktu'}. Lewat dari itu slot dilepas otomatis.
          </Banner>
        );
      })}
      {credits.length > 0 && (
        <Banner tone="ok" icon="star" title={`Kamu punya ${credits.length} kredit sesi`} action={<Link className="btn sm" to="/booking">Pakai sekarang</Link>}>
          Kredit terpakai otomatis saat kamu booking sesi berikutnya, tanpa perlu bayar lagi.
        </Banner>
      )}

      {enrolled.length === 0 ? (
        <div className="card">
          <Empty title="Mata kuliahmu belum dipasang" action={<AdminContact settings={s} compact text={`Halo admin IE.Academie, saya ${me.full_name}. Mohon dipasangkan mata kuliah saya.`} />}>
            Admin perlu memasang mata kuliah yang kamu ambil sebelum kamu bisa booking. Kabari admin mata kuliahnya lewat WhatsApp.
          </Empty>
        </div>
      ) : (
        <>
          <div className="grid g-main">
            <div className="card">
              <div className="card-head"><div className="h-card">Sesi berikutnya</div><Link to="/sesi" className="small">Semua sesi</Link></div>
              {next ? (() => {
                const topic = data.topics.find((t) => t.id === next.topic_id);
                const mentor = data.profiles.find((p) => p.id === next.mentor_id);
                const pre = next.pretest_url || topic?.pretest_url;
                return (
                  <div className="stack sm">
                    <div className="h-section">{data.courses.find((c) => c.id === next.course_id)?.title}{topic ? ` · ${topic.title}` : ''}</div>
                    <div className="muted">{longDate(toLocal(next.starts_at).date)}, {timeOf(next.starts_at)}–{timeOf(next.ends_at)} WIB · {MODE_LABEL[next.mode]} · {mentor?.full_name}</div>
                    <div className="row wrap">
                      <span className="pill brand"><Icon name="clock" size={12} />{Date.parse(next.starts_at) <= now ? 'Sedang berlangsung' : until(next.starts_at, now)}</span>
                      <PlaceInfo s={next} compact />
                      {pre && <ExtLink href={pre}>Pretest</ExtLink>}
                      <Link to={`/sesi/${next.id}`} className="small">Detail</Link>
                    </div>
                  </div>
                );
              })() : <p className="muted">Belum ada sesi terjadwal. <Link to="/booking">Booking sekarang</Link>.</p>}
              {upcoming.length > 1 && (
                <div className="list" style={{ marginTop: 12 }}>
                  {upcoming.filter((x) => x.id !== next?.id).slice(0, 3).map((x) => <SessionItem key={x.id} s={x} data={data} me={me} />)}
                </div>
              )}
            </div>
            <AdminContact settings={s} />
          </div>
          <section className="stack sm" aria-labelledby="kelasku">
            <div className="row between"><h2 id="kelasku" className="h-section">Kelasku</h2><Link to="/kelas" className="small">Semua kelas</Link></div>
            <div className="class-grid">{enrolled.filter((e) => e.status === 'active').map((e) => <CourseCard key={e.course_id} courseId={e.course_id} data={data} me={me} />)}</div>
          </section>
          <StudentDashboard data={data} studentId={me.id} self />
        </>
      )}
    </Shell>
  );
}
