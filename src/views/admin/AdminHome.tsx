import { Link } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { Icon, type IconName } from '../../components/Icon';
import { GoogleBanner } from '../../components/google';
import { SessionItem, Stat } from '../../components/bits';
import { Empty } from '../../components/ui';
import { useData, useMe, useStore } from '../../store';
import { useNow, useTitle } from '../../hooks';
import { longDate, monthKey, rupiah, toLocal } from '../../domain/time';

export default function AdminHome() {
  useTitle('Beranda');
  const me = useMe();
  const data = useData();
  const now = useNow();
  const gcal = useStore((r) => r.gcal);
  const s = data.settings;
  const today = toLocal(now).date;
  const scheduled = data.sessions.filter((x) => x.status === 'scheduled');
  const proofs = data.seats.filter((x) => x.payment_status === 'pending' && x.proof_path);
  const holds = data.seats.filter((x) => x.payment_status === 'pending' && !x.proof_path);
  const reports = scheduled.filter((x) => Date.parse(x.ends_at) < now);
  const lateReports = reports.filter((x) => Date.parse(x.ends_at) + 864e5 < now);
  const notReady = scheduled.filter((x) => !x.mentor_ready_at && Date.parse(x.starts_at) > now && Date.parse(x.starts_at) - now < 864e5 && data.seats.some((y) => y.session_id === x.id && y.payment_status === 'paid'));
  const materials = data.materials.filter((m) => m.status === 'pending');
  const comps = data.mentorCourses.filter((m) => m.status === 'pending');
  const gErrors = scheduled.filter((x) => x.gcal_error);
  const invited = data.profiles.filter((p) => !p.user_id && p.active);
  const noCourse = data.profiles.filter((p) => p.role === 'student' && p.active && !data.enrollments.some((e) => e.student_id === p.id));
  type Q = { n: number; icon: IconName; title: string; sub: string; to: string; tone?: 'bad' };
  const items: Q[] = [
    { n: proofs.length, icon: 'card', title: 'Bukti bayar menunggu konfirmasi', sub: 'Slot baru masuk Google Calendar setelah dikonfirmasi.', to: '/pembayaran' },
    { n: lateReports.length, icon: 'note', title: 'Laporan sesi terlambat (lebih dari 24 jam)', sub: 'Hubungi mentornya.', to: '/sesi', tone: 'bad' },
    { n: reports.length - lateReports.length, icon: 'note', title: 'Laporan sesi belum diisi', sub: 'Masih dalam batas 24 jam.', to: '/sesi' },
    { n: notReady.length, icon: 'clock', title: 'Mentor belum konfirmasi siap (sesi < 24 jam)', sub: notReady.map((x) => x.code).join(', '), to: '/sesi', tone: 'bad' },
    { n: comps.length, icon: 'layers', title: 'Kompetensi mentor menunggu persetujuan', sub: 'Mentor belum tampil ke peserta sampai disetujui.', to: '/mentor' },
    { n: materials.length, icon: 'book', title: 'Bahan mentor menunggu tinjauan', sub: 'Belum terlihat peserta.', to: '/materi' },
    { n: noCourse.length, icon: 'users', title: 'Peserta tanpa mata kuliah', sub: 'Mereka belum bisa booking.', to: '/peserta' },
    { n: gErrors.length, icon: 'calendar', title: 'Sesi gagal ditulis ke Google Calendar', sub: gErrors.map((x) => x.code).slice(0, 4).join(', '), to: gErrors[0] ? `/sesi/${gErrors[0].id}` : '/sesi', tone: 'bad' },
    { n: holds.length, icon: 'clock', title: 'Slot ditahan, belum upload bukti', sub: `Dilepas otomatis setelah ${s.hold_hours} jam.`, to: '/pembayaran' },
    { n: invited.length, icon: 'mail', title: 'Undangan belum diterima', sub: 'Kirim ulang atau bagikan tautan lewat WhatsApp.', to: '/peserta' },
  ];
  const queue = items.filter((q) => q.n > 0);
  const month = monthKey(new Date(now));
  const paidSeats = data.seats.filter((x) => x.payment_status === 'paid' && x.paid_via !== 'credit');
  const revenue = paidSeats.reduce((a, x) => {
    const sess = data.sessions.find((y) => y.id === x.session_id);
    if (!sess || monthKey(sess.starts_at) !== month) return a;
    return a + (sess.mode === 'private' ? s.price_private : s.price_group);
  }, 0);
  const todays = data.sessions.filter((x) => x.status !== 'cancelled' && toLocal(x.starts_at).date === today);
  return (
    <Shell title="Beranda">
      <div className="page-head"><div><h1 className="h-page">Halo, {me.full_name.split(' ')[0]}</h1><p className="lead">{longDate(today)}</p></div>
        <div className="row wrap"><Link className="btn" to="/kalender"><Icon name="grid" size={16} />Kalender induk</Link><Link className="btn primary" to="/peserta?undang=1"><Icon name="plus" size={16} />Undang orang</Link></div>
      </div>
      <GoogleBanner />
      {gcal && !gcal.configured && (
        <div className="banner warn"><Icon name="alert" size={18} className="ic" /><div className="grow"><div>Google Calendar belum diatur</div><p>Website berjalan normal, tetapi belum ada yang masuk Google Calendar. Ikuti langkah "Google Calendar" di README untuk membuat OAuth client, lalu isi GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET di Supabase.</p></div></div>
      )}
      <div className="grid g4">
        <Stat label="Peserta aktif" value={data.profiles.filter((p) => p.role === 'student' && p.active).length} />
        <Stat label="Mentor aktif" value={data.profiles.filter((p) => p.role === 'mentor' && p.active).length} />
        <Stat label="Sesi terjadwal" value={scheduled.length} />
        <Stat label="Pemasukan bulan ini" value={rupiah(revenue)} sub="dari pembayaran transfer yang dikonfirmasi" />
      </div>
      <div className="grid g-main">
        <div className="card">
          <div className="card-head"><div className="h-card">Perlu tindakan</div></div>
          {queue.length === 0 ? <Empty title="Semua beres">Tidak ada yang menunggu tindakanmu.</Empty> : (
            <div className="list">
              {queue.map((q) => (
                <Link key={q.title} to={q.to} className="list-item link">
                  <span className={`avatar`} style={q.tone === 'bad' ? { background: 'var(--need-bg)', color: 'var(--need-ink)' } : undefined}><Icon name={q.icon} size={16} /></span>
                  <div className="grow"><div className="t">{q.title}</div>{q.sub && <div className="meta">{q.sub}</div>}</div>
                  <span className="big-num" style={{ fontSize: 22 }}>{q.n}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-head"><div className="h-card">Sesi hari ini</div><span className="sub">{todays.length} sesi</span></div>
          {todays.length ? <div className="list">{todays.map((x) => <SessionItem key={x.id} s={x} data={data} me={me} showStudents />)}</div> : <p className="muted small">Tidak ada sesi hari ini.</p>}
        </div>
      </div>
    </Shell>
  );
}
