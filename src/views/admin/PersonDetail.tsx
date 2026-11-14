import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { Field, Modal, Empty } from '../../components/ui';
import { Avatar, Banner, SessionItem, WaButton, prettyPhone, useAction } from '../../components/bits';
import { StudentDashboard } from '../student/Dashboard';
import { grantCredit, saveEnrollment, saveProfile, setCompetency, setEnrollment, useData, useMe } from '../../store';
import { useTitle } from '../../hooks';
import { hm, shortDate, toLocal } from '../../domain/time';
import { ROLE_LABEL, WEEKDAYS, type Data, type Enrollment, type Profile } from '../../domain/types';

export default function PersonDetail() {
  const { id } = useParams();
  const data = useData();
  const me = useMe();
  const p = data.profiles.find((x) => x.id === id);
  useTitle(p?.full_name ?? 'Orang');
  const [edit, setEdit] = useState(false);
  if (!p) return <Shell title="Orang"><div className="card"><Empty title="Tidak ditemukan" /></div></Shell>;
  const admin = me.role === 'admin';
  const sessions = data.sessions.filter((s) => (p.role === 'student' ? data.seats.some((x) => x.session_id === s.id && x.student_id === p.id) : s.mentor_id === p.id))
    .filter((s) => admin || s.mentor_id === me.id).slice().reverse();
  return (
    <Shell title={p.full_name}>
      <div className="row"><Link to={p.role === 'student' ? '/peserta' : '/mentor'} className="small row" style={{ gap: 4 }}><Icon name="chevL" size={14} />{p.role === 'student' ? 'Peserta' : 'Mentor'}</Link></div>
      <div className="card row wrap between">
        <div className="row">
          <Avatar name={p.full_name} />
          <div>
            <h1 className="h-section">{p.full_name}</h1>
            <div className="small muted">{ROLE_LABEL[p.role]} · {p.email}{p.phone ? ` · ${prettyPhone(p.phone)}` : ''}{!p.active ? ' · nonaktif' : !p.user_id ? ' · undangan belum diterima' : ''}</div>
          </div>
        </div>
        <div className="row wrap">
          {p.phone && <WaButton phone={p.phone} sm text={`Halo ${p.full_name.split(' ')[0]}, ini dari IE.Academie.`} />}
          {admin && <button className="btn sm" onClick={() => setEdit(true)}><Icon name="edit" size={14} />Ubah</button>}
        </div>
      </div>
      {p.note && admin && <p className="small muted">Catatan: {p.note}</p>}
      {p.learning_needs && <Banner tone="info" icon="info" title="Kebutuhan belajar">{p.learning_needs}</Banner>}
      {p.bio && p.role !== 'student' && <p className="small">{p.bio}</p>}

      {p.role === 'student' && admin && <Enrollments p={p} data={data} />}
      {p.role === 'student' && admin && <Credits p={p} data={data} />}
      {p.role === 'student' && <StudentDashboard data={data} studentId={p.id} self={false} />}
      {p.role === 'mentor' && admin && <MentorAdmin p={p} data={data} />}

      <div className="card">
        <div className="card-head"><div className="h-card">Sesi ({sessions.length})</div></div>
        {sessions.length ? <div className="list">{sessions.slice(0, 40).map((s) => <SessionItem key={s.id} s={s} data={data} me={me} showStudents={p.role === 'mentor'} />)}</div> : <p className="small muted">Belum ada sesi.</p>}
      </div>
      {edit && <EditPerson p={p} onClose={() => setEdit(false)} />}
    </Shell>
  );
}

function Enrollments({ p, data }: { p: Profile; data: Data }) {
  const { busy, run } = useAction();
  const [goal, setGoal] = useState<Enrollment | null>(null);
  const [add, setAdd] = useState('');
  const mine = data.enrollments.filter((e) => e.student_id === p.id);
  const cats = [...new Set(data.courses.filter((c) => c.active).map((c) => c.category))];
  return (
    <section className="card stack">
      <div><div className="h-card">Mata kuliah yang diambil</div><div className="small muted">Peserta hanya bisa booking dan melihat mentor untuk mata kuliah ini.</div></div>
      {mine.length === 0 && <p className="small muted">Belum ada. Tambahkan supaya {p.full_name.split(' ')[0]} bisa booking.</p>}
      <div className="list">
        {mine.map((e) => {
          const c = data.courses.find((x) => x.id === e.course_id);
          return (
            <div key={e.id} className="list-item">
              <span className="chip" style={{ ['--c' as string]: `var(--${c?.color ?? 'teal'})` }}>{c?.code}</span>
              <div className="grow"><div className="t">{c?.title}</div><div className="meta">{e.goal_text ? `Target: ${e.goal_text}${e.goal_date ? ` (${shortDate(e.goal_date)})` : ''}` : 'Belum ada target'}{e.status !== 'active' ? ` · ${e.status === 'paused' ? 'dijeda' : 'selesai'}` : ''}</div></div>
              <button className="btn sm" onClick={() => setGoal(e)}>Target</button>
              <button className="btn ghost icon sm" aria-label={`Lepas ${c?.title}`} disabled={!!busy} onClick={() => run('x', () => setEnrollment(p.id, e.course_id, false), 'Mata kuliah dilepas.')}><Icon name="close" /></button>
            </div>
          );
        })}
      </div>
      <div className="row wrap">
        <select className="select" style={{ maxWidth: 380 }} value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Tambah mata kuliah">
          <option value="">Tambah mata kuliah…</option>
          {cats.map((cat) => <optgroup key={cat} label={cat}>{data.courses.filter((c) => c.active && c.category === cat && !mine.some((m) => m.course_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</optgroup>)}
        </select>
        <button className="btn" disabled={!add || !!busy} onClick={() => run('a', async () => { await setEnrollment(p.id, add, true); setAdd(''); }, 'Mata kuliah ditambahkan.')}>Tambah</button>
      </div>
      {goal && <GoalForm e={goal} onClose={() => setGoal(null)} />}
    </section>
  );
}

function GoalForm({ e, onClose }: { e: Enrollment; onClose: () => void }) {
  const { busy, run } = useAction();
  const [f, setF] = useState({ goal_text: e.goal_text, goal_date: e.goal_date ?? '', status: e.status });
  return (
    <Modal title="Target belajar" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Batal</button>
      <button className="btn primary" disabled={!!busy} onClick={() => run('g', async () => { await saveEnrollment({ id: e.id, goal_text: f.goal_text.trim(), goal_date: f.goal_date || null, status: f.status }); onClose(); }, 'Target tersimpan.')}>Simpan</button>
    </>}>
      <Field label="Target" hint="Contoh: Kuasai 5 topik sebelum UAS.">{(id) => <input id={id} className="input" value={f.goal_text} onChange={(x) => setF({ ...f, goal_text: x.target.value })} />}</Field>
      <Field label="Tenggat">{(id) => <input id={id} className="input" type="date" value={f.goal_date} onChange={(x) => setF({ ...f, goal_date: x.target.value })} />}</Field>
      <Field label="Status">{(id) => <select id={id} className="select" value={f.status} onChange={(x) => setF({ ...f, status: x.target.value as Enrollment['status'] })}><option value="active">Aktif (bisa booking)</option><option value="paused">Dijeda</option><option value="finished">Selesai</option></select>}</Field>
    </Modal>
  );
}

function Credits({ p, data }: { p: Profile; data: Data }) {
  const { busy, run } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [course, setCourse] = useState('');
  const list = data.credits.filter((c) => c.student_id === p.id);
  const left = list.filter((c) => !c.used_session);
  return (
    <section className="card">
      <div className="card-head"><div><div className="h-card">Kredit sesi</div><div className="sub">{left.length} tersedia · terpakai otomatis saat booking</div></div><button className="btn sm" onClick={() => setOpen(true)}><Icon name="plus" size={14} />Beri kredit</button></div>
      {list.length ? (
        <div className="list">
          {list.slice().reverse().slice(0, 8).map((c) => (
            <div key={c.id} className="list-item small">
              <span className={`pill ${c.used_session ? '' : 'ok'}`}>{c.used_session ? 'Terpakai' : 'Tersedia'}</span>
              <span className="grow">{c.reason || 'Kredit'}{c.course_id ? ` · ${data.courses.find((x) => x.id === c.course_id)?.code}` : ''}</span>
              <span className="muted">{shortDate(toLocal(c.created_at).date)}</span>
            </div>
          ))}
        </div>
      ) : <p className="small muted">Belum ada kredit.</p>}
      {open && (
        <Modal title="Beri kredit sesi" onClose={() => setOpen(false)} footer={<>
          <button className="btn" onClick={() => setOpen(false)}>Batal</button>
          <button className="btn primary" disabled={reason.trim().length < 3 || !!busy} onClick={() => run('c', async () => { await grantCredit(p.id, course || null, reason.trim()); setOpen(false); setReason(''); }, 'Kredit ditambahkan.')}>Simpan</button>
        </>}>
          <p className="small muted">Satu kredit = satu sesi tanpa bayar. Pakai untuk pembayaran tunai, kompensasi, atau paket.</p>
          <Field label="Alasan">{(id) => <input id={id} className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Bayar tunai 4 Des" />}</Field>
          <Field label="Berlaku untuk">{(id) => <select id={id} className="select" value={course} onChange={(e) => setCourse(e.target.value)}><option value="">Semua mata kuliah</option>{data.enrollments.filter((e) => e.student_id === p.id).map((e) => { const c = data.courses.find((x) => x.id === e.course_id); return <option key={e.id} value={e.course_id}>{c?.code} · {c?.title}</option>; })}</select>}</Field>
        </Modal>
      )}
    </section>
  );
}

function MentorAdmin({ p, data }: { p: Profile; data: Data }) {
  const { busy, run } = useAction();
  const [add, setAdd] = useState('');
  const comps = data.mentorCourses.filter((m) => m.mentor_id === p.id);
  const rules = data.rules.filter((r) => r.mentor_id === p.id && r.active).sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.start_min - b.start_min);
  const cats = [...new Set(data.courses.filter((c) => c.active).map((c) => c.category))];
  return (
    <div className="grid g2">
      <section className="card stack">
        <div><div className="h-card">Kompetensi</div><div className="small muted">Peserta hanya melihat mentor untuk mata kuliah yang disetujui.</div></div>
        <div className="list">
          {comps.length === 0 && <p className="small muted">Belum ada.</p>}
          {comps.map((m) => {
            const c = data.courses.find((x) => x.id === m.course_id);
            return (
              <div key={m.course_id} className="list-item">
                <div className="grow"><div className="t">{c?.title}</div><div className="meta">{c?.code}</div></div>
                {m.status === 'pending' ? <button className="btn sm primary" disabled={!!busy} onClick={() => run('a', () => setCompetency(p.id, m.course_id, 'approved'), 'Disetujui.')}>Setujui</button> : <span className="pill ok">Disetujui</span>}
                <button className="btn ghost icon sm" aria-label={`Hapus ${c?.title}`} disabled={!!busy} onClick={() => run('d', () => setCompetency(p.id, m.course_id, null), 'Dihapus.')}><Icon name="close" /></button>
              </div>
            );
          })}
        </div>
        <div className="row wrap">
          <select className="select" style={{ maxWidth: 300 }} value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Tambah kompetensi">
            <option value="">Tambah mata kuliah…</option>
            {cats.map((cat) => <optgroup key={cat} label={cat}>{data.courses.filter((c) => c.active && c.category === cat && !comps.some((m) => m.course_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</optgroup>)}
          </select>
          <button className="btn" disabled={!add || !!busy} onClick={() => run('n', async () => { await setCompetency(p.id, add, 'approved'); setAdd(''); }, 'Ditambahkan dan disetujui.')}>Tambah</button>
        </div>
      </section>
      <section className="card stack">
        <div className="row between"><div className="h-card">Ketersediaan mingguan</div><Link to="/hak" className="small">Hak mentor</Link></div>
        {rules.length ? (
          <div className="list">{rules.map((r) => <div key={r.id} className="list-item small"><b style={{ width: 70 }}>{WEEKDAYS[r.weekday]}</b><span className="grow">{hm(r.start_min)}–{hm(r.end_min)}</span><span className="muted">{r.modes === 'both' ? 'Private & bersama' : r.modes === 'private' ? 'Private' : 'Bersama'}</span></div>)}</div>
        ) : <p className="small muted">Mentor belum mengisi jam. Ia mengaturnya sendiri di menu Ketersediaan.</p>}
      </section>
    </div>
  );
}

function EditPerson({ p, onClose }: { p: Profile; onClose: () => void }) {
  const me = useMe();
  const { busy, run } = useAction();
  const [f, setF] = useState({ full_name: p.full_name, phone: p.phone, note: p.note, active: p.active, role: p.role });
  return (
    <Modal title={`Ubah ${p.full_name}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Batal</button>
      <button className="btn primary" disabled={!!busy || f.full_name.trim().length < 2} onClick={() => run('s', async () => { await saveProfile({ id: p.id, ...f, full_name: f.full_name.trim(), phone: f.phone.replace(/[^0-9+]/g, '') }); onClose(); }, 'Tersimpan.')}>Simpan</button>
    </>}>
      <Field label="Nama lengkap">{(id) => <input id={id} className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />}</Field>
      <Field label="Nomor WhatsApp">{(id) => <input id={id} className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />}</Field>
      <Field label="Catatan internal">{(id) => <input id={id} className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />}</Field>
      {p.id !== me.id && (
        <>
          <Field label="Peran">{(id) => <select id={id} className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Profile['role'] })}><option value="student">Peserta</option><option value="mentor">Mentor</option><option value="admin">Admin</option></select>}</Field>
          <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /><span>Akun aktif<br /><span className="small muted">Nonaktifkan untuk menutup akses tanpa menghapus riwayat.</span></span></label>
        </>
      )}
    </Modal>
  );
}
