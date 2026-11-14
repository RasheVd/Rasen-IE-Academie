import { Link } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { GoogleBanner } from '../../components/google';
import { Banner, SessionItem, Stat, useAction } from '../../components/bits';
import { Empty } from '../../components/ui';
import { markReady, useData, useMe } from '../../store';
import { useNow, useTitle } from '../../hooks';
import { earnings } from '../../domain/money';
import { addDays, longDate, mondayOf, rupiah, timeOf, toLocal, until } from '../../domain/time';

export default function MentorHome() {
  useTitle('Beranda');
  const me = useMe();
  const data = useData();
  const now = useNow();
  const { busy, run } = useAction();
  const mine = data.sessions.filter((s) => s.mentor_id === me.id);
  const upcoming = mine.filter((s) => s.status === 'scheduled' && Date.parse(s.ends_at) > now);
  const reportDue = mine.filter((s) => s.status === 'scheduled' && Date.parse(s.ends_at) <= now);
  const notReady = upcoming.filter((s) => !s.mentor_ready_at && Date.parse(s.starts_at) - now < 48 * 3_600_000 && data.seats.some((x) => x.session_id === s.id && x.payment_status === 'paid'));
  const approved = data.mentorCourses.filter((x) => x.mentor_id === me.id && x.status === 'approved');
  const rules = data.rules.filter((r) => r.mentor_id === me.id && r.active);
  const today = toLocal(now).date;
  const week = mondayOf(today);
  const thisWeek = mine.filter((s) => s.status !== 'cancelled' && toLocal(s.starts_at).date >= week && toLocal(s.starts_at).date < addDays(week, 7));
  const month = earnings(data, me.id).find((e) => e.month === today.slice(0, 7));
  return (
    <Shell title="Beranda">
      <div className="page-head"><div><h1 className="h-page">Halo, {me.full_name.split(' ')[0]}</h1><p className="lead">{longDate(today)}</p></div></div>
      <GoogleBanner />
      {approved.length === 0 && (
        <Banner tone="warn" icon="layers" title="Pilih mata kuliah yang kamu ajar" action={<Link className="btn primary sm" to="/ketersediaan">Atur sekarang</Link>}>
          Peserta hanya melihat mentor yang mata kuliahnya sudah disetujui admin.
        </Banner>
      )}
      {approved.length > 0 && rules.length === 0 && (
        <Banner tone="warn" icon="clock" title="Isi jam ketersediaanmu" action={<Link className="btn primary sm" to="/ketersediaan">Isi jam</Link>}>
          Tanpa pola jam mingguan, peserta tidak bisa booking sesi denganmu.
        </Banner>
      )}
      {reportDue.map((s) => {
        const late = Date.parse(s.ends_at) + 24 * 3_600_000 < now;
        return (
          <Banner key={s.id} tone={late ? 'bad' : 'warn'} icon="note" title={`Laporan ${s.code} ${late ? 'terlambat' : 'belum diisi'}`} action={<Link className="btn primary sm" to={`/sesi/${s.id}`}>Isi laporan</Link>}>
            Batas 24 jam setelah sesi ({timeOf(addDaysIso(s.ends_at, 1))} WIB, {longDate(toLocal(addDaysIso(s.ends_at, 1)).date)}).
          </Banner>
        );
      })}
      {notReady.map((s) => (
        <Banner key={s.id} tone="info" icon="clock" title={`${s.code} mulai ${until(s.starts_at, now)}`}
          action={<button className="btn primary sm" disabled={!!busy} onClick={() => run(s.id, () => markReady(s.id), 'Tercatat siap.')}>Saya sudah siap</button>}>
          Konfirmasi kesiapan paling lambat H-1 setelah mempelajari materi dan konteks peserta.
        </Banner>
      ))}
      <div className="grid g3">
        <Stat label="Sesi minggu ini" value={thisWeek.length} />
        <Stat label="Mata kuliah diajar" value={approved.length} sub={`${data.mentorCourses.filter((x) => x.mentor_id === me.id && x.status === 'pending').length} menunggu persetujuan`} />
        <Stat label="Hak bulan ini" value={rupiah(month?.amount ?? 0)} sub={<Link to="/hak">Rincian</Link>} />
      </div>
      <div className="card">
        <div className="card-head"><div className="h-card">Agenda</div><Link to="/sesi" className="small">Semua sesi</Link></div>
        {upcoming.length ? <div className="list">{upcoming.slice(0, 10).map((s) => <SessionItem key={s.id} s={s} data={data} me={me} showStudents />)}</div>
          : <Empty title="Belum ada sesi terjadwal">Peserta akan melihat slotmu begitu jam ketersediaan dan mata kuliahmu aktif.</Empty>}
      </div>
    </Shell>
  );
}
const addDaysIso = (iso: string, n: number) => new Date(Date.parse(iso) + n * 864e5).toISOString();
