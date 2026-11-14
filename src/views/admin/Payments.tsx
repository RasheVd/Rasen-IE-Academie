import { Link } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { Empty } from '../../components/ui';
import { PaymentRow } from '../SessionDetail';
import { useData } from '../../store';
import { useTitle } from '../../hooks';
import { rupiah, shortDate, timeOf, toLocal } from '../../domain/time';

export default function Payments() {
  useTitle('Pembayaran');
  const data = useData();
  const s = data.settings;
  const pending = data.seats.filter((x) => x.payment_status === 'pending').map((seat) => ({ seat, session: data.sessions.find((y) => y.id === seat.session_id)! })).filter((x) => x.session && x.session.status === 'scheduled');
  const withProof = pending.filter((x) => x.seat.proof_path).sort((a, b) => a.session.starts_at.localeCompare(b.session.starts_at));
  const noProof = pending.filter((x) => !x.seat.proof_path);
  const recent = data.seats.filter((x) => x.payment_status === 'paid' && x.confirmed_at).sort((a, b) => (b.confirmed_at ?? '').localeCompare(a.confirmed_at ?? '')).slice(0, 15);
  return (
    <Shell title="Pembayaran">
      <div className="page-head"><div><h1 className="h-page">Pembayaran</h1><p className="lead">Cek bukti transfer, lalu konfirmasi. Sesi baru masuk Google Calendar peserta dan mentor setelah lunas.</p></div></div>
      {!s.bank_account && (
        <div className="banner warn"><div className="grow"><div>Nomor rekening belum diisi</div><p>Peserta belum melihat rekening tujuan saat booking. Isi di <Link to="/pengaturan/bisnis">Aturan bisnis</Link>.</p></div></div>
      )}
      <section className="card">
        <div className="card-head"><div className="h-card">Menunggu konfirmasi ({withProof.length})</div></div>
        {withProof.length ? <div className="list">{withProof.map((x) => <PaymentRow key={`${x.seat.session_id}${x.seat.student_id}`} s={x.session} seat={x.seat} data={data} compact />)}</div> : <Empty title="Tidak ada bukti yang menunggu" />}
      </section>
      <section className="card">
        <div className="card-head"><div className="h-card">Slot ditahan, belum upload bukti ({noProof.length})</div><span className="sub">Dilepas otomatis setelah {s.hold_hours} jam. Konfirmasi langsung bila peserta membayar tunai atau lewat jalur lain.</span></div>
        {noProof.length ? <div className="list">{noProof.map((x) => <PaymentRow key={`${x.seat.session_id}${x.seat.student_id}`} s={x.session} seat={x.seat} data={data} compact />)}</div> : <p className="small muted">Tidak ada.</p>}
      </section>
      <section className="card">
        <div className="card-head"><div className="h-card">Baru dikonfirmasi</div></div>
        {recent.length ? (
          <div className="list">
            {recent.map((x) => {
              const sess = data.sessions.find((y) => y.id === x.session_id);
              const p = data.profiles.find((q) => q.id === x.student_id);
              if (!sess) return null;
              return (
                <Link key={`${x.session_id}${x.student_id}`} to={`/sesi/${sess.id}`} className="list-item link small">
                  <span className="code">{sess.code}</span><span className="grow">{p?.full_name} · {shortDate(toLocal(sess.starts_at).date)} {timeOf(sess.starts_at)}</span>
                  <span className="pill ok">{x.paid_via === 'credit' ? 'Kredit' : rupiah(sess.mode === 'private' ? s.price_private : s.price_group)}</span>
                </Link>
              );
            })}
          </div>
        ) : <p className="small muted">Belum ada.</p>}
      </section>
    </Shell>
  );
}
