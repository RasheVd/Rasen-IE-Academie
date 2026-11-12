import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { SessionBar } from '../components/bits';
import { Field } from '../components/ui';
import { useTitle } from '../hooks';
import { auth } from '../store';

type Mode = 'signin' | 'signup' | 'magic';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useTitle('Masuk');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setNotice(''); setBusy(true);
    try {
      if (mode === 'signin') await auth.signIn(email.trim(), password);
      else if (mode === 'signup') {
        const { needsConfirmation } = await auth.signUp(email.trim(), password);
        if (needsConfirmation) setNotice('Kami mengirim tautan konfirmasi ke emailmu. Buka tautan itu, lalu masuk di sini.');
      } else {
        await auth.magicLink(email.trim());
        setNotice('Tautan masuk sudah dikirim. Periksa kotak masuk emailmu.');
      }
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const swap = (m: Mode) => { setMode(m); setError(''); setNotice(''); };

  return (
    <div className="auth">
      <div className="auth-side">
        <Link to="/" className="brand" style={{ padding: 0 }}>IE<span>.</span>Academie</Link>
        <div className="display">Naik <em>nilai</em>,<br />sesi demi sesi.</div>
        <div><SessionBar /><p className="mono" style={{ marginTop: 10, color: 'var(--on-dark-muted)' }}>Satu sesi 60 menit, diukur di awal dan di akhir</p></div>
      </div>
      <form className="auth-form" onSubmit={submit} noValidate>
        <h1 className="page-title" style={{ fontSize: 'clamp(40px, 5vw, 64px)' }}>{mode === 'signup' ? 'Buat akun' : 'Masuk'}</h1>
        <p className="muted">{mode === 'signup' ? 'Pakai email yang kamu berikan ke admin IE.Academie. Akunmu langsung tertaut ke data lesmu.' : mode === 'magic' ? 'Kami kirim tautan sekali pakai ke emailmu.' : 'Untuk peserta, mentor, dan admin IE.Academie.'}</p>
        <Field label="Email">{(id) => <input id={id} className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />}</Field>
        {mode !== 'magic' && <Field label="Kata sandi" hint={mode === 'signup' ? 'Minimal 6 karakter' : undefined}>{(id) => <input id={id} className="input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>}
        {error && <p className="strong down" role="alert">{error}</p>}
        {notice && <p className="strong up" role="status">{notice}</p>}
        <button className="btn primary" type="submit" disabled={busy || !email || (mode !== 'magic' && password.length < 6)}>{busy ? 'Tunggu sebentar' : mode === 'signin' ? 'Masuk' : mode === 'signup' ? 'Buat akun' : 'Kirim tautan'}</button>
        <div className="row wrap" style={{ gap: 18, marginTop: 6 }}>
          {mode !== 'signin' && <button type="button" className="link" onClick={() => swap('signin')}>Sudah punya akun</button>}
          {mode !== 'signup' && <button type="button" className="link" onClick={() => swap('signup')}>Buat akun baru</button>}
          {mode !== 'magic' && <button type="button" className="link" onClick={() => swap('magic')}>Masuk lewat tautan email</button>}
        </div>
      </form>
    </div>
  );
}
