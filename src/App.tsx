import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Shell } from './components/Shell';
import { ConfirmHost } from './components/ui';
import { auth, load, useStore } from './store';
import { AuthScreen } from './views/Auth';
import { Landing } from './views/Landing';
import Home from './views/Home';
import Schedule from './views/Schedule';
import SessionDetail from './views/SessionDetail';
import Materials from './views/Materials';
import Progress from './views/Progress';
import People from './views/People';
import PersonDetail from './views/PersonDetail';
import Courses from './views/Courses';
import Settings from './views/Settings';

function Toasts() {
  const toasts = useStore((r) => r.toasts);
  return <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.tone ?? ''}`} role={t.tone ? 'alert' : 'status'}>{t.message}</div>)}</div>;
}
const Loading = () => <div className="center" role="status"><div className="loader" /><p className="mono">Memuat data</p></div>;

export function App() {
  const status = useStore((r) => r.status);
  const error = useStore((r) => r.error);
  const email = useStore((r) => r.email);
  const me = useStore((r) => r.me);
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  if (loc.pathname === '/') return <><Landing /><Toasts /></>;
  let body;
  if (status === 'booting' || status === 'loading') body = <Loading />;
  else if (status === 'signed-out') body = <AuthScreen />;
  else if (status === 'error') body = (
    <div className="center" role="alert">
      <h1 className="page-title">Gagal memuat</h1>
      <p className="muted" style={{ maxWidth: '50ch' }}>{error}</p>
      <button className="btn primary" onClick={() => load()}>Coba lagi</button>
    </div>
  );
  else if (status === 'no-profile') body = (
    <div className="center">
      <h1 className="page-title">Akun belum terdaftar</h1>
      <p style={{ maxWidth: '54ch' }}>Kamu masuk sebagai <b>{email}</b>, tetapi email ini belum didaftarkan admin IE.Academie. Minta admin menambahkan email ini sebagai peserta atau mentor, lalu muat ulang halaman.</p>
      <div className="row"><button className="btn primary" onClick={() => load()}>Muat ulang</button><button className="btn" onClick={() => auth.signOut()}>Keluar</button></div>
    </div>
  );
  else {
    const staff = me!.role !== 'student', admin = me!.role === 'admin';
    body = (
      <Shell>
        <Routes>
          <Route path="/beranda" element={<Home />} />
          <Route path="/jadwal" element={<Schedule />} />
          <Route path="/sesi/:id" element={<SessionDetail />} />
          <Route path="/materi" element={<Materials />} />
          {!staff && <Route path="/progres" element={<Progress />} />}
          {staff && <Route path="/peserta" element={<People role="student" />} />}
          {staff && <Route path="/peserta/:id" element={<PersonDetail />} />}
          {admin && <Route path="/mentor" element={<People role="mentor" />} />}
          {admin && <Route path="/matkul" element={<Courses />} />}
          <Route path="/pengaturan" element={<Settings />} />
          <Route path="*" element={<Navigate to="/beranda" replace />} />
        </Routes>
      </Shell>
    );
  }
  return <>{body}<ConfirmHost /><Toasts /></>;
}
