/** Dasbor progres peserta: dipakai peserta sendiri, dan oleh admin/mentor saat melihat seorang peserta. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { BarChart, ScoreLine } from '../../components/charts';
import { CourseChip, ScoreChange, StatePill, WaButton, stateIcon } from '../../components/bits';
import { courseProgress, recentActivity, stateCounts, stateMessage, STATE_LABEL, topicProgress, type TopicProgress, type TopicState } from '../../domain/mastery';
import { addDays, longDate, mondayOf, shortDate, toLocal } from '../../domain/time';
import type { Data } from '../../domain/types';

export function StudentDashboard({ data, studentId, self }: { data: Data; studentId: string; self: boolean }) {
  const s = data.settings;
  const enrolled = data.enrollments.filter((e) => e.student_id === studentId);
  const courses = data.courses.filter((c) => enrolled.some((e) => e.course_id === c.id));
  const [courseId, setCourseId] = useState<string>('');
  const progress = useMemo(() => topicProgress(data, studentId, courseId || undefined), [data, studentId, courseId]);
  const counts = stateCounts(progress);
  const student = data.profiles.find((p) => p.id === studentId);

  // Sesi selesai per minggu, 8 minggu terakhir.
  const today = toLocal(Date.now()).date;
  const mySessions = data.sessions.filter((x) => x.status === 'done' && data.seats.some((y) => y.session_id === x.id && y.student_id === studentId) && (!courseId || x.course_id === courseId));
  const weeks = Array.from({ length: 8 }, (_, i) => mondayOf(addDays(today, -7 * (7 - i))));
  const weekly = weeks.map((w) => ({
    label: shortDate(w), tip: `Minggu ${shortDate(w)}`,
    value: mySessions.filter((x) => { const d = toLocal(x.starts_at).date; return d >= w && d < addDays(w, 7); }).length,
  }));
  const scored = recentActivity(data, studentId, 100).filter((x) => x.seat.posttest_score != null && (!courseId || x.session.course_id === courseId)).reverse().slice(-16);
  const points = scored.map((x) => ({
    label: shortDate(toLocal(x.session.starts_at).date), value: Math.round(x.seat.posttest_score!),
    tip: `${data.topics.find((t) => t.id === x.session.topic_id)?.title ?? 'Sesi'} (${shortDate(toLocal(x.session.starts_at).date)})`,
  }));
  const recent = recentActivity(data, studentId, 6).filter((x) => !courseId || x.session.course_id === courseId);
  const rec = progress.filter((p) => p.state === 'need').sort((a, b) => (a.last ?? 0) - (b.last ?? 0))[0]
    ?? progress.filter((p) => p.state === 'practice').sort((a, b) => (a.last ?? 0) - (b.last ?? 0))[0]
    ?? progress.find((p) => p.state === 'none');
  const firstName = student?.full_name.split(' ')[0] ?? 'peserta';
  const waText = (st: TopicState) => `Halo admin IE.Academie, saya ${student?.full_name ?? ''}. ${st === 'need' ? 'Saya butuh konsultasi untuk topik yang nilainya masih di bawah ' + s.threshold_need_help + '.' : 'Saya mau memberi masukan soal sesi.'}`;

  if (!courses.length) return null;

  return (
    <div className="stack lg">
      <div className="row wrap between">
        <div className="seg" role="group" aria-label="Pilih mata kuliah">
          <button aria-pressed={!courseId} onClick={() => setCourseId('')}>Semua</button>
          {courses.map((c) => <button key={c.id} aria-pressed={courseId === c.id} onClick={() => setCourseId(c.id)} title={c.title}>{c.code}</button>)}
        </div>
        {courseId && <CourseChip course={data.courses.find((c) => c.id === courseId)} />}
      </div>

      <section aria-labelledby="areas">
        <h2 id="areas" className="sr-only">Status topik</h2>
        <div className="tiles">
          {(['need', 'practice', 'mastered'] as const).map((st) => {
            const list = progress.filter((p) => p.state === st).sort((a, b) => (a.last ?? 0) - (b.last ?? 0));
            return (
              <div key={st} className={`tile ${st}`}>
                <div className="tile-top"><Icon name={stateIcon(st)} size={18} />{STATE_LABEL[st]}<span className="count num">{counts[st]}</span></div>
                <div className="small" style={{ color: 'inherit' }}>{st === 'need' ? `Posttest di bawah ${s.threshold_need_help}` : st === 'practice' ? `Posttest ${s.threshold_need_help} sampai ${s.threshold_mastered - 1}` : `Posttest ${s.threshold_mastered} ke atas`}</div>
                {list.length > 0 && (
                  <ul>
                    {list.slice(0, 5).map((p) => (
                      <li key={p.topic.id}><TopicLink p={p} self={self} /><span className="score num">{Math.round(p.last!)}</span></li>
                    ))}
                    {list.length > 5 && <li><span className="muted">dan {list.length - 5} topik lain</span></li>}
                  </ul>
                )}
                {(list.length > 0 || st !== 'practice') && <p className="msg">{list.length === 0 && st === 'need' ? 'Tidak ada topik yang perlu konsultasi. Bagus!' : list.length === 0 ? 'Belum ada topik di sini.' : stateMessage(st, s)}</p>}
                {self && list.length > 0 && st !== 'practice' && <WaButton phone={s.admin_whatsapp} text={waText(st)} label={`WhatsApp admin (${s.admin_whatsapp_label})`} sm />}
              </div>
            );
          })}
        </div>
        {counts.none > 0 && <p className="small muted" style={{ marginTop: 8 }}>{counts.none} topik belum dinilai.</p>}
      </section>

      <div className="grid g-main">
        <div className="stack lg">
          <div className="card">
            <div className="card-head"><div><div className="h-card">Nilai posttest</div><div className="sub">16 sesi terakhir{courseId ? '' : ', semua mata kuliah'}</div></div></div>
            {points.length ? (
              <ScoreLine points={points} refs={[{ value: s.threshold_mastered, label: `Dikuasai ${s.threshold_mastered}` }, { value: s.threshold_need_help, label: `Batas konsultasi ${s.threshold_need_help}` }]} title="Nilai posttest per sesi" />
            ) : <p className="muted small">Belum ada nilai posttest. Grafik muncul setelah sesi pertama dinilai mentor.</p>}
          </div>
          <div className="card">
            <div className="card-head"><div><div className="h-card">Sesi selesai per minggu</div><div className="sub">8 minggu terakhir</div></div><div className="big-num">{mySessions.length}<span className="small muted" style={{ fontWeight: 600 }}> total</span></div></div>
            <BarChart data={weekly} unit="sesi" title="Sesi selesai per minggu" />
          </div>
          <div className="card">
            <div className="card-head"><div className="h-card">Aktivitas terbaru</div></div>
            {recent.length ? (
              <div className="list">
                {recent.map(({ session, seat }) => {
                  const t = data.topics.find((x) => x.id === session.topic_id);
                  const c = data.courses.find((x) => x.id === session.course_id);
                  return (
                    <Link key={session.id} to={`/sesi/${session.id}`} className="list-item link">
                      <span className={`state-dot ${seat.posttest_score == null ? 'none' : seat.posttest_score < s.threshold_need_help ? 'need' : seat.posttest_score >= s.threshold_mastered ? 'mastered' : 'practice'}`} />
                      <div className="grow">
                        <div className="t">{t?.title ?? c?.title}</div>
                        <div className="meta">{c?.code} · {longDate(toLocal(session.starts_at).date)}{seat.attendance === 'absent' ? ' · tidak hadir' : ''}</div>
                      </div>
                      <ScoreChange pre={seat.pretest_score} post={seat.posttest_score} settings={s} />
                    </Link>
                  );
                })}
              </div>
            ) : <p className="muted small">Belum ada sesi yang selesai.</p>}
          </div>
        </div>

        <div className="stack lg">
          {rec && (
            <div className="card stack sm" style={{ borderColor: 'var(--accent)' }}>
              <div className="eyebrow">Saran berikutnya</div>
              <div className="h-card">{rec.topic.title}</div>
              <div className="small muted">{data.courses.find((c) => c.id === rec.topic.course_id)?.title}</div>
              <div className="row"><StatePill state={rec.state} />{rec.last != null && <span className="small muted">nilai terakhir {Math.round(rec.last)}</span>}</div>
              <p className="small">{rec.state === 'none' ? `Topik ini belum pernah dinilai. Mulai dari sini supaya peta progresmu lengkap.` : `Nilai terendahmu ada di topik ini. Satu sesi lagi bisa memindahkannya ke status berikutnya.`}</p>
              {self && <Link className="btn primary" to={`/booking?course=${rec.topic.course_id}&topic=${rec.topic.id}`}>Booking sesi topik ini</Link>}
            </div>
          )}
          <div className="card">
            <div className="card-head"><div className="h-card">Progres kurikulum</div><span className="sub">topik dikuasai</span></div>
            {courses.map((c) => {
              const cp = courseProgress(data, studentId, c.id);
              const e = enrolled.find((x) => x.course_id === c.id)!;
              return (
                <div key={c.id} className="progress-row">
                  <div style={{ minWidth: 0 }}>
                    <div className="strong small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                    <div className="tiny muted">{cp.mastered} dari {cp.total} topik{e.goal_text ? ` · Target: ${e.goal_text}${e.goal_date ? ` (${shortDate(e.goal_date)})` : ''}` : ''}</div>
                  </div>
                  <div className="bar" role="progressbar" aria-valuenow={cp.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.title} ${cp.pct}%`}><span style={{ width: `${cp.pct}%` }} /></div>
                  <div className="strong small num" style={{ textAlign: 'right' }}>{cp.pct}%</div>
                </div>
              );
            })}
          </div>
          {enrolled.some((e) => e.goal_text) && (
            <div className="card stack sm">
              <div className="h-card">Target</div>
              {enrolled.filter((e) => e.goal_text).map((e) => {
                const c = data.courses.find((x) => x.id === e.course_id);
                const left = e.goal_date ? Math.ceil((Date.parse(e.goal_date) - Date.now()) / 864e5) : null;
                return (
                  <div key={e.id} className="row top">
                    <Icon name="target" size={16} className="faint" />
                    <div className="grow small"><b>{e.goal_text}</b><div className="muted">{c?.title}{left != null ? ` · ${left > 0 ? `${left} hari lagi` : 'tenggat lewat'}` : ''}</div></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {!self && <p className="tiny faint">Dasbor yang sama dengan yang dilihat {firstName}.</p>}
    </div>
  );
}

function TopicLink({ p, self }: { p: TopicProgress; self: boolean }) {
  if (p.sessionId) return <Link to={`/sesi/${p.sessionId}`} title={p.topic.title}>{p.topic.title}</Link>;
  if (self) return <Link to={`/booking?course=${p.topic.course_id}&topic=${p.topic.id}`}>{p.topic.title}</Link>;
  return <span>{p.topic.title}</span>;
}
