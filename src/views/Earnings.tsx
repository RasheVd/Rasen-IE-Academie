import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { Field, Modal, Empty, confirmDialog } from '../components/ui';
import { Stat, useAction } from '../components/bits';
import { Icon } from '../components/Icon';
import { removePayout, savePayout, useData, useMe } from '../store';
import { useTitle } from '../hooks';
import { earnings, type MonthEarning } from '../domain/money';
import { monthLabel, rupiah, shortDate, toLocal } from '../domain/time';

export default function Earnings() {
  useTitle('Hak mentor');
  const me = useMe();
  const data = useData();
  const s = data.settings;
  const admin = me.role === 'admin';
  const [mentor, setMentor] = useState('');
  const [pay, setPay] = useState<MonthEarning | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const rows = earnings(data, admin ? mentor || undefined : me.id);
  const thisMonth = toLocal(Date.now()).date.slice(0, 7);
  const cur = rows.filter((r) => r.month === thisMonth);
  const owed = rows.reduce((a, r) => a + Math.max(0, r.amount - r.paid), 0);
  const name = (id: string) => data.profiles.find((p) => p.id === id)?.full_name ?? 'Mentor';
  return (
    <Shell title="Hak mentor">
      <div className="page-head">
        <div><h1 className="h-page">Hak mentor</h1><p className="lead">{rupiah(s.mentor_share_private)} per sesi private, {rupiah(s.mentor_share_group)} per sesi kelas bersama. Dihitung dari sesi berstatus selesai, termasuk peserta yang tidak hadir.</p></div>
        {admin && (
          <select className="select sm" style={{ width: 220 }} value={mentor} onChange={(e) => setMentor(e.target.value)} aria-label="Filter mentor">
            <option value="">Semua mentor</option>{data.profiles.filter((p) => p.role === 'mentor').map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        )}
      </div>
      <div className="grid g3">
        <Stat label={`Bulan ini (${monthLabel(thisMonth + '-01')})`} value={rupiah(cur.reduce((a, r) => a + r.amount, 0))} sub={`${cur.reduce((a, r) => a + r.sessions.length, 0)} sesi selesai`} />
        <Stat label="Belum ditransfer" value={rupiah(owed)} />
        <Stat label="Sudah ditransfer" value={rupiah(rows.reduce((a, r) => a + r.paid, 0))} />
      </div>
      <div className="card flush">
        {rows.length === 0 ? <Empty title="Belum ada sesi selesai">Hak muncul setelah laporan sesi diisi dan sesi ditandai selesai.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Bulan</th>{admin && <th>Mentor</th>}<th className="r">Private</th><th className="r">Bersama</th><th className="r">Hak</th><th className="r">Ditransfer</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const key = `${r.mentorId}|${r.month}`;
                  const payout = data.payouts.find((p) => p.mentor_id === r.mentorId && p.month.slice(0, 7) === r.month);
                  return (
                    <Fragment key={key}>
                      <tr>
                        <td className="nowrap"><button className="link-btn" onClick={() => setOpen(open === key ? null : key)} aria-expanded={open === key}>{monthLabel(r.month + '-01')}</button></td>
                        {admin && <td>{name(r.mentorId)}</td>}
                        <td className="r num">{r.privateCount}</td>
                        <td className="r num">{r.groupCount}</td>
                        <td className="r num strong">{rupiah(r.amount)}</td>
                        <td className="r num">{rupiah(r.paid)}</td>
                        <td>{r.paid >= r.amount ? <span className="pill ok">Lunas</span> : r.paid > 0 ? <span className="pill warn">Sebagian</span> : <span className="pill">Belum</span>}</td>
                        <td className="r nowrap">
                          {admin && !payout && <button className="btn sm" onClick={() => setPay(r)}>Catat transfer</button>}
                          {admin && payout && <RemovePayout id={payout.id} />}
                        </td>
                      </tr>
                      {open === key && (
                        <tr><td colSpan={admin ? 8 : 7} style={{ background: '#fafbfb' }}>
                          <div className="list">
                            {r.sessions.map((x) => (
                              <Link key={x.id} to={`/sesi/${x.id}`} className="list-item link small">
                                <span className="code">{x.code}</span>
                                <span className="grow">{data.courses.find((c) => c.id === x.course_id)?.title} · {shortDate(toLocal(x.starts_at).date)}</span>
                                <span className="num">{rupiah(x.mode === 'private' ? s.mentor_share_private : s.mentor_share_group)}</span>
                              </Link>
                            ))}
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {pay && <PayoutForm row={pay} name={name(pay.mentorId)} onClose={() => setPay(null)} />}
    </Shell>
  );
}

function RemovePayout({ id }: { id: string }) {
  const { run } = useAction();
  return <button className="btn ghost icon sm" aria-label="Hapus catatan transfer" onClick={async () => {
    if (await confirmDialog({ title: 'Hapus catatan transfer?', body: 'Hanya catatan di website yang dihapus.', confirm: 'Hapus', danger: true })) run('d', () => removePayout(id), 'Catatan dihapus.');
  }}><Icon name="trash" /></button>;
}

function PayoutForm({ row, name, onClose }: { row: MonthEarning; name: string; onClose: () => void }) {
  const { busy, run } = useAction();
  const [amount, setAmount] = useState(String(row.amount - row.paid));
  const [note, setNote] = useState('');
  return (
    <Modal title={`Transfer ${name}, ${monthLabel(row.month + '-01')}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Batal</button>
      <button className="btn primary" disabled={!Number(amount) || !!busy} onClick={() => run('p', async () => { await savePayout({ mentor_id: row.mentorId, month: row.month + '-01', amount: Math.round(Number(amount)), note }); onClose(); }, 'Transfer dicatat.')}>Simpan</button>
    </>}>
      <Field label="Jumlah (Rp)">{(id) => <input id={id} className="input num" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} />}</Field>
      <Field label="Catatan">{(id) => <input id={id} className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Transfer BCA 5 Des" />}</Field>
    </Modal>
  );
}
