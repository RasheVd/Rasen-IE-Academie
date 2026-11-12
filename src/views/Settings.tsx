import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { nameOf } from '../components/bits';
import { PersonDialog } from '../components/dialogs';
import { confirmDialog } from '../components/ui';
import { ROLE_LABEL } from '../domain/types';
import { useTitle } from '../hooks';
import { auth, connectGcal, disconnectGcal, refreshGcal, toast, useData, useMe, useStore } from '../store';

export default function Settings() {
  const me = useMe(), data = useData();
  const gcal = useStore((r) => r.gcal);
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [addAdmin, setAddAdmin] = useState(false);
  useTitle('Pengaturan');

  useEffect(() => {
    const g = params.get('gcal');
    if (!g) return;
    if (g === 'tersambung') toast('Google Calendar tersambung');
    else toast(g === 'ditolak' ? 'Izin Google ditolak. Kalender belum tersambung.' : 'Gagal menyambungkan Google Calendar. Coba lagi.', 'error');
    refreshGcal();
    params.delete('gcal'); setParams(params, { replace: true });
  }, [params, setParams]);

  const connect = async () => { setBusy(true); try { await connectGcal(); } catch (e) { toast((e as Error).message, 'error'); setBusy(false); } };
  const disconnect = async () => {
    if (!(await confirmDialog({ title: 'Putuskan Google Calendar?', danger: true, confirm: 'Putuskan', body: 'Sesi baru tidak lagi ditulis ke Google Calendar. Acara yang sudah ada di kalender tetap ada.' }))) return;
    try { await disconnectGcal(); toast('Google Calendar diputuskan'); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const admins = data.profiles.filter((p) => p.role === 'admin');

  return (
    <>
      <header className="page-head"><div><h1 className="page-title">Pengaturan</h1></div></header>

      <section className="section">
        <div className="section-head"><h2 className="h-section">Akun</h2></div>
        <div className="panel pad">
          <dl className="kv">
            <dt>Nama</dt><dd>{nameOf(me)}</dd>
            <dt>Email</dt><dd>{me.email}</dd>
            <dt>Peran</dt><dd>{ROLE_LABEL[me.role]}</dd>
          </dl>
          <p className="small muted" style={{ marginTop: 12 }}>Nama dan peran diatur admin. Hubungi admin bila ada yang keliru.</p>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => auth.signOut()}>Keluar</button>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2 className="h-section">Google Calendar</h2>{gcal?.connected && <span className="tag green">Tersambung</span>}</div>
        <div className="panel pad stack">
          {me.role !== 'admin' ? (
            <p>{gcal?.connected ? `Jadwal lesmu masuk ke Google Calendar sebagai undangan ke ${me.email}. Terima undangannya supaya pengingat aktif.` : 'Admin belum menyambungkan Google Calendar. Sementara itu, pakai tombol "Tambah ke Google Calendar" di halaman tiap sesi.'}</p>
          ) : gcal?.connected ? (
            <>
              <p>Tersambung ke <b>{gcal.email}</b>. Setiap sesi yang kamu simpan ditulis ke kalender akun ini, dengan mentor dan peserta sebagai tamu. Acara langsung muncul di Google Calendar mereka.</p>
              <div><button className="btn danger" onClick={disconnect}>Putuskan</button></div>
            </>
          ) : gcal?.configured ? (
            <>
              <p>Sambungkan satu akun Google sebagai penyelenggara. Setelah itu, sesi yang kamu tulis di website langsung muncul di Google Calendar mentor dan peserta.</p>
              <div><button className="btn primary" onClick={connect} disabled={busy}>Sambungkan Google Calendar</button></div>
            </>
          ) : (
            <>
              <p>Sinkron otomatis butuh kredensial Google yang hanya bisa kamu buat sendiri. Lakukan sekali:</p>
              <ol className="stack" style={{ gap: 8, paddingLeft: 20, margin: 0 }}>
                <li>Buka <b>console.cloud.google.com</b>, buat project, lalu aktifkan <b>Google Calendar API</b>.</li>
                <li>Di <b>OAuth consent screen</b> pilih External, isi nama aplikasi, lalu tekan <b>Publish app</b>.</li>
                <li>Di <b>Credentials</b> buat <b>OAuth client ID</b> jenis Web application. Isi Authorized redirect URI:<br /><code className="code" style={{ textTransform: 'none', userSelect: 'all', display: 'inline-block', marginTop: 6, overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{import.meta.env.VITE_SUPABASE_URL}/functions/v1/academie-gcal/callback</code></li>
                <li>Di Supabase buka <b>Edge Functions</b>, <b>Secrets</b>, lalu tambah <code className="code">GOOGLE_CLIENT_ID</code> dan <code className="code">GOOGLE_CLIENT_SECRET</code>.</li>
                <li>Muat ulang halaman ini, lalu tekan Sambungkan.</li>
              </ol>
              <p className="small muted">Sebelum itu selesai, tiap sesi punya tombol "Tambah ke Google Calendar" yang bekerja untuk semua orang.</p>
              <div><button className="btn" onClick={() => refreshGcal()}>Periksa lagi</button></div>
            </>
          )}
        </div>
      </section>

      {me.role === 'admin' && (
        <section className="section">
          <div className="section-head"><h2 className="h-section">Admin</h2><button className="btn sm" onClick={() => setAddAdmin(true)}>Tambah admin</button></div>
          <ul className="list">{admins.map((a) => <li key={a.id}><div className="rowlink" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}><span><span className="strong">{nameOf(a)}</span><span className="muted small" style={{ display: 'block' }}>{a.email}</span></span>{a.user_id ? <span className="tag green">Aktif</span> : <span className="tag yellow">Belum membuat akun</span>}</div></li>)}</ul>
        </section>
      )}
      {addAdmin && <PersonDialog role="admin" onClose={() => setAddAdmin(false)} />}
    </>
  );
}
