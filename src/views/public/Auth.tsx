import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '../../components/Icon';
import { Field } from '../../components/ui';
import { Banner, Loading, WaButton } from '../../components/bits';
import { auth, load, toast, useStore } from '../../store';
import { useTitle } from '../../hooks';
import { usePublicInfo } from './Landing';

function Brand() {
  return <Link to="/" className="brand" style={{ padding: 0 }}><Logo /> <span>IE<span className="dot">.</span>Academie</span></Link>;
}

export function SignIn() {
  useTitle('Masuk');
  const info = usePublicInfo();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'forgot' | 'sent'>('in');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      if (mode === 'in') await auth.signIn(email, password);
      else { await auth.forgot(email); setMode('sent'); }
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit} noValidate>
        <Brand />
        <div>
          <h1 className="h-section">{mode === 'in' ? 'Masuk ke akunmu' : 'Atur ulang kata sandi'}</h1>
          <p className="small muted" style={{ marginTop: 4 }}>
            {mode === 'in' ? 'Akun dibuat lewat undangan admin. Belum punya? Hubungi admin.' : 'Kami kirim tautan untuk membuat kata sandi baru ke email ini.'}
          </p>
        </div>
        {mode === 'sent' ? (
          <Banner tone="ok" icon="mail" title="Cek kotak masuk email">Tautan atur ulang kata sandi sudah dikirim ke {email}. Tidak ada? Cek folder spam atau minta admin mengirim tautan lewat WhatsApp.</Banner>
        ) : (
          <>
            <Field label="Email">{(id) => <input id={id} className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />}</Field>
            {mode === 'in' && <Field label="Kata sandi">{(id) => <input id={id} className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>}
            {err && <div className="field"><span className="error" role="alert">{err}</span></div>}
            <button className="btn primary lg" disabled={busy || !email || (mode === 'in' && !password)}>{busy ? 'Memproses…' : mode === 'in' ? 'Masuk' : 'Kirim tautan'}</button>
          </>
        )}
        <div className="row between small">
          <button type="button" className="link-btn" onClick={() => { setMode(mode === 'in' ? 'forgot' : 'in'); setErr(''); }}>{mode === 'in' ? 'Lupa kata sandi?' : 'Kembali ke masuk'}</button>
          <Link to="/">Beranda</Link>
        </div>
        <WaButton phone={info.admin_whatsapp} text="Halo admin IE.Academie, saya butuh bantuan masuk akun." label={`Hubungi admin ${info.admin_whatsapp_label}`} block />
      </form>
    </div>
  );
}

/** Halaman tujuan tautan undangan dan atur ulang kata sandi: buat kata sandi lalu masuk. */
export function SetPassword() {
  useTitle('Buat kata sandi');
  const status = useStore((r) => r.status);
  const email = useStore((r) => r.email);
  const info = usePublicInfo();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Galat dari Supabase di URL (mis. tautan kedaluwarsa).
  const hashErr = new URLSearchParams(location.hash.slice(1)).get('error_description') || new URLSearchParams(location.search).get('error_description');
  // Tautan dari admin (WhatsApp) membawa token_hash; verifikasi di sini, tanpa bergantung pada Redirect URLs Supabase.
  // Dibaca sekali saat halaman dibuka: alamat dibersihkan setelah verifikasi, jadi jangan dibaca ulang tiap render.
  const [link] = useState(() => { const q = new URLSearchParams(location.search); return { hash: q.get('token_hash'), type: q.get('type') ?? 'invite' }; });
  const [verifying, setVerifying] = useState(!!link.hash);
  const [otpErr, setOtpErr] = useState('');
  useEffect(() => {
    if (!link.hash) return;
    auth.verifyLink(link.hash, link.type)
      .then(async () => { history.replaceState(null, '', '/undangan'); await load(); })
      .catch((x) => setOtpErr((x as Error).message))
      .finally(() => setVerifying(false));
  }, [link]);

  if (verifying || status === 'booting' || status === 'loading') return <Loading label="Memeriksa tautan…" />;
  if (otpErr || status === 'signed-out' || status === 'error') return (
    <div className="auth"><div className="auth-card">
      <Brand />
      <h1 className="h-section">Tautan tidak berlaku</h1>
      <p className="muted">{hashErr || otpErr ? `${hashErr || otpErr} ` : ''}Tautan undangan hanya bisa dipakai sekali dan punya batas waktu. Minta admin mengirim ulang, atau pakai "Lupa kata sandi" di halaman masuk.</p>
      <Link className="btn primary" to="/masuk">Ke halaman masuk</Link>
      <WaButton phone={info.admin_whatsapp} text="Halo admin IE.Academie, tautan undangan saya tidak berlaku. Mohon dikirim ulang." label={`Minta tautan baru ke ${info.admin_whatsapp_label}`} block />
    </div></div>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (pw.length < 8) return setErr('Kata sandi minimal 8 karakter.');
    if (pw !== pw2) return setErr('Dua kata sandi tidak sama.');
    setBusy(true);
    try {
      await auth.setPassword(pw);
      toast('Kata sandi tersimpan. Selamat datang!');
      await load();
      nav('/beranda', { replace: true });
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit} noValidate>
        <Brand />
        <div>
          <h1 className="h-section">Buat kata sandi</h1>
          <p className="small muted" style={{ marginTop: 4 }}>Untuk <b>{email}</b>. Kamu akan memakainya setiap kali masuk.</p>
        </div>
        <Field label="Kata sandi baru" hint="Minimal 8 karakter.">{(id) => <input id={id} className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />}</Field>
        <Field label="Ulangi kata sandi">{(id) => <input id={id} className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />}</Field>
        {err && <span className="error small" role="alert" style={{ color: 'var(--danger)', fontWeight: 600 }}>{err}</span>}
        <button className="btn primary lg" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan dan masuk'}</button>
      </form>
    </div>
  );
}
