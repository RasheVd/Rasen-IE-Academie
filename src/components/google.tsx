import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banner, useAction } from './bits';
import { Icon } from './Icon';
import { confirmDialog } from './ui';
import { connectGcal, disconnectGcal, refreshGcal, toast, useMe, useStore } from '../store';

const WHY = {
  student: 'Opsional. Sambungkan bila kamu ingin sesi tertulis langsung di kalendermu dengan 5 pengingat: 5 hari, 3 hari, 1 hari, 6 jam, dan 1 jam sebelumnya. Tanpa ini, undangan tetap masuk ke email-mu.',
  mentor: 'Jam ketersediaanmu tampil biru di kalender "IE.Academie", berubah merah dengan nama peserta saat dibooking, dengan 5 pengingat. Jam sibuk di kalender pribadimu otomatis disembunyikan dari peserta.',
  admin: 'Semua sesi muncul di kalender "IE.Academie" milik admin dengan pengingat H-1. Mentor yang belum menyambungkan Google memakai kalender admin sebagai cadangan.',
};

/** Banner ajakan menyambungkan Google Calendar. Tidak tampil bila sudah tersambung atau Google belum diatur admin. */
export function GoogleBanner({ returnPath = '/beranda' }: { returnPath?: string }) {
  const gcal = useStore((r) => r.gcal);
  const me = useMe();
  const { busy, run } = useAction();
  if (!gcal || gcal.connected || !gcal.configured || me.role === 'student') return null;
  return (
    <Banner tone="info" icon="calendar" title="Sambungkan Google Calendar" action={
      <button className="btn primary sm" disabled={!!busy} onClick={() => run('g', () => connectGcal(returnPath))}>{busy ? 'Membuka Google…' : 'Sambungkan'}</button>
    }>{WHY[me.role]}</Banner>
  );
}

/** Peserta tidak menyambungkan Google: undangan sesi datang lewat email. */
export function StudentCalendarInfo() {
  const me = useMe();
  return (
    <div className="card stack sm">
      <div className="row"><Icon name="calendar" size={20} /><div className="h-card">Google Calendar</div></div>
      <p className="small">Kamu tidak perlu menyambungkan akun Google. Setelah pembayaranmu dikonfirmasi, undangan sesi dikirim ke <b>{me.email}</b>.</p>
      <p className="small muted">Buka emailnya dan klik <b>Ya</b> pada undangan. Sesi masuk Google Calendar-mu lengkap dengan link kelas, pretest, dan posttest. Pengingatnya mengikuti pengaturan Google Calendar-mu sendiri.</p>
    </div>
  );
}

/** Kartu status Google di halaman Akun (admin dan mentor). */
export function GoogleCard() {
  const gcal = useStore((r) => r.gcal);
  const me = useMe();
  const { busy, run } = useAction();
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const g = params.get('google');
    if (!g) return;
    if (g === 'tersambung') toast('Google Calendar tersambung.');
    else if (g === 'ditolak') toast('Izin Google tidak diberikan. Coba lagi dan centang semua izin kalender.', 'error');
    else toast('Gagal menyambungkan Google. Coba lagi.', 'error');
    params.delete('google'); setParams(params, { replace: true });
    refreshGcal();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="card stack">
      <div className="row between wrap">
        <div className="row"><Icon name="calendar" size={20} /><div className="h-card">Google Calendar{me.role === 'student' ? ' (opsional)' : ''}</div></div>
        {gcal?.connected ? <span className="pill ok"><Icon name="check" size={12} />Tersambung</span> : <span className="pill">Belum tersambung</span>}
      </div>
      <p className="small muted">{WHY[me.role]}</p>
      {!gcal && <p className="small muted">Memeriksa…</p>}
      {gcal && !gcal.configured && (
        <Banner tone="warn" icon="alert" title="Google belum diatur">
          {me.role === 'admin' ? 'Isi GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET di Supabase (Edge Functions, Secrets) sesuai panduan README. Setelah itu tombol sambungkan aktif untuk semua orang.' : 'Admin sedang menyiapkan sambungan Google. Sementara itu, jadwal tetap tampil di website.'}
        </Banner>
      )}
      {gcal?.connected && <div className="small">Akun: <b>{gcal.email}</b>{gcal.last_error ? <div className="error" style={{ color: 'var(--danger)' }}>Galat terakhir: {gcal.last_error}</div> : null}</div>}
      {gcal?.configured && (
        <div className="row wrap">
          {gcal.connected ? (
            <>
              <button className="btn" disabled={!!busy} onClick={() => run('c', () => connectGcal('/pengaturan'))}>Sambungkan ulang</button>
              <button className="btn danger" disabled={!!busy} onClick={async () => {
                if (await confirmDialog({ title: 'Putus sambungan Google?', body: 'Sesi berikutnya tidak lagi ditulis ke kalendermu dan pengingat Google berhenti. Sesi tetap ada di website.', confirm: 'Putuskan', danger: true }))
                  run('d', disconnectGcal, 'Sambungan Google diputus.');
              }}>Putuskan</button>
            </>
          ) : <button className="btn primary" disabled={!!busy} onClick={() => run('c', () => connectGcal('/pengaturan'))}>{busy ? 'Membuka Google…' : 'Sambungkan Google Calendar'}</button>}
        </div>
      )}
      <p className="tiny faint">Saat menyambungkan, Google bisa menampilkan peringatan "aplikasi belum diverifikasi" selama proses verifikasi berjalan. Pilih Lanjutan, lalu lanjutkan ke academie.my.id.</p>
    </div>
  );
}
