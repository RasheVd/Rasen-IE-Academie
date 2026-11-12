import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { nextSessionCode } from '../domain/progress';
import { ATT_LABEL, COURSE_COLORS, KIND_LABEL, ROLE_LABEL, type Course, type Enrollment, type Material, type Profile, type Role, type Session } from '../domain/types';
import { removeCourse, removeEnrollment, removeMaterial, removePerson, removeSession, saveCourse, saveEnrollment, saveMaterial, savePerson, saveSession, submitReport, toast, useData, useStore, type ReportRow } from '../store';
import { Icon } from './Icon';
import { nameOf } from './bits';
import { Field, Modal, colorVar, confirmDialog } from './ui';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Terjadi kesalahan');
const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

function useSave(onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true); setError('');
    try { await fn(); toast(okMsg); onClose(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  return { busy, error, setError, run };
}

/* ── Orang (peserta, mentor, admin) ──────────────────────── */
export function PersonDialog({ person, role, onClose }: { person?: Profile; role: Role; onClose: () => void }) {
  const [f, setF] = useState({ full_name: person?.full_name ?? '', email: person?.email ?? '', note: person?.note ?? '', role: person?.role ?? role, active: person?.active ?? true });
  const { busy, error, setError, run } = useSave(onClose);
  const nav = useNavigate();
  const save = () => {
    if (!f.full_name.trim()) return setError('Isi nama lengkap.');
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return setError('Isi email yang benar. Peserta login dengan email ini.');
    run(() => savePerson({ id: person?.id, ...f, full_name: f.full_name.trim() }), person ? 'Data tersimpan' : `${ROLE_LABEL[f.role]} ditambahkan`);
  };
  const del = async () => {
    if (!person) return;
    if (!(await confirmDialog({ title: `Hapus ${nameOf(person)}?`, danger: true, confirm: 'Hapus', body: 'Pendaftaran, nilai tes, dan materi khusus orang ini ikut terhapus. Tindakan ini tidak bisa dibatalkan.' }))) return;
    run(async () => { await removePerson(person.id); nav(person.role === 'mentor' ? '/mentor' : '/peserta'); }, 'Dihapus');
  };
  return (
    <Modal title={person ? `Ubah ${ROLE_LABEL[person.role].toLowerCase()}` : `Tambah ${ROLE_LABEL[role].toLowerCase()}`} onClose={onClose} footer={<>
      {person && <button className="btn danger left" onClick={del} disabled={busy}>Hapus</button>}
      <button className="btn" onClick={onClose}>Batal</button>
      <button className="btn primary" onClick={save} disabled={busy}>Simpan</button>
    </>}>
      <Field label="Nama lengkap">{(i) => <input id={i} className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoFocus />}</Field>
      <Field label="Email" hint={person?.user_id ? 'Akun sudah tertaut. Mengubah email tidak memindahkan akunnya.' : 'Orang ini mendaftar di halaman Masuk dengan email yang sama, lalu akunnya langsung tertaut.'}>{(i) => <input id={i} type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
      <div className="grid-2">
        <Field label="Peran">{(i) => <select id={i} className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{(['student', 'mentor', 'admin'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>}</Field>
        <Field label="Status">{(i) => <select id={i} className="select" value={f.active ? '1' : '0'} onChange={(e) => setF({ ...f, active: e.target.value === '1' })}><option value="1">Aktif</option><option value="0">Nonaktif (tidak bisa masuk)</option></select>}</Field>
      </div>
      <Field label="Catatan" hint="Angkatan, kampus, atau hal lain yang perlu diingat.">{(i) => <input id={i} className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />}</Field>
      {error && <p className="error strong down" role="alert">{error}</p>}
    </Modal>
  );
}

/* ── Mata kuliah ─────────────────────────────────────────── */
export function CourseDialog({ course, onClose }: { course?: Course; onClose: () => void }) {
  const data = useData();
  const [f, setF] = useState({ code: course?.code ?? '', title: course?.title ?? '', description: course?.description ?? '', color: course?.color ?? COURSE_COLORS[data.courses.length % COURSE_COLORS.length], active: course?.active ?? true });
  const { busy, error, setError, run } = useSave(onClose);
  const save = () => {
    if (!f.code.trim() || !f.title.trim()) return setError('Isi kode dan nama mata kuliah.');
    run(() => saveCourse({ id: course?.id, ...f, title: f.title.trim() }), 'Mata kuliah tersimpan');
  };
  const del = async () => {
    if (!course) return;
    if (!(await confirmDialog({ title: `Hapus ${course.code}?`, danger: true, confirm: 'Hapus', body: 'Pendaftaran dan materi mata kuliah ini ikut terhapus. Mata kuliah yang masih punya sesi tidak bisa dihapus.' }))) return;
    run(() => removeCourse(course.id), 'Mata kuliah dihapus');
  };
  return (
    <Modal title={course ? 'Ubah mata kuliah' : 'Tambah mata kuliah'} onClose={onClose} footer={<>
      {course && <button className="btn danger left" onClick={del} disabled={busy}>Hapus</button>}
      <button className="btn" onClick={onClose}>Batal</button>
      <button className="btn primary" onClick={save} disabled={busy}>Simpan</button>
    </>}>
      <div className="grid-3">
        <Field label="Kode" hint="Contoh: IE2101">{(i) => <input id={i} className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} autoFocus />}</Field>
        <Field label="Nama mata kuliah" className="span-2">{(i) => <input id={i} className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Penelitian Operasional I" />}</Field>
      </div>
      <Field label="Deskripsi">{(i) => <textarea id={i} className="textarea" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Cakupan materi les untuk mata kuliah ini." />}</Field>
      <div className="field">
        <span className="field-label">Warna</span>
        <div className="row wrap" role="radiogroup" aria-label="Warna mata kuliah">
          {COURSE_COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={f.color === c} aria-label={c} onClick={() => setF({ ...f, color: c })} style={{ width: 36, height: 36, background: `var(--${c})`, border: f.color === c ? '3px solid var(--ink)' : '1.5px solid var(--ink)', outlineOffset: 3, padding: 0 }} />)}
        </div>
      </div>
      {error && <p className="error strong down" role="alert">{error}</p>}
    </Modal>
  );
}

/* ── Pendaftaran peserta ke mata kuliah ──────────────────── */
export function EnrollDialog({ studentId, enrollment, onClose }: { studentId: string; enrollment?: Enrollment; onClose: () => void }) {
  const data = useData();
  const taken = new Set(data.enrollments.filter((e) => e.student_id === studentId && e.id !== enrollment?.id).map((e) => e.course_id));
  const options = data.courses.filter((c) => c.active && !taken.has(c.id));
  const mentors = data.profiles.filter((p) => p.role === 'mentor' && p.active);
  const [f, setF] = useState({ course_id: enrollment?.course_id ?? options[0]?.id ?? '', mentor_id: enrollment?.mentor_id ?? '', target_sessions: enrollment?.target_sessions ?? 8, status: enrollment?.status ?? 'active' });
  const { busy, error, setError, run } = useSave(onClose);
  const save = () => {
    if (!f.course_id) return setError('Pilih mata kuliah.');
    run(() => saveEnrollment({ id: enrollment?.id, student_id: studentId, ...f, mentor_id: f.mentor_id || null, target_sessions: Number(f.target_sessions) || 8 } as Partial<Enrollment>), 'Pendaftaran tersimpan');
  };
  const del = async () => {
    if (!enrollment) return;
    if (!(await confirmDialog({ title: 'Cabut pendaftaran?', danger: true, confirm: 'Cabut', body: 'Riwayat sesi dan nilai tetap tersimpan. Peserta tidak lagi melihat materi umum mata kuliah ini kecuali lewat sesi yang pernah diikuti.' }))) return;
    run(() => removeEnrollment(enrollment.id), 'Pendaftaran dicabut');
  };
  return (
    <Modal title={enrollment ? 'Ubah pendaftaran' : 'Daftarkan ke mata kuliah'} onClose={onClose} footer={<>
      {enrollment && <button className="btn danger left" onClick={del} disabled={busy}>Cabut</button>}
      <button className="btn" onClick={onClose}>Batal</button>
      <button className="btn primary" onClick={save} disabled={busy}>Simpan</button>
    </>}>
      {options.length === 0 && !enrollment ? <p>Semua mata kuliah aktif sudah diambil peserta ini. Tambah mata kuliah baru di menu Mata Kuliah.</p> : <>
        <Field label="Mata kuliah">{(i) => <select id={i} className="select" value={f.course_id} disabled={!!enrollment} onChange={(e) => setF({ ...f, course_id: e.target.value })}>{(enrollment ? data.courses.filter((c) => c.id === enrollment.course_id) : options).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select>}</Field>
        <div className="grid-2">
          <Field label="Mentor utama">{(i) => <select id={i} className="select" value={f.mentor_id ?? ''} onChange={(e) => setF({ ...f, mentor_id: e.target.value })}><option value="">Belum ditentukan</option>{mentors.map((m) => <option key={m.id} value={m.id}>{nameOf(m)}</option>)}</select>}</Field>
          <Field label="Target jumlah sesi">{(i) => <input id={i} type="number" min={1} max={100} className="input" value={f.target_sessions} onChange={(e) => setF({ ...f, target_sessions: Number(e.target.value) })} />}</Field>
        </div>
        {enrollment && <Field label="Status">{(i) => <select id={i} className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Enrollment['status'] })}><option value="active">Aktif</option><option value="paused">Jeda</option><option value="finished">Selesai</option></select>}</Field>}
      </>}
      {error && <p className="error strong down" role="alert">{error}</p>}
    </Modal>
  );
}

/* ── Sesi ────────────────────────────────────────────────── */
export function SessionDialog({ session, preset, onClose }: { session?: Session; preset?: { course_id?: string; student_id?: string }; onClose: () => void }) {
  const data = useData();
  const gcal = useStore((r) => r.gcal);
  const nav = useNavigate();
  const courses = data.courses.filter((c) => c.active || c.id === session?.course_id);
  const mentors = data.profiles.filter((p) => p.role === 'mentor' && (p.active || p.id === session?.mentor_id));
  const start = session ? new Date(session.starts_at) : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(16, 0, 0, 0); return d; })();
  const firstCourse = preset?.course_id ?? courses[0]?.id ?? '';
  const [f, setF] = useState({
    course_id: session?.course_id ?? firstCourse, mentor_id: session?.mentor_id ?? '', date: format(start, 'yyyy-MM-dd'), time: format(start, 'HH:mm'),
    duration_min: session?.duration_min ?? 60, mode: session?.mode ?? 'private', place: session?.place ?? '', topic: session?.topic ?? '',
    pretest_url: session?.pretest_url ?? '', posttest_url: session?.posttest_url ?? '', code: session?.code ?? '',
  });
  const [students, setStudents] = useState<string[]>(session ? data.links.filter((l) => l.session_id === session.id).map((l) => l.student_id) : preset?.student_id ? [preset.student_id] : []);
  const { busy, error, setError, run } = useSave(onClose);
  const course = data.courses.find((c) => c.id === f.course_id);
  const autoCode = course ? nextSessionCode(course.code, data.sessions.map((s) => s.code)) : '';
  // Peserta mata kuliah ini di atas, yang lain di bawah.
  const enrolled = new Set(data.enrollments.filter((e) => e.course_id === f.course_id).map((e) => e.student_id));
  const pool = data.profiles.filter((p) => p.role === 'student' && (p.active || students.includes(p.id))).sort((a, b) => Number(enrolled.has(b.id)) - Number(enrolled.has(a.id)) || nameOf(a).localeCompare(nameOf(b)));
  const max = f.mode === 'private' ? 1 : 5;
  const toggle = (id: string) => setStudents((s) => (s.includes(id) ? s.filter((x) => x !== id) : f.mode === 'private' ? [id] : [...s, id]));
  const pickCourse = (id: string) => {
    const mentor = data.enrollments.find((e) => e.course_id === id && students.includes(e.student_id) && e.mentor_id)?.mentor_id;
    setF((x) => ({ ...x, course_id: id, mentor_id: x.mentor_id || mentor || '' }));
  };

  const save = () => {
    if (!f.course_id) return setError('Pilih mata kuliah. Belum ada? Tambah dulu di menu Mata Kuliah.');
    if (!f.date || !f.time) return setError('Isi tanggal dan jam.');
    if (students.length === 0) return setError('Pilih minimal satu peserta.');
    if (students.length > max) return setError(f.mode === 'private' ? 'Sesi private hanya untuk satu peserta.' : 'Kelas bersama maksimal lima peserta.');
    for (const [k, v] of [['pretest', f.pretest_url], ['posttest', f.posttest_url]] as const) if (v.trim() && !isUrl(v)) return setError(`Tautan ${k} harus diawali https://`);
    const starts_at = new Date(`${f.date}T${f.time}:00`).toISOString();
    run(async () => {
      const r = await saveSession({
        id: session?.id, code: (f.code.trim() || autoCode).toUpperCase(), course_id: f.course_id, mentor_id: f.mentor_id || null, starts_at,
        duration_min: Number(f.duration_min) || 60, mode: f.mode as Session['mode'], place: f.place.trim(), topic: f.topic.trim(),
        pretest_url: f.pretest_url.trim(), posttest_url: f.posttest_url.trim(),
      }, students);
      if (r.gcal === 'failed') toast('Sesi tersimpan, tetapi gagal ditulis ke Google Calendar. Coba simpan ulang.', 'error');
      if (!session) nav(`/sesi/${r.session.id}`);
    }, gcal?.connected ? 'Sesi tersimpan dan ditulis ke Google Calendar' : 'Sesi tersimpan');
  };
  const del = async () => {
    if (!session) return;
    if (!(await confirmDialog({ title: `Hapus sesi ${session.code}?`, danger: true, confirm: 'Hapus sesi', body: 'Nilai dan kehadiran sesi ini ikut terhapus. Untuk sesi yang tidak jadi berlangsung, lebih aman menandainya Batal lewat laporan.' }))) return;
    run(async () => { await removeSession(session); nav('/jadwal'); }, 'Sesi dihapus');
  };

  return (
    <Modal wide title={session ? `Ubah sesi ${session.code}` : 'Tambah sesi'} onClose={onClose} footer={<>
      {session && <button className="btn danger left" onClick={del} disabled={busy}>Hapus</button>}
      <button className="btn" onClick={onClose}>Batal</button>
      <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Menyimpan' : 'Simpan sesi'}</button>
    </>}>
      <div className="grid-3">
        <Field label="Mata kuliah" className="span-2">{(i) => <select id={i} className="select" value={f.course_id} onChange={(e) => pickCourse(e.target.value)}>{courses.length === 0 && <option value="">Belum ada mata kuliah</option>}{courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select>}</Field>
        <Field label="Kode sesi" hint={session ? undefined : 'Kosongkan untuk kode otomatis'}>{(i) => <input id={i} className="input" value={f.code} placeholder={autoCode} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />}</Field>
        <Field label="Tanggal">{(i) => <input id={i} type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />}</Field>
        <Field label="Jam mulai">{(i) => <input id={i} type="time" className="input" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />}</Field>
        <Field label="Durasi (menit)">{(i) => <input id={i} type="number" min={15} max={240} step={15} className="input" value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: Number(e.target.value) })} />}</Field>
        <Field label="Mentor">{(i) => <select id={i} className="select" value={f.mentor_id ?? ''} onChange={(e) => setF({ ...f, mentor_id: e.target.value })}><option value="">Belum ditentukan</option>{mentors.map((m) => <option key={m.id} value={m.id}>{nameOf(m)}</option>)}</select>}</Field>
        <Field label="Jenis kelas">{(i) => <select id={i} className="select" value={f.mode} onChange={(e) => { const mode = e.target.value as Session['mode']; setF({ ...f, mode }); if (mode === 'private') setStudents((s) => s.slice(0, 1)); }}><option value="private">Private (1 peserta)</option><option value="group">Kelas bersama (maks. 5)</option></select>}</Field>
        <Field label="Tempat atau tautan">{(i) => <input id={i} className="input" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} placeholder="Zoom, Google Meet, ruang" />}</Field>
      </div>
      <Field label="Topik">{(i) => <input id={i} className="input" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="Metode simpleks: iterasi dan tabel optimal" />}</Field>
      <div className="field">
        <span className="field-label">Peserta ({students.length} dari {max})</span>
        {pool.length === 0 ? <p className="muted small">Belum ada peserta. Tambah dulu di menu Peserta.</p> : (
          <div className="checks">{pool.map((p) => <label key={p.id}><input type={f.mode === 'private' ? 'radio' : 'checkbox'} name="peserta" checked={students.includes(p.id)} onChange={() => toggle(p.id)} /><span className="grow">{nameOf(p)}</span>{enrolled.has(p.id) && <span className="tag plain">Terdaftar</span>}</label>)}</div>
        )}
      </div>
      <div className="grid-2">
        <Field label="Tautan pretest (Google Form)">{(i) => <input id={i} className="input" value={f.pretest_url} onChange={(e) => setF({ ...f, pretest_url: e.target.value })} placeholder="https://forms.gle/..." />}</Field>
        <Field label="Tautan posttest (Google Form)">{(i) => <input id={i} className="input" value={f.posttest_url} onChange={(e) => setF({ ...f, posttest_url: e.target.value })} placeholder="https://forms.gle/..." />}</Field>
      </div>
      <p className="small muted">{gcal?.connected ? 'Setelah disimpan, sesi ini langsung masuk ke Google Calendar mentor dan peserta sebagai undangan.' : 'Google Calendar belum disambungkan. Sesi tetap tersimpan, dan tiap orang bisa menambahkannya sendiri lewat tombol di halaman sesi.'}</p>
      {error && <p className="error strong down" role="alert">{error}</p>}
    </Modal>
  );
}

/* ── Laporan sesi: kehadiran dan nilai tes ───────────────── */
export function ReportDialog({ session, onClose }: { session: Session; onClose: () => void }) {
  const data = useData();
  const links = data.links.filter((l) => l.session_id === session.id);
  const [status, setStatus] = useState<Session['status']>(session.status === 'scheduled' ? 'done' : session.status);
  const [report, setReport] = useState(session.report);
  const [followup, setFollowup] = useState(session.followup);
  const [rows, setRows] = useState(links.map((l) => ({ student_id: l.student_id, attendance: l.attendance ?? 'present', pre: l.pretest_score == null ? '' : String(l.pretest_score), post: l.posttest_score == null ? '' : String(l.posttest_score) })));
  const { busy, error, setError, run } = useSave(onClose);
  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  const save = () => {
    const out: ReportRow[] = [];
    for (const r of rows) {
      const pre = num(r.pre), post = num(r.post);
      for (const v of [pre, post]) if (v != null && (isNaN(v) || v < 0 || v > 100)) return setError('Nilai tes harus angka 0 sampai 100. Kosongkan bila peserta tidak mengikuti tes.');
      out.push({ student_id: r.student_id, attendance: status === 'done' ? r.attendance : '', pretest_score: status === 'done' ? pre : null, posttest_score: status === 'done' ? post : null });
    }
    run(() => submitReport(session.id, status, report.trim(), followup.trim(), out), status === 'cancelled' ? 'Sesi ditandai batal' : 'Laporan tersimpan');
  };
  return (
    <Modal wide title={`Laporan ${session.code}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Batal</button>
      <button className="btn primary" onClick={save} disabled={busy}>Simpan laporan</button>
    </>}>
      <div className="seg" role="group" aria-label="Status sesi">
        <button aria-pressed={status === 'done'} onClick={() => setStatus('done')}>Terlaksana</button>
        <button aria-pressed={status === 'scheduled'} onClick={() => setStatus('scheduled')}>Belum berlangsung</button>
        <button aria-pressed={status === 'cancelled'} onClick={() => setStatus('cancelled')}>Batal</button>
      </div>
      {status === 'done' && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Peserta</th><th>Kehadiran</th><th className="r">Pretest</th><th className="r">Posttest</th></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const p = data.profiles.find((x) => x.id === r.student_id);
                const absent = r.attendance !== 'present';
                return (
                  <tr key={r.student_id}>
                    <td className="strong">{nameOf(p)}</td>
                    <td><select className="select" style={{ minHeight: 38, padding: '6px 30px 6px 8px' }} value={r.attendance} aria-label={`Kehadiran ${nameOf(p)}`} onChange={(e) => setRow(i, { attendance: e.target.value as any })}>{Object.entries(ATT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                    <td className="r"><input className="input score" inputMode="decimal" value={r.pre} disabled={absent} placeholder="–" aria-label={`Nilai pretest ${nameOf(p)}`} onChange={(e) => setRow(i, { pre: e.target.value })} /></td>
                    <td className="r"><input className="input score" inputMode="decimal" value={r.post} disabled={absent} placeholder="–" aria-label={`Nilai posttest ${nameOf(p)}`} onChange={(e) => setRow(i, { post: e.target.value })} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {status === 'done' && <p className="small muted">Skala 0 sampai 100. Tes yang tidak diikuti dibiarkan kosong, jangan diisi nilai perkiraan.</p>}
      <Field label={status === 'cancelled' ? 'Alasan batal' : 'Catatan sesi dan kendala'}>{(i) => <textarea id={i} className="textarea" rows={3} value={report} onChange={(e) => setReport(e.target.value)} placeholder={status === 'cancelled' ? 'Siapa yang membatalkan dan kapan diberi tahu.' : 'Topik yang selesai dibahas, bagian yang masih sulit.'} />}</Field>
      {status !== 'cancelled' && <Field label="Tindak lanjut">{(i) => <textarea id={i} className="textarea" rows={2} value={followup} onChange={(e) => setFollowup(e.target.value)} placeholder="Latihan untuk sesi berikutnya." />}</Field>}
      {error && <p className="error strong down" role="alert">{error}</p>}
    </Modal>
  );
}

/* ── Materi ──────────────────────────────────────────────── */
export function MaterialDialog({ material, preset, onClose }: { material?: Material; preset?: { course_id?: string; student_id?: string; session_id?: string }; onClose: () => void }) {
  const data = useData();
  const [f, setF] = useState({
    course_id: material?.course_id ?? preset?.course_id ?? data.courses[0]?.id ?? '', student_id: material?.student_id ?? preset?.student_id ?? '', session_id: material?.session_id ?? preset?.session_id ?? '',
    title: material?.title ?? '', kind: material?.kind ?? 'ppt', url: material?.url ?? '', description: material?.description ?? '',
  });
  const { busy, error, setError, run } = useSave(onClose);
  const enrolled = data.enrollments.filter((e) => e.course_id === f.course_id).map((e) => data.profiles.find((p) => p.id === e.student_id)).filter(Boolean) as Profile[];
  const students = [...new Map([...enrolled, ...data.profiles.filter((p) => p.id === f.student_id)].map((p) => [p.id, p])).values()];
  const sessions = data.sessions.filter((s) => s.course_id === f.course_id && (!f.student_id || data.links.some((l) => l.session_id === s.id && l.student_id === f.student_id)));
  const save = () => {
    if (!f.course_id) return setError('Pilih mata kuliah.');
    if (!f.title.trim()) return setError('Isi judul materi.');
    if (!isUrl(f.url)) return setError('Isi tautan yang diawali https://, misalnya tautan Google Drive.');
    run(() => saveMaterial({ id: material?.id, ...f, title: f.title.trim(), url: f.url.trim(), student_id: f.student_id || null, session_id: f.session_id || null } as Partial<Material>), 'Materi tersimpan');
  };
  const del = async () => {
    if (!material) return;
    if (!(await confirmDialog({ title: 'Hapus materi ini?', danger: true, confirm: 'Hapus', body: 'Peserta tidak lagi melihat tautan ini. Berkas aslinya di Drive tidak ikut terhapus.' }))) return;
    run(() => removeMaterial(material.id), 'Materi dihapus');
  };
  return (
    <Modal title={material ? 'Ubah materi' : 'Tambah materi'} onClose={onClose} footer={<>
      {material && <button className="btn danger left" onClick={del} disabled={busy}>Hapus</button>}
      <button className="btn" onClick={onClose}>Batal</button>
      <button className="btn primary" onClick={save} disabled={busy}>Simpan</button>
    </>}>
      <Field label="Judul">{(i) => <input id={i} className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="PPT 04: Dualitas dan analisis sensitivitas" autoFocus />}</Field>
      <div className="grid-3">
        <Field label="Jenis">{(i) => <select id={i} className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Material['kind'] })}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</Field>
        <Field label="Tautan" className="span-2" hint="Tautan Google Drive, YouTube, atau situs lain. Atur izin berbaginya di sana.">{(i) => <input id={i} className="input" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://drive.google.com/..." />}</Field>
      </div>
      <Field label="Mata kuliah">{(i) => <select id={i} className="select" value={f.course_id} onChange={(e) => setF({ ...f, course_id: e.target.value, session_id: '' })}>{data.courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select>}</Field>
      <div className="grid-2">
        <Field label="Untuk siapa">{(i) => <select id={i} className="select" value={f.student_id ?? ''} onChange={(e) => setF({ ...f, student_id: e.target.value, session_id: '' })}><option value="">Semua peserta mata kuliah ini</option>{students.map((p) => <option key={p.id} value={p.id}>Hanya {nameOf(p)}</option>)}</select>}</Field>
        <Field label="Sesi terkait">{(i) => <select id={i} className="select" value={f.session_id ?? ''} onChange={(e) => setF({ ...f, session_id: e.target.value })}><option value="">Tidak terkait sesi</option>{sessions.map((s) => <option key={s.id} value={s.id}>{s.code} · {format(new Date(s.starts_at), 'd/M/yy')}</option>)}</select>}</Field>
      </div>
      <Field label="Keterangan">{(i) => <input id={i} className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Baca slide 1 sampai 20 sebelum sesi." />}</Field>
      {error && <p className="error strong down" role="alert">{error}</p>}
    </Modal>
  );
}

export { colorVar, Icon };
