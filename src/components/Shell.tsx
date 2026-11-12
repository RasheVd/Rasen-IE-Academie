import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { reportsDue } from '../domain/progress';
import { ROLE_LABEL } from '../domain/types';
import { useNow } from '../hooks';
import { auth, useData, useMe } from '../store';
import { nameOf } from './bits';

export function Shell({ children }: { children: ReactNode }) {
  const me = useMe();
  const data = useData();
  const now = useNow();
  const loc = useLocation();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [loc.pathname]);
  const due = useMemo(() => (me.role === 'student' ? 0 : reportsDue(data, now, me.role === 'mentor' ? me.id : undefined).length), [data, now, me]);

  const items: { to: string; label: string; n?: number }[] = [
    { to: '/beranda', label: 'Beranda' },
    { to: '/jadwal', label: 'Jadwal', n: due || undefined },
    ...(me.role === 'student' ? [{ to: '/progres', label: 'Progres' }] : [{ to: '/peserta', label: 'Peserta' }]),
    ...(me.role === 'admin' ? [{ to: '/mentor', label: 'Mentor' }, { to: '/matkul', label: 'Mata kuliah' }] : []),
    { to: '/materi', label: 'Materi' },
    { to: '/pengaturan', label: 'Pengaturan' },
  ];
  const nav = (
    <nav className="nav" aria-label="Menu utama">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} className={({ isActive }) => (isActive || (i.to === '/jadwal' && loc.pathname.startsWith('/sesi')) ? 'active' : '')}>
          <span>{i.label}</span>{i.n ? <span className="n" title="Laporan belum diisi">{i.n}</span> : null}
        </NavLink>
      ))}
    </nav>
  );
  const foot = (
    <div className="rail-foot">
      <span className="who">{nameOf(me)}</span>
      <span>{me.email}</span>
      <button onClick={() => auth.signOut()}>Keluar</button>
    </div>
  );
  const brand = <Link to="/beranda" className="brand" aria-label="IE.Academie, ke beranda">IE<span>.</span>Academie</Link>;

  return (
    <div className="shell">
      <a href="#isi" className="skip-link">Langsung ke isi</a>
      <aside className="rail">
        {brand}
        <div className="rail-role"><span className="tag yellow">{ROLE_LABEL[me.role]}</span></div>
        {nav}
        {foot}
      </aside>
      <div>
        <div className="topbar">{brand}<button className="btn sm" onClick={() => setMenu(true)} aria-expanded={menu}>Menu</button></div>
        {menu && (
          <div className="menu-panel" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="row between" style={{ marginBottom: 20 }}>{brand}<button className="btn sm" onClick={() => setMenu(false)}>Tutup</button></div>
            {nav}
            {foot}
          </div>
        )}
        <main id="isi" className="main enter" key={loc.pathname} tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
