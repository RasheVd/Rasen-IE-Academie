/**
 * Kelasku: ruang kelas online peserta per mata kuliah yang dipasang admin.
 * Isinya: sesi hari ini (satu atau lebih) dengan tempat, pretest, dan posttest; materi dari mentor dan admin;
 * sesi berikutnya dan riwayat nilai; status tiap topik.
 */
import { Link, useParams } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { AdminContact, CourseChip, ExtLink, ScoreChange, SessionItem, SessionPill, StatePill } from '../../components/bits';
import { Empty } from '../../components/ui';
import { PlaceInfo } from '../../components/place';
import { useData, useMe } from '../../store';
import { useNow, useTitle } from '../../hooks';
import { stateCounts, topicProgress } from '../../domain/mastery';
import { longDate, rupiah, shortDate, timeOf, toLocal, until } from '../../domain/time';
import { GROUP_MAX, KIND_LABEL, MODE_LABEL, courseGroup, type Data, type Material, type Profile, type Session } from '../../domain/types';

export default function Classroom() {
  const { id } = useParams();
  const me = useMe();
  const data = useData();
  const courses = data.courses.filter((c) => data.enrollments.some((e) => e.student_id === me.id && e.course_id === c.id && e.status === 'active'));
  const course = id ? courses.find((c) => c.id === id) : undefined;
  useTitle(course ? course.title : 'Kelasku');

  if (!id || !course) return (
    <Shell title="Kelasku">
      <div className="page-head"><div><h1 className="h-page">Kelasku</h1><p className="lead">Satu ruang kelas untuk tiap mata kuliah yang dipasang admin: sesi hari ini, pretest, posttest, dan materi.</p></div></div>
      <PriceNote data={data} />
      {courses.length === 0 ? (
        <div className="card"><Empty title="Mata kuliahmu belum dipasang" action={<AdminContact settings={data.settings} compact text={`Halo admin IE.Academie, saya ${me.full_name}. Mohon dipasangkan mata kuliah saya.`} />}>Kabari admin mata kuliah yang kamu ambil.</Empty></div>
      ) : (
        <div className="class-grid">{courses.map((c) => <CourseCard key={c.id} courseId={c.id} data={data} me={me} />)}</div>
      )}
    </Shell>
  );

  return <CourseRoom courseId={course.id} data={data} me={me} />;
}

function PriceNote({ data }: { data: Data }) {
  const s = data.settings;
  return (
    <div className="price-note">
      <span><b>Private</b> {rupiah(s.price_private)} per sesi</span>
      <span><b>Kelas bersama</b> {rupiah(s.price_group)} per orang per sesi, maksimal {GROUP_MAX} orang</span>
      <span className="muted">1 sesi = 60 menit: pretest, materi, pembahasan, posttest</span>
    </div>
  );
}

const mySessions = (data: Data, me: Profile, courseId: string) => data.sessions
  .filter((s) => s.course_id === courseId && s.status !== 'cancelled' && data.seats.some((x) => x.session_id === s.id && x.student_id === me.id))
  .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

const visibleMaterials = (data: Data, me: Profile, courseId: string, sessions: Session[]) => data.materials.filter((m) => m.course_id === courseId && m.status === 'approved'
  && (!m.student_id || m.student_id === me.id) && (!m.session_id || sessions.some((s) => s.id === m.session_id)));

export function CourseCard({ courseId, data, me }: { courseId: string; data: Data; me: Profile }) {
  const now = useNow();
  const c = data.courses.find((x) => x.id === courseId)!;
  const sessions = mySessions(data, me, courseId);
  const today = toLocal(now).date;
  const todays = sessions.filter((s) => toLocal(s.starts_at).date === today);
  const next = sessions.find((s) => Date.parse(s.ends_at) > now);
  const counts = stateCounts(topicProgress(data, me.id, courseId));
  const mats = visibleMaterials(data, me, courseId, sessions).length;
  return (
    <Link to={`/kelas/${courseId}`} className="class-card" style={{ ['--c' as string]: `var(--${c.color})` }}>
      <div className="row between"><span className="code">{c.code}</span><span className="tiny muted">{courseGroup(c)}</span></div>
      <div className="h-card">{c.title}</div>
      <div className="small">
        {todays.length ? <b className="today">{todays.length} sesi hari ini</b>
          : next ? <>Berikutnya {shortDate(toLocal(next.starts_at).date)}, {timeOf(next.starts_at)} WIB</> : <span className="muted">Belum ada sesi</span>}
      </div>
      <div className="row wrap tiny">
        <span className="pill">{mats} materi</span>
        {counts.need > 0 && <span className="pill bad">{counts.need} perlu konsultasi</span>}
        {counts.mastered > 0 && <span className="pill ok">{counts.mastered} dikuasai</span>}
      </div>
      <span className="go">Masuk kelas <Icon name="arrowR" size={14} /></span>
    </Link>
  );
}

function CourseRoom({ courseId, data, me }: { courseId: string; data: Data; me: Profile }) {
  const now = useNow();
  const c = data.courses.find((x) => x.id === courseId)!;
  const s = data.settings;
  const sessions = mySessions(data, me, courseId);
  const today = toLocal(now).date;
  const todays = sessions.filter((x) => toLocal(x.starts_at).date === today);
  const upcoming = sessions.filter((x) => toLocal(x.starts_at).date > today);
  const past = sessions.filter((x) => toLocal(x.starts_at).date < today).reverse();
  const mats = visibleMaterials(data, me, courseId, sessions);
  const progress = topicProgress(data, me.id, courseId);
  const topics = data.topics.filter((t) => t.course_id === courseId).sort((a, b) => a.position - b.position);
  const byTopic = new Map<string, Material[]>();
  for (const m of mats) { const k = m.topic_id ?? ''; (byTopic.get(k) ?? byTopic.set(k, []).get(k)!).push(m); }

  return (
    <Shell title="Kelasku">
      <div className="page-head">
        <div>
          <Link to="/kelas" className="small"><Icon name="chevL" size={12} />Kelasku</Link>
          <h1 className="h-page">{c.title}</h1>
          <p className="lead row wrap" style={{ gap: 8 }}><CourseChip course={c} /><span>{courseGroup(c)}</span></p>
        </div>
        <Link className="btn primary lg" to={`/booking?course=${c.id}`}><Icon name="plus" />Booking sesi</Link>
      </div>
      <PriceNote data={data} />

      <section className="card stack" aria-labelledby="today">
        <div className="card-head" style={{ marginBottom: 0 }}><h2 id="today" className="h-card">Hari ini · {longDate(today)}</h2><span className="small muted">{todays.length} sesi</span></div>
        {todays.length === 0 && <p className="muted small">Tidak ada sesi {c.code} hari ini.{upcoming[0] ? ` Sesi berikutnya ${longDate(toLocal(upcoming[0].starts_at).date)}, ${timeOf(upcoming[0].starts_at)} WIB.` : ''}</p>}
        {todays.map((x) => <TodaySession key={x.id} s={x} data={data} me={me} now={now} />)}
      </section>

      <div className="grid g-main">
        <section className="card stack" aria-labelledby="mats">
          <h2 id="mats" className="h-card">Materi</h2>
          {mats.length === 0 && <p className="muted small">Belum ada materi. Mentor atau admin menambahkannya sebelum sesi.</p>}
          {[...topics.map((t) => [t.id, t.title] as const), ['', 'Umum'] as const].filter(([k]) => byTopic.has(k)).map(([k, title]) => (
            <div key={k} className="stack sm">
              <div className="tiny muted strong">{title}</div>
              <div className="list">
                {byTopic.get(k)!.map((m) => (
                  <a key={m.id} className="list-item" href={m.url} target="_blank" rel="noreferrer">
                    <span className="pill">{KIND_LABEL[m.kind]}</span>
                    <div className="grow"><div className="t">{m.title}</div>{m.description && <div className="meta">{m.description}</div>}</div>
                    {m.student_id && <span className="pill brand">Khusus kamu</span>}
                    <Icon name="external" size={14} className="faint" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </section>
        <section className="card stack" aria-labelledby="topik">
          <h2 id="topik" className="h-card">Nilai per topik</h2>
          {progress.length === 0 && <p className="muted small">Daftar topik mata kuliah ini belum diisi admin.</p>}
          <div className="list">
            {progress.map((p) => (
              <div key={p.topic.id} className="list-item">
                <div className="grow"><div className="t">{p.topic.title}</div><div className="meta">{p.attempts ? `${p.attempts} sesi` : 'Belum pernah'}</div></div>
                {p.last != null && <ScoreChange pre={p.pre} post={p.last} settings={s} />}
                <StatePill state={p.state} />
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card stack" aria-labelledby="sesi">
        <h2 id="sesi" className="h-card">Sesi {c.code}</h2>
        {upcoming.length + past.length === 0 && <p className="muted small">Belum ada sesi lain. <Link to={`/booking?course=${c.id}`}>Booking sekarang</Link>.</p>}
        {upcoming.length > 0 && <><div className="tiny muted strong">Berikutnya</div><div className="list">{upcoming.map((x) => <SessionItem key={x.id} s={x} data={data} me={me} />)}</div></>}
        {past.length > 0 && <><div className="tiny muted strong">Riwayat</div><div className="list">{past.slice(0, 10).map((x) => <SessionItem key={x.id} s={x} data={data} me={me} />)}</div></>}
      </section>
    </Shell>
  );
}

/** Satu sesi hari ini: jam, tempat, pretest (awal), posttest (akhir), materi khusus sesi. */
function TodaySession({ s, data, me, now }: { s: Session; data: Data; me: Profile; now: number }) {
  const topic = data.topics.find((t) => t.id === s.topic_id);
  const mentor = data.profiles.find((p) => p.id === s.mentor_id);
  const seat = data.seats.find((x) => x.session_id === s.id && x.student_id === me.id);
  const pre = s.pretest_url || topic?.pretest_url || '';
  const post = s.posttest_url || topic?.posttest_url || '';
  const started = now >= Date.parse(s.starts_at), ended = now >= Date.parse(s.ends_at);
  const unpaid = seat?.payment_status !== 'paid';
  const sessMats = data.materials.filter((m) => m.session_id === s.id && m.status === 'approved');
  return (
    <div className="today-sess">
      <div className="when-col"><b className="num">{timeOf(s.starts_at)}</b><span className="tiny">{timeOf(s.ends_at)} WIB</span></div>
      <div className="stack sm grow">
        <div className="row wrap between">
          <div><div className="strong">{topic?.title ?? 'Topik dibahas bersama mentor'}</div><div className="small muted">{MODE_LABEL[s.mode]} · {mentor?.full_name} · {ended ? 'selesai' : started ? 'sedang berlangsung' : until(s.starts_at, now)}</div></div>
          <SessionPill session={s} seat={seat} />
        </div>
        {unpaid ? (
          <p className="small" style={{ color: 'var(--danger)' }}>Pembayaran belum dikonfirmasi. <Link to={`/sesi/${s.id}`}>Upload bukti</Link> supaya bisa ikut.</p>
        ) : (
          <>
            <PlaceInfo s={s} />
            <div className="test-row">
              <div className="test-box">
                <span className="tiny muted">Menit 0–5</span>
                {pre ? <a className="btn sm primary" href={pre} target="_blank" rel="noreferrer"><Icon name="note" size={14} />Kerjakan pretest</a> : <span className="small muted">Link pretest belum diisi mentor</span>}
              </div>
              <div className="test-box">
                <span className="tiny muted">Menit 50–60</span>
                {post ? <a className="btn sm primary" href={post} target="_blank" rel="noreferrer"><Icon name="check" size={14} />Kerjakan posttest</a> : <span className="small muted">Link posttest belum diisi mentor</span>}
              </div>
            </div>
            {sessMats.length > 0 && <div className="row wrap">{sessMats.map((m) => <ExtLink key={m.id} href={m.url}>{m.title}</ExtLink>)}</div>}
          </>
        )}
        <Link to={`/sesi/${s.id}`} className="small">Detail sesi</Link>
      </div>
    </div>
  );
}
