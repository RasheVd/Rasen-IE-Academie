import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { SlotPicker } from '../../components/SlotPicker';
import { Modal, Field, Empty } from '../../components/ui';
import { AdminContact, Banner, useAction } from '../../components/bits';
import { book, toast, useData, useMe } from '../../store';
import { useTitle } from '../../hooks';
import { hm, longDate, rupiah } from '../../domain/time';
import type { Slot } from '../../domain/slots';
import { MODE_LABEL, type BookingOptions, type Mode } from '../../domain/types';

export default function Booking() {
  useTitle('Booking sesi');
  const me = useMe();
  const data = useData();
  const s = data.settings;
  const nav = useNavigate();
  const [params] = useSearchParams();
  const courses = data.courses.filter((c) => c.active && data.enrollments.some((e) => e.student_id === me.id && e.course_id === c.id && e.status === 'active'));
  const [courseId, setCourseId] = useState(() => courses.find((c) => c.id === params.get('course'))?.id ?? (courses.length === 1 ? courses[0].id : ''));
  const [topicId, setTopicId] = useState(() => params.get('topic') ?? '');
  const [mode, setMode] = useState<Mode>('private');
  const [open, setOpen] = useState(true);
  const [mentorId, setMentorId] = useState('');
  const [mentors, setMentors] = useState<BookingOptions['mentors']>([]);
  const [pick, setPick] = useState<Slot | null>(null);
  const { busy, run } = useAction();
  const topics = useMemo(() => data.topics.filter((t) => t.course_id === courseId).sort((a, b) => a.position - b.position), [data.topics, courseId]);
  const credits = data.credits.filter((c) => c.student_id === me.id && !c.used_session && (!c.course_id || c.course_id === courseId));
  const validTopic = topics.some((t) => t.id === topicId);

  if (!courses.length) return (
    <Shell title="Booking sesi" narrow>
      <div className="card"><Empty title="Belum ada mata kuliah aktif" action={<AdminContact settings={s} compact text={`Halo admin IE.Academie, saya ${me.full_name}. Mohon dipasangkan mata kuliah saya.`} />}>Admin perlu memasang mata kuliahmu dulu.</Empty></div>
    </Shell>
  );

  const price = mode === 'private' ? s.price_private : s.price_group;
  const pickTopic = pick?.join?.topic_id ?? (validTopic ? topicId : null);
  async function confirm() {
    if (!pick) return;
    const r = await run('book', () => book({ mentor: pick.mentor_id, course: courseId, topic: pickTopic, starts_at: pick.starts_at, mode, open }));
    if (r) nav(`/sesi/${r.session_id}${r.paid ? '?baru=kredit' : '?baru=1'}`);
  }

  return (
    <Shell title="Booking sesi">
      <div className="page-head"><div><h1 className="h-page">Booking sesi</h1><p className="lead">Pilih mata kuliah, topik, dan jam. Booking paling lambat {s.booking_cutoff_hours} jam sebelum sesi.</p></div></div>
      {credits.length > 0 && <Banner tone="ok" icon="star" title={`${credits.length} kredit tersedia`}>Booking ini memakai 1 kredit, jadi tidak perlu bayar lagi.</Banner>}
      <div className="steps">
        <section className="card">
          <div className="step-title"><span className="n">1</span>Mata kuliah</div>
          <div className="choice-grid">
            {courses.map((c) => (
              <button key={c.id} className="choice" aria-pressed={courseId === c.id} onClick={() => { setCourseId(c.id); setTopicId(''); setPick(null); setMentorId(''); }}>
                <span className="t">{c.title}</span><span className="s">{c.code} · {c.category}</span>
              </button>
            ))}
          </div>
        </section>

        {courseId && (
          <section className="card">
            <div className="step-title"><span className="n">2</span>Topik dan jenis kelas</div>
            <div className="form-grid">
              <Field label="Topik yang mau dipelajari" hint="Dipakai untuk pretest, posttest, dan dasbor progresmu.">
                {(id) => (
                  <select id={id} className="select" value={validTopic ? topicId : ''} onChange={(e) => setTopicId(e.target.value)}>
                    <option value="">Pilih topik…</option>
                    {topics.map((t, i) => <option key={t.id} value={t.id}>{i + 1}. {t.title}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Mentor">
                {(id) => (
                  <select id={id} className="select" value={mentorId} onChange={(e) => setMentorId(e.target.value)}>
                    <option value="">Semua mentor yang siap</option>
                    {mentors.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                )}
              </Field>
            </div>
            <div className="choice-grid" style={{ marginTop: 14 }}>
              <button className="choice" aria-pressed={mode === 'private'} onClick={() => { setMode('private'); setPick(null); }}>
                <span className="t">Private · {rupiah(s.price_private)}</span><span className="s">Hanya kamu dan mentor</span>
              </button>
              <button className="choice" aria-pressed={mode === 'group'} onClick={() => { setMode('group'); setPick(null); }}>
                <span className="t">Kelas bersama · {rupiah(s.price_group)}</span><span className="s">Maksimal 5 peserta mata kuliah yang sama</span>
              </button>
            </div>
            {mode === 'group' && (
              <label className="check" style={{ marginTop: 12 }}>
                <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
                <span>Buka untuk peserta lain bila saya membuka kelas baru<br /><span className="small muted">Matikan bila hanya untuk kamu dan teman yang kamu ajak lewat admin.</span></span>
              </label>
            )}
          </section>
        )}

        {courseId && (
          <section className="card">
            <div className="step-title"><span className="n">3</span>Pilih jam</div>
            {!validTopic && <p className="small muted" style={{ marginBottom: 10 }}>Pilih topik dulu supaya nilai tercatat di topik yang benar. Bergabung ke kelas bersama yang sudah ada memakai topik kelas itu.</p>}
            <div className="cal-legend" style={{ marginBottom: 12 }}>
              <span><i className="free" />Slot kosong</span>
              {mode === 'group' && <span><i style={{ background: '#efeafd', borderColor: '#9b8ce0' }} />Kelas bersama yang bisa kamu ikuti</span>}
            </div>
            <SlotPicker courseId={courseId} mode={mode} mentorId={mentorId} onMentors={setMentors}
              onPick={(sl) => { if (!sl.join && !validTopic) { toast('Pilih topik dulu di langkah 2.', 'error'); return; } setPick(sl); }} />
          </section>
        )}
      </div>

      {pick && (
        <Modal title="Konfirmasi booking" onClose={() => setPick(null)} footer={<>
          <button className="btn" onClick={() => setPick(null)}>Ganti jam</button>
          <button className="btn primary" disabled={!!busy} onClick={confirm}>{busy ? 'Memesan…' : credits.length ? 'Booking pakai kredit' : 'Booking dan tahan slot'}</button>
        </>}>
          <div className="summary">
            <div><span>Mata kuliah</span><span>{data.courses.find((c) => c.id === courseId)?.title}</span></div>
            <div><span>Topik</span><span>{data.topics.find((t) => t.id === pickTopic)?.title ?? 'Belum dipilih'}</span></div>
            <div><span>Waktu</span><span>{longDate(pick.date)}, {hm(pick.min)}–{hm(pick.min + 60)} WIB</span></div>
            <div><span>Mentor</span><span>{mentors.find((m) => m.id === pick.mentor_id)?.full_name}</span></div>
            <div><span>Jenis</span><span>{MODE_LABEL[mode]}{pick.join ? ` (bergabung, ${pick.join.seats + 1}/5)` : mode === 'group' ? (open ? ' (terbuka)' : ' (tertutup)') : ''}</span></div>
            <div className="total"><span>Biaya</span><span>{credits.length ? 'Pakai 1 kredit' : rupiah(price)}</span></div>
          </div>
          {!credits.length && <p className="small muted">Slot ditahan {s.hold_hours} jam. Setelah booking, transfer lalu upload bukti di halaman sesi. Sesi pasti setelah admin konfirmasi.</p>}
          <p className="small muted">Pindah jadwal bisa sendiri paling lambat {s.reschedule_cutoff_hours} jam sebelum sesi. Pembayaran tidak dikembalikan, tetapi berubah jadi kredit.</p>
        </Modal>
      )}
    </Shell>
  );
}
