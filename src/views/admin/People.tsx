import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { Field, Modal, Empty } from '../../components/ui';
import { Avatar, Banner, WaButton, useAction } from '../../components/bits';
import { invite, inviteLink, resendInvite, setEnrollment, toast, useData, useMe, type InviteResult } from '../../store';
import { useTitle } from '../../hooks';
import { shortDate, toLocal } from '../../domain/time';
import { inviteMessage } from '../../domain/wa';
import { ROLE_LABEL, type Data, type Profile, type Role } from '../../domain/types';

export default function People({ role }: { role: Role }) {
  const label = role === 'student' ? 'Peserta' : 'Mentor';
  useTitle(label);
  const me = useMe();
  const data = useData();
  const [params, setParams] = useSearchParams();
  const [inviting, setInviting] = useState(params.get('undang') === '1');
  const [q, setQ] = useState('');
  const admin = me.role === 'admin';
  let people = data.profiles.filter((p) => p.role === role || (admin && role === 'mentor' && p.role === 'admin'));
  if (q.trim()) { const n = q.trim().toLowerCase(); people = people.filter((p) => p.full_name.toLowerCase().includes(n) || p.email.includes(n)); }
  const close = () => { setInviting(false); if (params.has('undang')) { params.delete('undang'); setParams(params, { replace: true }); } };
  return (
    <Shell title={label}>
      <div className="page-head">
        <div><h1 className="h-page">{admin ? label : 'Peserta saya'}</h1><p className="lead">{admin ? `Undang lewat email. ${label} membuat kata sandinya sendiri, tanpa perlu persetujuan lagi.` : 'Peserta yang pernah atau akan kamu ajar.'}</p></div>
        {admin && <button className="btn primary" onClick={() => setInviting(true)}><Icon name="plus" />Undang {label.toLowerCase()}</button>}
      </div>
      <input className="input" style={{ maxWidth: 320 }} placeholder="Cari nama atau email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari" />
      <div className="card flush">
        {people.length === 0 ? <Empty title={`Belum ada ${label.toLowerCase()}`} /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Nama</th><th>{role === 'student' ? 'Mata kuliah' : 'Mengajar'}</th><th>Status</th>{admin && <th />}</tr></thead>
              <tbody>{people.map((p) => <PersonRow key={p.id} p={p} data={data} admin={admin} />)}</tbody>
            </table>
          </div>
        )}
      </div>
      {inviting && <InviteForm role={role} data={data} onClose={close} />}
    </Shell>
  );
}

function PersonRow({ p, data, admin }: { p: Profile; data: Data; admin: boolean }) {
  const { busy, run } = useAction();
  const [link, setLink] = useState<string | null>(null);
  const courses = p.role === 'student'
    ? data.enrollments.filter((e) => e.student_id === p.id).map((e) => ({ c: data.courses.find((c) => c.id === e.course_id), pending: false }))
    : data.mentorCourses.filter((m) => m.mentor_id === p.id).map((m) => ({ c: data.courses.find((c) => c.id === m.course_id), pending: m.status === 'pending' }));
  return (
    <tr>
      <td>
        <Link to={`/orang/${p.id}`} className="row" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Avatar name={p.full_name} sm />
          <div><div className="strong">{p.full_name}{p.role === 'admin' && <span className="pill brand" style={{ marginLeft: 6 }}>Admin</span>}</div><div className="tiny muted">{p.email}</div></div>
        </Link>
      </td>
      <td>
        <div className="row wrap" style={{ gap: 4 }}>
          {courses.length === 0 && <span className="small faint">Belum ada</span>}
          {courses.slice(0, 4).map(({ c, pending }) => c && <span key={c.id} className={`pill ${pending ? 'warn' : ''}`} title={c.title}>{c.code}{pending ? ' · menunggu' : ''}</span>)}
          {courses.length > 4 && <span className="small muted">+{courses.length - 4}</span>}
        </div>
      </td>
      <td className="nowrap">
        {!p.active ? <span className="pill">Nonaktif</span> : p.user_id ? <span className="pill ok">Aktif</span> : <span className="pill warn">Diundang{p.invited_at ? ` ${shortDate(toLocal(p.invited_at).date)}` : ''}</span>}
      </td>
      {admin && (
        <td className="r nowrap">
          {!p.user_id && p.active && (
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              {link ? (
                p.phone ? <WaButton phone={p.phone} sm label="Kirim tautan" text={inviteMessage({ name: p.full_name, role: ROLE_LABEL[p.role], link })} />
                  : <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(link); toast('Tautan disalin. Kirim lewat WhatsApp.'); }}>Salin tautan</button>
              ) : <button className="btn sm" disabled={!!busy} onClick={() => run('l', async () => { const r = await inviteLink(p.id); if (r.link) setLink(r.link); })}>Tautan WA</button>}
              <button className="btn sm" disabled={!!busy} onClick={() => run('r', async () => {
                const r = await resendInvite(p.id);
                if (r.status === 'email-failed') throw new Error(r.message || 'Email gagal terkirim. Pakai tombol Tautan WA.');
              }, 'Undangan dikirim ulang.')}>Kirim ulang</button>
            </div>
          )}
        </td>
      )}
    </tr>
  );
}

function InviteForm({ role, data, onClose }: { role: Role; data: Data; onClose: () => void }) {
  const { busy, run } = useAction();
  const [f, setF] = useState({ full_name: '', email: '', phone: '', note: '', role });
  const [courses, setCourses] = useState<string[]>([]);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const valid = f.full_name.trim().length > 1 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim());
  const label = ROLE_LABEL[f.role];
  async function submit() {
    const r = await run('i', async () => {
      const res = await invite({ ...f, full_name: f.full_name.trim() });
      if (res.profile_id && f.role === 'student') for (const c of courses) await setEnrollment(res.profile_id, c, true);
      return res;
    });
    if (!r) return;
    if (r.status === 'sent') { toast(`Undangan terkirim ke ${f.email}.`); onClose(); return; }
    setResult(r);
  }
  return (
    <Modal title={`Undang ${label.toLowerCase()}`} onClose={onClose} footer={result ? <button className="btn primary" onClick={onClose}>Selesai</button> : <>
      <button className="btn" onClick={onClose}>Batal</button>
      <button className="btn primary" disabled={!valid || !!busy} onClick={submit}>{busy ? 'Mengirim…' : 'Kirim undangan'}</button>
    </>}>
      {result ? (
        <div className="stack">
          {result.status === 'active' && <Banner tone="ok" icon="check" title="Sudah punya akun">{result.message}</Banner>}
          {result.status === 'email-failed' && (
            <>
              <Banner tone="warn" icon="mail" title="Email undangan belum bisa dikirim">{result.message}</Banner>
              <p className="small">Data {f.full_name} sudah tersimpan. Kirim tautan undangan lewat WhatsApp sebagai gantinya:</p>
              {link ? (
                <div className="stack sm">
                  {f.phone ? <WaButton phone={f.phone} label={`Kirim ke ${f.full_name.split(' ')[0]} lewat WhatsApp`} text={inviteMessage({ name: f.full_name, role: label, link })} />
                    : <button className="btn" onClick={() => { navigator.clipboard?.writeText(link); toast('Tautan disalin.'); }}>Salin tautan undangan</button>}
                  <p className="tiny muted">Tautan sekali pakai. Jangan dibagikan ke orang lain.</p>
                </div>
              ) : result.profile_id && <button className="btn primary" disabled={!!busy} onClick={() => run('l', async () => { const r = await inviteLink(result.profile_id!); if (r.link) setLink(r.link); })}>Buat tautan undangan</button>}
            </>
          )}
        </div>
      ) : (
        <div className="form-grid">
          <Field label="Nama lengkap" className="full">{(id) => <input id={id} className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoFocus />}</Field>
          <Field label="Email (Gmail disarankan)" hint="Email ini juga dipakai untuk Google Calendar.">{(id) => <input id={id} className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
          <Field label="Nomor WhatsApp">{(id) => <input id={id} className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="08…" />}</Field>
          {role === 'mentor' && (
            <Field label="Peran" className="full">{(id) => (
              <select id={id} className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
                <option value="mentor">Mentor</option><option value="admin">Admin</option>
              </select>
            )}</Field>
          )}
          {f.role === 'student' && (
            <Field label="Mata kuliah yang diambil" className="full" hint="Bisa diubah nanti di halaman peserta.">{() => (
              <CoursePicker data={data} value={courses} onChange={setCourses} />
            )}</Field>
          )}
          <Field label="Catatan internal" className="full">{(id) => <input id={id} className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Angkatan, asal kampus, sumber info" />}</Field>
        </div>
      )}
    </Modal>
  );
}

export function CoursePicker({ data, value, onChange }: { data: Data; value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState('');
  const n = q.trim().toLowerCase();
  const list = data.courses.filter((c) => c.active && (!n || c.title.toLowerCase().includes(n) || c.code.toLowerCase().includes(n)));
  const cats = [...new Set(list.map((c) => c.category))];
  return (
    <div className="stack sm">
      <input className="input sm" placeholder="Cari mata kuliah" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari mata kuliah" />
      <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8 }}>
        {cats.map((cat) => (
          <div key={cat} style={{ marginBottom: 6 }}>
            <div className="tiny muted strong">{cat}</div>
            {list.filter((c) => c.category === cat).map((c) => (
              <label key={c.id} className="check" style={{ padding: '3px 0' }}>
                <input type="checkbox" checked={value.includes(c.id)} onChange={(e) => onChange(e.target.checked ? [...value, c.id] : value.filter((x) => x !== c.id))} />
                <span>{c.title} <span className="muted small">{c.code}</span></span>
              </label>
            ))}
          </div>
        ))}
      </div>
      {value.length > 0 && <div className="small muted">{value.length} dipilih</div>}
    </div>
  );
}
