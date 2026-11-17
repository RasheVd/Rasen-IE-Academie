import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ConfirmHost } from './components/ui';
import { Toasts } from './components/Shell';
import { Loading } from './components/bits';
import { auth, load, useStore } from './store';
import { applyTheme } from './domain/theme';
import { Landing } from './views/public/Landing';
import { Privacy, Terms } from './views/public/Legal';
import { SignIn, SetPassword } from './views/public/Auth';
// Halaman dimuat per kebutuhan supaya peserta di koneksi lambat tidak mengunduh halaman admin.
const StudentHome = lazy(() => import('./views/student/StudentHome'));
const Booking = lazy(() => import('./views/student/Booking'));
const Topics = lazy(() => import('./views/student/Topics'));
const Sessions = lazy(() => import('./views/Sessions'));
const SessionDetail = lazy(() => import('./views/SessionDetail'));
const Materials = lazy(() => import('./views/Materials'));
const Account = lazy(() => import('./views/Account'));
const Earnings = lazy(() => import('./views/Earnings'));
const MyCalendar = lazy(() => import('./views/MyCalendar'));
const Workspace = lazy(() => import('./views/Workspace'));
const MentorHome = lazy(() => import('./views/mentor/MentorHome'));
const Availability = lazy(() => import('./views/mentor/Availability'));
const AdminHome = lazy(() => import('./views/admin/AdminHome'));
const MasterCalendar = lazy(() => import('./views/admin/MasterCalendar'));
const Payments = lazy(() => import('./views/admin/Payments'));
const People = lazy(() => import('./views/admin/People'));
const PersonDetail = lazy(() => import('./views/admin/PersonDetail'));
const Catalog = lazy(() => import('./views/admin/Catalog'));
const BusinessSettings = lazy(() => import('./views/admin/BusinessSettings'));
const DataCenter = lazy(() => import('./views/admin/DataCenter'));
const Classroom = lazy(() => import('./views/student/Classroom'));

export function App() {
  const status = useStore((r) => r.status);
  const error = useStore((r) => r.error);
  const email = useStore((r) => r.email);
  const me = useStore((r) => r.me);
  const recovery = useStore((r) => r.recovery);
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  // Warna situs dari pengaturan admin (sebelum login: dari info publik).
  const theme = useStore((r) => (r.status === 'ready' ? r.data.settings.theme : r.info?.theme));
  useEffect(() => applyTheme(theme), [theme]);
  const density = useStore((r) => r.me?.prefs?.density);
  useEffect(() => { document.body.classList.toggle('dense', density === 'padat'); }, [density]);

  const path = loc.pathname.replace(/\/$/, '') || '/';
  if (path === '/') return <><Landing /><Toasts /></>;
  if (path === '/privasi') return <Privacy />;
  if (path === '/syarat') return <Terms />;
  if (path === '/undangan' || (recovery && status !== 'signed-out')) return <><SetPassword /><Toasts /></>;

  if (status === 'booting' || status === 'loading') return <Loading />;
  if (status === 'signed-out') {
    if (path !== '/masuk') return <Navigate to={`/masuk?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
    return <><SignIn /><Toasts /></>;
  }
  if (status === 'error') return (
    <div className="auth"><div className="auth-card" role="alert">
      <h1 className="h-section">Gagal memuat</h1>
      <p className="muted">{error}</p>
      <button className="btn primary" onClick={() => load()}>Coba lagi</button>
    </div></div>
  );
  if (status === 'no-profile') return (
    <div className="auth"><div className="auth-card">
      <h1 className="h-section">Akun belum terdaftar</h1>
      <p>Kamu masuk sebagai <b>{email}</b>, tetapi email ini belum diundang admin IE.Academie. Minta admin mengundang email ini, lalu buka tautan undangan dari email.</p>
      <div className="row wrap"><button className="btn primary" onClick={() => load()}>Muat ulang</button><button className="btn" onClick={() => auth.signOut()}>Keluar</button></div>
    </div></div>
  );
  if (path === '/masuk') {
    const next = new URLSearchParams(loc.search).get('next');
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : '/beranda'} replace />;
  }

  const role = me!.role;
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/beranda" element={role === 'admin' ? <AdminHome /> : role === 'mentor' ? <MentorHome /> : <StudentHome />} />
        <Route path="/ruang-kerja" element={<Workspace />} />
        <Route path="/sesi" element={<Sessions />} />
        {role !== 'admin' && <Route path="/jadwal" element={<MyCalendar />} />}
        <Route path="/sesi/:id" element={<SessionDetail />} />
        <Route path="/materi" element={<Materials />} />
        <Route path="/pengaturan" element={<Account />} />
        {role === 'student' && <Route path="/booking" element={<Booking />} />}
        {role === 'student' && <Route path="/topik" element={<Topics />} />}
        {role !== 'student' && <Route path="/hak" element={<Earnings />} />}
        {role !== 'student' && <Route path="/peserta" element={<People role="student" />} />}
        {role !== 'student' && <Route path="/orang/:id" element={<PersonDetail />} />}
        {role !== 'student' && <Route path="/ketersediaan" element={<Availability />} />}
        {role === 'student' && <Route path="/kelas" element={<Classroom />} />}
        {role === 'student' && <Route path="/kelas/:id" element={<Classroom />} />}
        {role === 'admin' && <Route path="/data" element={<DataCenter />} />}
        {role === 'admin' && <Route path="/mentor" element={<People role="mentor" />} />}
        {role === 'admin' && <Route path="/kalender" element={<MasterCalendar />} />}
        {role === 'admin' && <Route path="/pembayaran" element={<Payments />} />}
        {role === 'admin' && <Route path="/katalog" element={<Catalog />} />}
        {role === 'admin' && <Route path="/pengaturan/bisnis" element={<BusinessSettings />} />}
        <Route path="*" element={<Navigate to="/beranda" replace />} />
      </Routes>
      <ConfirmHost />
    </Suspense>
  );
}
