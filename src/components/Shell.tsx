import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Icon, Logo, type IconName } from './Icon';
import { Avatar, WaButton } from './bits';
import { auth, markNoticesRead, useData, useMe, useStore } from '../store';
import { ROLE_LABEL, type Data, type Role } from '../domain/types';

interface NavItem { to: string; label: string; icon: IconName; count?: (d: Data, me: string) => number }

const NAV: Record<Role, { group?: string; items: NavItem[] }[]> = {
  student: [{
    items: [
      { to: '/beranda', label: 'Dasbor', icon: 'home' },
      { to: '/booking', label: 'Booking sesi', icon: 'plus' },
      { to: '/sesi', label: 'Sesi saya', icon: 'calendar', count: (d, me) => d.seats.filter((x) => x.student_id === me && x.payment_status === 'pending' && !x.proof_path).length },
      { to: '/topik', label: 'Topik & nilai', icon: 'target' },
      { to: '/materi', label: 'Materi', icon: 'book' },
    ],
  }],
  mentor: [{
    items: [
      { to: '/beranda', label: 'Beranda', icon: 'home' },
      { to: '/sesi', label: 'Sesi', icon: 'calendar', count: (d, me) => d.sessions.filter((s) => s.mentor_id === me && s.status === 'scheduled' && Date.parse(s.ends_at) < Date.now()).length },
      { to: '/ketersediaan', label: 'Ketersediaan', icon: 'clock' },
      { to: '/peserta', label: 'Peserta', icon: 'users' },
      { to: '/materi', label: 'Materi', icon: 'book' },
      { to: '/hak', label: 'Hak mentor', icon: 'wallet' },
    ],
  }],
  admin: [
    {
      items: [
        { to: '/beranda', label: 'Beranda', icon: 'home' },
        { to: '/kalender', label: 'Kalender induk', icon: 'grid' },
        { to: '/pembayaran', label: 'Pembayaran', icon: 'card', count: (d) => d.seats.filter((x) => x.payment_status === 'pending' && x.proof_path).length },
        { to: '/sesi', label: 'Semua sesi', icon: 'calendar' },
      ],
    },
    {
      group: 'Orang',
      items: [
        { to: '/peserta', label: 'Peserta', icon: 'users' },
        { to: '/mentor', label: 'Mentor', icon: 'user', count: (d) => d.mentorCourses.filter((x) => x.status === 'pending').length },
      ],
    },
    {
      group: 'Akademik',
      items: [
        { to: '/katalog', label: 'Katalog mata kuliah', icon: 'layers' },
        { to: '/materi', label: 'Materi', icon: 'book', count: (d) => d.materials.filter((m) => m.status === 'pending').length },
        { to: '/hak', label: 'Hak mentor', icon: 'wallet' },
        { to: '/pengaturan/bisnis', label: 'Aturan bisnis', icon: 'settings' },
      ],
    },
  ],
};

export function Shell({ title, children, narrow }: { title: string; children: ReactNode; narrow?: boolean }) {
  const me = useMe();
  const data = useData();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const settings = data.settings;
  return (
    <div className={`app ${open ? 'nav-open' : ''}`} onClick={(e) => { if (open && e.target === e.currentTarget) setOpen(false); }}>
      <aside className="side" aria-label="Navigasi utama">
        <Link to="/beranda" className="brand"><Logo /> <span>IE<span className="dot">.</span>Academie</span></Link>
        {NAV[me.role].map((g, i) => (
          <nav className="nav" key={i} aria-label={g.group ?? 'Menu'}>
            {g.group && <div className="nav-label">{g.group}</div>}
            {g.items.map((it) => {
              const n = it.count?.(data, me.id) ?? 0;
              return (
                <NavLink key={it.to} to={it.to} end={it.to === '/pengaturan'}>
                  <Icon name={it.icon} size={18} />{it.label}
                  {n > 0 && <span className="badge" aria-label={`${n} perlu tindakan`}>{n}</span>}
                </NavLink>
              );
            })}
          </nav>
        ))}
        <div className="side-foot">
          <WaButton phone={settings.admin_whatsapp} text="Halo admin IE.Academie, saya mau bertanya." label={`Admin ${settings.admin_whatsapp_label}`} sm block />
          <nav className="nav">
            <NavLink to="/pengaturan" end><Icon name="settings" size={18} />Akun & Google</NavLink>
          </nav>
          <div className="me-chip">
            <Avatar name={me.full_name} />
            <div className="who grow">
              <div className="strong small">{me.full_name}</div>
              <div className="tiny muted">{ROLE_LABEL[me.role]}</div>
            </div>
            <button className="btn ghost icon sm" onClick={() => auth.signOut()} aria-label="Keluar" title="Keluar"><Icon name="logout" /></button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn ghost icon menu-btn" onClick={() => setOpen(true)} aria-label="Buka menu"><Icon name="menu" size={20} /></button>
          <div className="title grow">{title}</div>
          <Bell />
        </header>
        <main className={`content ${narrow ? 'narrow' : ''}`} id="main">{children}</main>
      </div>
      <Toasts />
    </div>
  );
}

function Bell() {
  const notices = useData().notices;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = notices.filter((n) => !n.read_at).length;
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="bell" ref={ref}>
      <button className="btn ghost icon" aria-label={`Pemberitahuan${unread ? `, ${unread} belum dibaca` : ''}`} aria-expanded={open}
        onClick={() => { setOpen(!open); if (!open && unread) setTimeout(markNoticesRead, 1500); }}>
        <Icon name="bell" size={20} />
      </button>
      {unread > 0 && <span className="badge" aria-hidden="true">{unread}</span>}
      {open && (
        <div className="popover" role="dialog" aria-label="Pemberitahuan">
          {notices.length === 0 && <div className="empty"><div className="t">Belum ada pemberitahuan</div></div>}
          {notices.slice(0, 20).map((n) => (
            <Link key={n.id} to={n.link || '/beranda'} className={`item ${n.read_at ? '' : 'unread'}`} onClick={() => setOpen(false)}>
              <div className="t">{n.title}</div>
              <div className="b">{n.body}</div>
              <div className="tiny faint">{new Date(n.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' })}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((r) => r.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.tone ?? ''}`} role={t.tone ? 'alert' : 'status'}>{t.message}</div>)}
    </div>
  );
}
