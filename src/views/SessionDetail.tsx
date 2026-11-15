import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { Icon } from '../components/Icon';
import { Field, Modal, confirmDialog, Empty } from '../components/ui';
import { SlotPicker } from '../components/SlotPicker';
import { Avatar, Banner, CourseChip, ExtLink, Score, ScoreChange, SessionPill, StatePill, WaButton, useAction } from '../components/bits';
import {
  SITE, cancelPending, cancelSession, confirmPayment, markReady, proofUrl, rateSession, rejectPayment, reschedule,
  setSessionTests, submitReport, syncSessionNow, updateSession, uploadProof, useData, useMe, useStore,
} from '../store';
import { useNow, useTitle } from '../hooks';
import { hm, longDate, rupiah, shortDate, timeOf, toLocal, until } from '../domain/time';
import { stateOf, topicProgress } from '../domain/mastery';
import { cancelMessage } from '../domain/wa';
import type { Slot } from '../domain/slots';
import { ATT_LABEL, KIND_LABEL, MODE_LABEL, type Attendance, type Data, type Profile, type Seat, type Session } from '../domain/types';

export default function SessionDetail() {
  const { id } = useParams();
  const data = useData();
  const me = useMe();
  const now = useNow();
  const s = data.sessions.find((x) => x.id === id);
  useTitle(s ? s.code : 'Sesi');
  if (!s) return <Shell title="Sesi"><div className="card"><Empty title="Sesi tidak ditemukan" action={<Link className="btn" to="/sesi">Kembali ke daftar sesi</Link>}>Mungkin sesi sudah dibatalkan atau bukan milikmu.</Empty></div></Shell>;

  const course = data.courses.find((c) => c.id === s.course_id);
  const topic = data.topics.find((t) => t.id === s.topic_id);
  const mentor = data.profiles.find((p) => p.id === s.mentor_id);
  const seats = data.seats.filter((x) => x.session_id === s.id);
  const mySeat = seats.find((x) => x.student_id === me.id);
  const pre = s.pretest_url || topic?.pretest_url || '';
  const post = s.posttest_url || topic?.posttest_url || '';
  const staff = me.role === 'admin' || (me.role === 'mentor' && s.mentor_id === me.id);
  const started = Date.parse(s.starts_at) <= now;
  const materials = data.materials.filter((m) => m.status === 'approved' && (m.session_id === s.id || (!m.session_id && !m.student_id && m.course_id === s.course_id && (!m.topic_id || m.topic_id === s.topic_id))));

  return (
    <Shell title={s.code}>
      <div className="row"><Link to="/sesi" className="small row" style={{ gap: 4 }}><Icon name="chevL" size={14} />Daftar sesi</Link></div>
      <NewBookingNotice s={s} seat={mySeat} />
      <div className="card stack">
        <div className="row wrap between">
          <div className="row wrap"><span className="code">{s.code}</span><CourseChip course={course} /><SessionPill session={s} seat={mySeat} /></div>
          {staff && <CancelButton s={s} data={data} me={me} />}
        </div>
        <h1 className="h-page">{topic?.title ?? course?.title}</h1>
        <div className="grid g3">
          <Info icon="calendar" label="Waktu">{longDate(toLocal(s.starts_at).date)}<br />{timeOf(s.starts_at)}–{timeOf(s.ends_at)} WIB{s.status === 'scheduled' && !started ? <div className="small muted">{until(s.starts_at, now)}</div> : null}</Info>
          <Info icon="user" label="Mentor">{mentor?.full_name ?? 'Mentor'}{s.mentor_ready_at ? <div className="small" style={{ color: 'var(--mastered-ink)' }}>Sudah siap mengajar</div> : null}</Info>
          <Info icon="users" label="Jenis">{MODE_LABEL[s.mode]}{s.mode === 'group' ? ` · ${seats.length}/5 · ${s.is_open ? 'terbuka' : 'tertutup'}` : ''}</Info>
        </div>
        <div className="row wrap">
          {s.place ? (/^https?:/.test(s.place) ? <a className="btn accent" href={s.place} target="_blank" rel="noreferrer"><Icon name="play" size={14} />Masuk kelas online</a> : <span className="pill">{s.place}</span>) : <span className="small muted">Tautan kelas dikirim mentor sebelum sesi.</span>}
          {pre && <a className="btn" href={pre} target="_blank" rel="noreferrer"><Icon name="note" size={14} />Pretest</a>}
          {post && <a className="btn" href={post} target="_blank" rel="noreferrer"><Icon name="check" size={14} />Posttest</a>}
        </div>
        {s.status === 'cancelled' && <Banner tone="bad" icon="alert" title="Sesi dibatalkan">{s.cancelled_reason}</Banner>}
      </div>

      {me.role === 'student' && mySeat && <StudentPanel s={s} seat={mySeat} data={data} />}
      {staff && <StaffPanel s={s} seats={seats} data={data} me={me} />}
      {me.role === 'admin' && <AdminPanel s={s} data={data} />}

      {(s.report || s.followup) && (me.role !== 'student' || s.status === 'done') && (
        <div className="card stack sm">
          <div className="h-card">Laporan mentor</div>
          {s.report && <p className="pre">{s.report}</p>}
          {s.followup && <><div className="strong small">Tindak lanjut</div><p className="pre">{s.followup}</p></>}
        </div>
      )}

      <div className="card">
        <div className="card-head"><div className="h-card">Materi sesi</div>{me.role !== 'student' && <Link to="/materi" className="small">Kelola materi</Link>}</div>
        {materials.length ? (
          <div className="list">
            {materials.map((m) => (
              <div key={m.id} className="list-item"><span className="pill brand">{KIND_LABEL[m.kind]}</span><div className="grow"><div className="t">{m.title}</div>{m.description && <div className="meta">{m.description}</div>}</div><ExtLink href={m.url}>Buka</ExtLink></div>
            ))}
          </div>
        ) : <p className="small muted">Belum ada materi untuk topik ini. Materi PPT disiapkan paling lambat H-2.</p>}
      </div>
    </Shell>
  );
}

function Info({ icon, label, children }: { icon: 'calendar' | 'user' | 'users'; label: string; children: React.ReactNode }) {
  return <div className="row top"><Icon name={icon} size={18} className="faint" /><div><div className="tiny muted strong">{label}</div><div>{children}</div></div></div>;
}

function NewBookingNotice({ s, seat }: { s: Session; seat?: Seat }) {
  const [params, setParams] = useSearchParams();
  const v = params.get('baru');
  if (!v || !seat) return null;
  const close = () => { params.delete('baru'); setParams(params, { replace: true }); };
  return v === 'kredit' || seat.payment_status === 'paid'
    ? <Banner tone="ok" icon="check" title={`Booking ${s.code} berhasil`} action={<button className="btn ghost sm" onClick={close}>Tutup</button>}>Satu kredit terpakai. Sesi sudah pasti dan masuk Google Calendar bila kamu sudah menyambungkannya.</Banner>
    : <Banner tone="ok" icon="check" title={`Slot ${s.code} ditahan untukmu`} action={<button className="btn ghost sm" onClick={close}>Tutup</button>}>Langkah terakhir: transfer, lalu upload bukti di bawah.</Banner>;
}

/* ── Peserta: bayar, pindah jadwal, nilai, ulasan ────────── */
function StudentPanel({ s, seat, data }: { s: Session; seat: Seat; data: Data }) {
  const st = data.settings;
  const now = useNow();
  const nav = useNavigate();
  const { busy, run } = useAction();
  const [file, setFile] = useState<File | null>(null);
  const [moving, setMoving] = useState(false);
  const [pick, setPick] = useState<Slot | null>(null);
  const [rating, setRating] = useState(seat.rating ?? 0);
  const [feedback, setFeedback] = useState(seat.feedback ?? '');
  const canMove = s.status === 'scheduled' && Date.parse(s.starts_at) - now > st.reschedule_cutoff_hours * 3_600_000;
  const price = s.mode === 'private' ? st.price_private : st.price_group;

  return (
    <>
      {s.status === 'scheduled' && seat.payment_status === 'pending' && (
        <div className="card stack" style={{ borderColor: '#f1d98c' }}>
          <div className="row between wrap"><div className="h-section">Pembayaran</div><span className="pill warn">{seat.proof_path ? 'Menunggu konfirmasi admin' : 'Belum dibayar'}</span></div>
          {seat.proof_path ? (
            <p className="muted">Bukti transfer sudah kami terima. Admin akan mengonfirmasi, lalu sesi masuk Google Calendar. Ada kendala? Hubungi admin.</p>
          ) : (
            <>
              <div className="summary">
                <div><span>Jumlah</span><span className="num">{rupiah(price)}</span></div>
                {st.bank_account ? <>
                  <div><span>Bank</span><span>{st.bank_name}</span></div>
                  <div><span>Nomor rekening</span><span className="num">{st.bank_account}</span></div>
                  <div><span>Atas nama</span><span>{st.bank_holder}</span></div>
                </> : <div><span>Rekening</span><span>Minta ke admin lewat WhatsApp</span></div>}
                {seat.hold_expires_at && <div><span>Batas upload</span><span>{shortDate(toLocal(seat.hold_expires_at).date)} {timeOf(seat.hold_expires_at)} WIB ({until(seat.hold_expires_at, now)})</span></div>}
              </div>
              {st.payment_note && <p className="small muted pre">{st.payment_note}</p>}
              <Field label="Bukti transfer" hint="Foto atau PDF, maksimal 5 MB.">
                {(id) => <input id={id} className="input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
              </Field>
              <div className="row wrap">
                <button className="btn primary" disabled={!file || !!busy} onClick={() => file && run('up', () => uploadProof(s.id, file), 'Bukti terkirim. Admin akan mengonfirmasi.')}>{busy === 'up' ? 'Mengunggah…' : 'Kirim bukti bayar'}</button>
                {!st.bank_account && <WaButton phone={st.admin_whatsapp} text={`Halo admin IE.Academie, saya mau bayar sesi ${s.code}. Ke rekening mana?`} label="Tanya rekening" />}
              </div>
            </>
          )}
          <button className="link-btn small" style={{ justifySelf: 'start', color: 'var(--danger)' }} disabled={!!busy} onClick={async () => {
            if (await confirmDialog({ title: 'Batalkan booking ini?', body: 'Slot dilepas untuk peserta lain. Bila kamu sudah transfer, hubungi admin dulu.', confirm: 'Batalkan booking', danger: true })) {
              const ok = await run('cancel', () => cancelPending(s.id), 'Booking dibatalkan.');
              if (ok !== undefined) nav('/booking');
            }
          }}>Batalkan booking</button>
        </div>
      )}

      {s.status === 'scheduled' && seat.payment_status === 'paid' && (
        <div className="card row wrap between">
          <div className="stack sm">
            <div className="h-card">Perlu pindah jadwal?</div>
            <p className="small muted">{canMove ? `Bisa sendiri sampai ${st.reschedule_cutoff_hours} jam sebelum sesi. Pembayaranmu ikut pindah ke jadwal baru.` : `Sudah lewat batas ${st.reschedule_cutoff_hours} jam. Untuk perubahan, hubungi admin.`}</p>
          </div>
          {canMove ? <button className="btn" onClick={() => setMoving(true)}><Icon name="refresh" size={14} />Pindah jadwal</button>
            : <WaButton phone={st.admin_whatsapp} text={`Halo admin IE.Academie, saya perlu mengubah sesi ${s.code}.`} label="Hubungi admin" />}
        </div>
      )}

      {s.status === 'done' && (
        <div className="card stack">
          <div className="h-section">Hasilmu</div>
          <div className="grid g3">
            <div className="stat"><div className="label">Kehadiran</div><div className="value" style={{ fontSize: 18 }}>{seat.attendance ? ATT_LABEL[seat.attendance] : '–'}</div></div>
            <div className="stat"><div className="label">Pretest ke posttest</div><div className="value" style={{ fontSize: 22 }}><ScoreChange pre={seat.pretest_score} post={seat.posttest_score} settings={st} /></div></div>
            <div className="stat"><div className="label">Status topik</div><div style={{ marginTop: 6 }}><StatePill state={stateOf(seat.posttest_score, st)} /></div></div>
          </div>
          <div className="divider" />
          <div className="h-card">Ulasan sesi</div>
          <div className="row" role="radiogroup" aria-label="Nilai sesi">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className="btn ghost icon" role="radio" aria-checked={rating === n} aria-label={`${n} bintang`} onClick={() => setRating(n)} style={{ color: n <= rating ? '#c98a00' : 'var(--line-strong)' }}>
                <Icon name="star" size={22} fill={n <= rating ? 'currentColor' : 'none'} />
              </button>
            ))}
          </div>
          <textarea className="textarea" placeholder="Apa yang membantu? Apa yang bisa lebih baik?" value={feedback} onChange={(e) => setFeedback(e.target.value)} aria-label="Masukan" />
          <button className="btn primary" style={{ justifySelf: 'start' }} disabled={!rating || !!busy} onClick={() => run('rate', () => rateSession(s.id, rating, feedback), 'Terima kasih atas ulasanmu.')}>Kirim ulasan</button>
        </div>
      )}

      {moving && (
        <Modal wide title="Pindah jadwal" onClose={() => { setMoving(false); setPick(null); }}>
          {pick ? (
            <div className="stack">
              <div className="summary">
                <div><span>Dari</span><span>{longDate(toLocal(s.starts_at).date)}, {timeOf(s.starts_at)} WIB</span></div>
                <div><span>Ke</span><span>{longDate(pick.date)}, {hm(pick.min)} WIB</span></div>
              </div>
              <p className="small muted">Kursi lama dilepas dan pembayaranmu dipindah ke jadwal baru.</p>
              <div className="row"><button className="btn" onClick={() => setPick(null)}>Pilih jam lain</button>
                <button className="btn primary" disabled={!!busy} onClick={async () => {
                  const r = await run('move', () => reschedule(s.id, pick.mentor_id, pick.starts_at), 'Jadwal dipindah.');
                  if (r) { setMoving(false); nav(`/sesi/${r.session_id}`); }
                }}>{busy ? 'Memindah…' : 'Pindahkan'}</button></div>
            </div>
          ) : <SlotPicker courseId={s.course_id} mode={s.mode} excludeSession={s.id} onPick={setPick} />}
        </Modal>
      )}
    </>
  );
}

/* ── Mentor dan admin: siap H-1, peserta, laporan ────────── */
function StaffPanel({ s, seats, data, me }: { s: Session; seats: Seat[]; data: Data; me: Profile }) {
  const st = data.settings;
  const now = useNow();
  const { busy, run } = useAction();
  const [reporting, setReporting] = useState(false);
  const isMentor = me.id === s.mentor_id;
  const overdue = s.status === 'scheduled' && Date.parse(s.ends_at) < now;
  return (
    <>
      {isMentor && s.status === 'scheduled' && !s.mentor_ready_at && Date.parse(s.starts_at) > now && (
        <Banner tone={Date.parse(s.starts_at) - now < 36 * 3_600_000 ? 'warn' : 'info'} icon="clock" title="Konfirmasi kesiapan mengajar"
          action={<button className="btn primary sm" disabled={!!busy} onClick={() => run('ready', () => markReady(s.id), 'Tercatat: kamu siap mengajar.')}>Saya sudah siap</button>}>
          Pelajari materi dan konteks peserta paling lambat H-1, lalu klik tombol ini supaya admin tahu.
        </Banner>
      )}
      {isMentor && s.status !== 'cancelled' && <TestLinks s={s} data={data} />}
      {overdue && <Banner tone="warn" icon="note" title="Laporan sesi belum diisi" action={<button className="btn primary sm" onClick={() => setReporting(true)}>Isi laporan</button>}>Isi kehadiran dan nilai paling lambat 24 jam setelah sesi.</Banner>}

      <div className="card">
        <div className="card-head">
          <div className="h-card">Peserta ({seats.length})</div>
          {s.status !== 'cancelled' && (started(s, now) || me.role === 'admin') && <button className="btn sm" onClick={() => setReporting(true)}><Icon name="edit" size={14} />{s.status === 'done' ? 'Ubah laporan' : 'Isi laporan'}</button>}
        </div>
        {seats.length === 0 && <p className="muted small">Belum ada peserta.</p>}
        <div className="list">
          {seats.map((x) => {
            const p = data.profiles.find((q) => q.id === x.student_id);
            const history = p ? topicProgress(data, p.id, s.course_id).filter((t) => t.state !== 'none') : [];
            const needs = history.filter((t) => t.state === 'need');
            const same = history.find((t) => t.topic.id === s.topic_id);
            return (
              <div key={x.student_id} className="list-item" style={{ alignItems: 'flex-start' }}>
                <Avatar name={p?.full_name ?? '?'} />
                <div className="grow stack sm">
                  <div className="row wrap">
                    {me.role === 'admin' && p ? <Link className="t" to={`/orang/${p.id}`}>{p.full_name}</Link> : <span className="t">{p?.full_name ?? 'Peserta'}</span>}
                    <span className={`pill ${x.payment_status === 'paid' ? 'ok' : 'warn'}`}>{x.payment_status === 'paid' ? (x.paid_via === 'credit' ? 'Lunas (kredit)' : 'Lunas') : x.proof_path ? 'Bukti masuk' : 'Belum bayar'}</span>
                    {x.attendance && <span className="pill">{ATT_LABEL[x.attendance]}</span>}
                    {(x.pretest_score != null || x.posttest_score != null) && <ScoreChange pre={x.pretest_score} post={x.posttest_score} settings={st} />}
                  </div>
                  {p?.learning_needs && <div className="small"><b>Kebutuhan belajar:</b> {p.learning_needs}</div>}
                  {(same || needs.length > 0) && (
                    <div className="small muted">
                      {same && <>Nilai terakhir topik ini: <Score value={same.last} settings={st} />. </>}
                      {needs.length > 0 && <>Perlu konsultasi: {needs.map((n) => n.topic.title).join(', ')}.</>}
                    </div>
                  )}
                  {x.rating && <div className="small">Ulasan: {'★'.repeat(x.rating)}{'☆'.repeat(5 - x.rating)} {x.feedback && <span className="muted">“{x.feedback}”</span>}</div>}
                </div>
                {p?.phone && <WaButton phone={p.phone} text={`Halo ${p.full_name.split(' ')[0]}, ini ${me.full_name} dari IE.Academie soal sesi ${s.code}.`} label="WA" sm />}
              </div>
            );
          })}
        </div>
      </div>
      {reporting && <ReportModal s={s} seats={seats} data={data} onClose={() => setReporting(false)} />}
    </>
  );
}
const started = (s: Session, now: number) => Date.parse(s.starts_at) <= now;

/** Mentor mengisi link Google Form pretest dan posttest untuk sesinya. Kosong = pakai link bawaan topik. */
function TestLinks({ s, data }: { s: Session; data: Data }) {
  const topic = data.topics.find((t) => t.id === s.topic_id);
  const { busy, run } = useAction();
  const [pre, setPre] = useState(s.pretest_url);
  const [post, setPost] = useState(s.posttest_url);
  const bad = [pre, post].some((v) => v.trim() && !/^https?:\/\//i.test(v.trim()));
  const changed = pre !== s.pretest_url || post !== s.posttest_url;
  return (
    <div className="card stack">
      <div className="row between wrap">
        <div className="h-card">Link pretest dan posttest</div>
        <span className="small muted">Peserta melihat tombolnya di halaman sesi dan di Google Calendar.</span>
      </div>
      <div className="form-grid">
        <Field label="Pretest (menit 0–5)" hint={topic?.pretest_url ? 'Kosongkan untuk memakai link bawaan topik.' : 'Tempel link Google Form.'}>
          {(id) => <input id={id} className="input" value={pre} onChange={(e) => setPre(e.target.value)} placeholder={topic?.pretest_url || 'https://forms.gle/…'} />}
        </Field>
        <Field label="Posttest (menit 55–60)" hint={topic?.posttest_url ? 'Kosongkan untuk memakai link bawaan topik.' : 'Tempel link Google Form.'}>
          {(id) => <input id={id} className="input" value={post} onChange={(e) => setPost(e.target.value)} placeholder={topic?.posttest_url || 'https://forms.gle/…'} />}
        </Field>
      </div>
      {bad && <span className="small" role="alert" style={{ color: 'var(--danger)' }}>Link harus diawali https://</span>}
      <div className="row wrap">
        <button className="btn primary" disabled={!changed || bad || !!busy} onClick={() => run('t', () => setSessionTests(s.id, pre, post), 'Link tes tersimpan.')}>Simpan link tes</button>
        <span className="small muted">Nilainya kamu isi di laporan setelah sesi.</span>
      </div>
    </div>
  );
}

function ReportModal({ s, seats, data, onClose }: { s: Session; seats: Seat[]; data: Data; onClose: () => void }) {
  const { busy, run } = useAction();
  const [report, setReport] = useState(s.report);
  const [followup, setFollowup] = useState(s.followup);
  const [rows, setRows] = useState(() => seats.map((x) => ({
    student_id: x.student_id, attendance: (x.attendance ?? 'present') as Attendance | '',
    pre: x.pretest_score == null ? '' : String(x.pretest_score), post: x.posttest_score == null ? '' : String(x.posttest_score),
  })));
  const bad = rows.some((r) => [r.pre, r.post].some((v) => v !== '' && (isNaN(Number(v)) || Number(v) < 0 || Number(v) > 100)));
  const missing = rows.some((r) => r.attendance === 'present' && r.post === '');
  const save = (status: 'scheduled' | 'done') => run('save', async () => {
    await submitReport(s.id, status, report.trim(), followup.trim(), rows.map((r) => ({
      student_id: r.student_id, attendance: r.attendance, pretest_score: r.pre === '' ? null : Number(r.pre), posttest_score: r.post === '' ? null : Number(r.post),
    })));
    onClose();
  }, status === 'done' ? 'Laporan tersimpan. Sesi selesai.' : 'Draf laporan tersimpan.');
  return (
    <Modal wide title={`Laporan ${s.code}`} onClose={onClose} footer={<>
      <button className="btn" disabled={!!busy || bad} onClick={() => save('scheduled')}>Simpan draf</button>
      <button className="btn primary" disabled={!!busy || bad} onClick={() => save('done')}>{busy ? 'Menyimpan…' : 'Simpan dan tandai selesai'}</button>
    </>}>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Peserta</th><th>Kehadiran</th><th>Pretest</th><th>Posttest</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const p = data.profiles.find((q) => q.id === r.student_id);
              const up = (patch: Partial<typeof r>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <tr key={r.student_id}>
                  <td>{p?.full_name}</td>
                  <td>
                    <select className="select sm" value={r.attendance} onChange={(e) => up({ attendance: e.target.value as Attendance })} aria-label={`Kehadiran ${p?.full_name}`}>
                      {(Object.keys(ATT_LABEL) as Attendance[]).map((a) => <option key={a} value={a}>{ATT_LABEL[a]}</option>)}
                    </select>
                  </td>
                  <td><input className="input sm num" style={{ width: 80 }} inputMode="decimal" value={r.pre} onChange={(e) => up({ pre: e.target.value })} aria-label={`Pretest ${p?.full_name}`} placeholder="0–100" /></td>
                  <td><input className="input sm num" style={{ width: 80 }} inputMode="decimal" value={r.post} onChange={(e) => up({ post: e.target.value })} aria-label={`Posttest ${p?.full_name}`} placeholder="0–100" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {bad && <span className="small" style={{ color: 'var(--danger)' }} role="alert">Nilai harus angka 0 sampai 100.</span>}
      {missing && !bad && <span className="small muted">Peserta yang hadir sebaiknya punya nilai posttest supaya dasbornya terisi.</span>}
      <p className="small muted">Peserta yang tidak hadir tanpa kabar tetap dihitung sebagai sesi terlaksana.</p>
      <Field label="Catatan sesi" hint="Materi yang dibahas, kendala, hal yang perlu diperhatikan.">{(id) => <textarea id={id} className="textarea" value={report} onChange={(e) => setReport(e.target.value)} />}</Field>
      <Field label="Tindak lanjut" hint="Saran latihan atau topik berikutnya untuk peserta.">{(id) => <textarea id={id} className="textarea" value={followup} onChange={(e) => setFollowup(e.target.value)} />}</Field>
    </Modal>
  );
}

function CancelButton({ s, data, me }: { s: Session; data: Data; me: Profile }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<{ student_id: string; full_name: string; phone: string; credit: boolean }[] | null>(null);
  const { busy, run } = useAction();
  const course = data.courses.find((c) => c.id === s.course_id);
  const mentor = data.profiles.find((p) => p.id === s.mentor_id);
  const when = `${longDate(toLocal(s.starts_at).date)} ${timeOf(s.starts_at)} WIB`;
  return (
    <>
      {/* Modal tetap terpasang setelah sesi batal, supaya tombol WhatsApp untuk peserta tetap terlihat. */}
      {s.status === 'scheduled' && <button className="btn danger sm" onClick={() => setOpen(true)}>Batalkan sesi</button>}
      {open && (
        <Modal title={result ? 'Sesi dibatalkan' : 'Batalkan sesi?'} onClose={() => { setOpen(false); }} footer={result ? <button className="btn primary" onClick={() => setOpen(false)}>Selesai</button> : <>
          <button className="btn" onClick={() => setOpen(false)}>Kembali</button>
          <button className="btn danger solid" disabled={reason.trim().length < 3 || !!busy} onClick={async () => {
            const r = await run('cancel', () => cancelSession(s.id, reason));
            if (r) setResult(r);
          }}>{busy ? 'Membatalkan…' : 'Batalkan sesi'}</button>
        </>}>
          {result ? (
            <div className="stack">
              <p>Google Calendar mengirim email pembatalan ke peserta{me.role === 'mentor' ? ', dan admin mendapat salinan pemberitahuan' : ''}. Peserta yang sudah bayar mendapat 1 kredit. Kabari juga lewat WhatsApp:</p>
              {result.length === 0 && <p className="muted">Tidak ada peserta di sesi ini.</p>}
              {result.map((r) => (
                <div key={r.student_id} className="row between wrap">
                  <div><b>{r.full_name}</b>{r.credit && <span className="small muted"> · dapat kredit</span>}</div>
                  {r.phone ? <WaButton phone={r.phone} label={`Kabari ${r.full_name.split(' ')[0]} lewat WhatsApp`} sm
                    text={cancelMessage({ studentName: r.full_name, mentorName: mentor?.full_name ?? me.full_name, code: s.code, course: course?.title ?? '', when, reason: reason.trim(), credit: r.credit, site: SITE })} />
                    : <span className="small muted">Nomor WA belum diisi</span>}
                </div>
              ))}
            </div>
          ) : (
            <>
              <p className="small muted">Kamu bisa membatalkan tanpa persetujuan admin. Peserta yang sudah bayar otomatis mendapat kredit untuk booking ulang. Admin menerima salinan pemberitahuan.</p>
              <Field label="Alasan untuk peserta" hint="Ditampilkan ke peserta.">{(id) => <textarea id={id} className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: saya sakit, mohon maaf. Silakan pilih jadwal lain." autoFocus />}</Field>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

/* ── Admin: pembayaran, tautan, sinkron Google ───────────── */
function AdminPanel({ s, data }: { s: Session; data: Data }) {
  const { busy, run } = useAction();
  const seats = data.seats.filter((x) => x.session_id === s.id && x.payment_status === 'pending');
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ topic_id: s.topic_id ?? '', place: s.place, pretest_url: s.pretest_url, posttest_url: s.posttest_url });
  const gcal = useStore((r) => r.gcal);
  return (
    <>
      {seats.map((x) => <PaymentRow key={x.student_id} s={s} seat={x} data={data} />)}
      <div className="card stack">
        <div className="row between wrap">
          <div className="h-card">Pengaturan sesi</div>
          {!edit && s.status !== 'cancelled' && <button className="btn sm" onClick={() => setEdit(true)}><Icon name="edit" size={14} />Ubah</button>}
        </div>
        {edit ? (
          <>
            <div className="form-grid">
              <Field label="Topik">{(id) => (
                <select id={id} className="select" value={f.topic_id} onChange={(e) => setF({ ...f, topic_id: e.target.value })}>
                  <option value="">Tanpa topik</option>
                  {data.topics.filter((t) => t.course_id === s.course_id).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              )}</Field>
              <Field label="Tempat atau tautan kelas">{(id) => <input id={id} className="input" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} placeholder="https://meet.google.com/…" />}</Field>
              <Field label="Pretest khusus sesi ini" hint="Kosongkan untuk memakai tautan topik.">{(id) => <input id={id} className="input" value={f.pretest_url} onChange={(e) => setF({ ...f, pretest_url: e.target.value })} placeholder="https://forms.gle/…" />}</Field>
              <Field label="Posttest khusus sesi ini" hint="Kosongkan untuk memakai tautan topik.">{(id) => <input id={id} className="input" value={f.posttest_url} onChange={(e) => setF({ ...f, posttest_url: e.target.value })} placeholder="https://forms.gle/…" />}</Field>
            </div>
            <div className="row"><button className="btn" onClick={() => setEdit(false)}>Batal</button>
              <button className="btn primary" disabled={!!busy} onClick={() => run('e', async () => { await updateSession(s.id, { topic_id: f.topic_id || null, place: f.place.trim(), pretest_url: f.pretest_url.trim(), posttest_url: f.posttest_url.trim() }); setEdit(false); }, 'Sesi diperbarui.')}>Simpan</button></div>
          </>
        ) : (
          <div className="small muted">Ubah topik, tautan kelas, atau tautan tes khusus sesi ini. Perubahan ikut ke Google Calendar.</div>
        )}
        <div className="divider" />
        <div className="row wrap between">
          <div className="small">
            Google Calendar: {s.gcal_event_id ? <span className="pill ok">Tertulis</span> : <span className="pill">Belum tertulis</span>}
            {s.gcal_dirty && <span className="pill warn" style={{ marginLeft: 6 }}>Menunggu sinkron</span>}
            {s.gcal_error && <div style={{ color: 'var(--danger)', marginTop: 4 }}>{s.gcal_error}</div>}
          </div>
          <button className="btn sm" disabled={!!busy || !gcal?.configured} onClick={() => run('sync', async () => {
            const r = await syncSessionNow(s.id);
            if (r && (r as any).ok === false) throw new Error((r as any).reason || (r as any).error || 'Belum bisa ditulis ke Google.');
          }, 'Sesi ditulis ke Google Calendar.')}><Icon name="refresh" size={14} />Sinkronkan sekarang</button>
        </div>
      </div>
    </>
  );
}

export function PaymentRow({ s, seat, data, compact }: { s: Session; seat: Seat; data: Data; compact?: boolean }) {
  const { busy, run } = useAction();
  const p = data.profiles.find((q) => q.id === seat.student_id);
  const course = data.courses.find((c) => c.id === s.course_id);
  const price = s.mode === 'private' ? data.settings.price_private : data.settings.price_group;
  return (
    <div className={compact ? 'list-item' : 'card row wrap between'} style={compact ? undefined : { borderColor: '#f1d98c' }}>
      <div className="grow stack sm">
        <div className="row wrap"><b>{p?.full_name}</b><span className="code">{s.code}</span>{compact && <span className="small muted">{course?.code} · {shortDate(toLocal(s.starts_at).date)} {timeOf(s.starts_at)}</span>}</div>
        <div className="small muted">
          {rupiah(price)} · {MODE_LABEL[s.mode]} ·{' '}
          {seat.proof_path ? 'Bukti transfer masuk' : seat.hold_expires_at ? `Belum upload, slot lepas ${until(seat.hold_expires_at)}` : 'Belum upload bukti'}
        </div>
      </div>
      <div className="row wrap">
        {seat.proof_path && <button className="btn sm" disabled={!!busy} onClick={() => run('v', async () => { const u = await proofUrl(seat.proof_path!); window.open(u, '_blank', 'noopener'); })}><Icon name="eye" size={14} />Lihat bukti</button>}
        <button className="btn sm danger" disabled={!!busy} onClick={async () => {
          const reason = window.prompt('Alasan menolak (dikirim ke peserta):', 'Bukti transfer tidak sesuai. Silakan hubungi admin.');
          if (reason !== null) run('r', () => rejectPayment(s.id, seat.student_id, reason), 'Pembayaran ditolak, slot dilepas.');
        }}>Tolak</button>
        <button className="btn sm primary" disabled={!!busy} onClick={() => run('c', () => confirmPayment(s.id, seat.student_id), `Pembayaran ${p?.full_name} dikonfirmasi.`)}><Icon name="check" size={14} />Konfirmasi lunas</button>
      </div>
    </div>
  );
}
