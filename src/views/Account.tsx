import { useState } from 'react';
import { Shell } from '../components/Shell';
import { Field } from '../components/ui';
import { GoogleCard } from '../components/google';
import { AdminContact, useAction } from '../components/bits';
import { auth, updateMyProfile, updatePrefs, useData, useMe } from '../store';
import { Link } from 'react-router-dom';
import { useTitle } from '../hooks';
import { ROLE_LABEL } from '../domain/types';

export default function Account() {
  useTitle('Akun');
  const me = useMe();
  const data = useData();
  const { busy, run } = useAction();
  const [f, setF] = useState({ full_name: me.full_name, phone: me.phone, bio: me.bio, meeting_link: me.meeting_link, learning_needs: me.learning_needs });
  const [pw, setPw] = useState('');
  const dirty = JSON.stringify(f) !== JSON.stringify({ full_name: me.full_name, phone: me.phone, bio: me.bio, meeting_link: me.meeting_link, learning_needs: me.learning_needs });
  return (
    <Shell title="Akun & Google" narrow>
      <div className="page-head"><div><h1 className="h-page">Akun & Google</h1><p className="lead">{me.email} · {ROLE_LABEL[me.role]}</p></div></div>
      <GoogleCard />
      <section className="card stack">
        <div className="h-card">Profil</div>
        <div className="form-grid">
          <Field label="Nama lengkap">{(id) => <input id={id} className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />}</Field>
          <Field label="Nomor WhatsApp" hint={me.role === 'student' ? 'Dipakai mentor untuk mengabari perubahan jadwal.' : 'Dipakai peserta dan admin untuk menghubungimu.'}>
            {(id) => <input id={id} className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="08…" />}
          </Field>
          {me.role === 'student' && (
            <Field label="Kebutuhan belajar (opsional)" className="full" hint="Misalnya lebih nyaman online, butuh penjelasan lebih pelan, atau kebutuhan aksesibilitas. Hanya terlihat oleh mentor sesimu dan admin.">
              {(id) => <textarea id={id} className="textarea" value={f.learning_needs} onChange={(e) => setF({ ...f, learning_needs: e.target.value })} />}
            </Field>
          )}
          {me.role !== 'student' && (
            <>
              <Field label="Tautan kelas online" className="full" hint="Google Meet atau Zoom tetapmu. Otomatis dipakai untuk sesi baru.">
                {(id) => <input id={id} className="input" value={f.meeting_link} onChange={(e) => setF({ ...f, meeting_link: e.target.value })} placeholder="https://meet.google.com/…" />}
              </Field>
              <Field label="Bio singkat" className="full" hint="Tampil ke peserta saat memilih mentor.">
                {(id) => <textarea id={id} className="textarea" value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} placeholder="Teknik Industri ITS 2021, asisten Statistika Industri." />}
              </Field>
            </>
          )}
        </div>
        <button className="btn primary" style={{ justifySelf: 'start' }} disabled={!dirty || !!busy} onClick={() => run('p', () => updateMyProfile(f), 'Profil tersimpan.')}>Simpan profil</button>
      </section>
      <section className="card stack">
        <div className="h-card">Tampilan untukmu</div>
        <div className="row wrap between">
          <div><div className="strong small">Kepadatan</div><div className="small muted">Padat menampilkan lebih banyak isi di layar kecil.</div></div>
          <div className="seg" role="group" aria-label="Kepadatan tampilan">
            {(['nyaman', 'padat'] as const).map((d) => <button key={d} aria-pressed={(me.prefs?.density ?? 'nyaman') === d} onClick={() => updatePrefs({ density: d })}>{d === 'nyaman' ? 'Nyaman' : 'Padat'}</button>)}
          </div>
        </div>
        <div className="row wrap between">
          <div><div className="strong small">Tampilan kalender awal</div><div className="small muted">Bisa diganti juga dengan tombol d, w, m di halaman kalender.</div></div>
          <div className="seg" role="group" aria-label="Tampilan kalender awal">
            {(['day', 'week', 'month'] as const).map((v) => <button key={v} aria-pressed={(me.prefs?.calendar_view ?? 'week') === v} onClick={() => updatePrefs({ calendar_view: v })}>{v === 'day' ? 'Hari' : v === 'week' ? 'Minggu' : 'Bulan'}</button>)}
          </div>
        </div>
        <Link to="/ruang-kerja" className="small">Atur isi ruang kerja</Link>
      </section>
      <section className="card stack">
        <div className="h-card">Kata sandi</div>
        <Field label="Kata sandi baru" hint="Minimal 8 karakter.">{(id) => <input id={id} className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
        <div className="row wrap">
          <button className="btn" disabled={pw.length < 8 || !!busy} onClick={() => run('pw', async () => { await auth.setPassword(pw); setPw(''); }, 'Kata sandi diganti.')}>Ganti kata sandi</button>
          <button className="btn ghost" onClick={() => auth.signOut()}>Keluar dari akun</button>
        </div>
      </section>
      <AdminContact settings={data.settings} />
    </Shell>
  );
}
