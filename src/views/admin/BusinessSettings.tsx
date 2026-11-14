import { useState } from 'react';
import { Shell } from '../../components/Shell';
import { Field } from '../../components/ui';
import { useAction } from '../../components/bits';
import { saveSettings, useData } from '../../store';
import { useTitle } from '../../hooks';
import type { Settings } from '../../domain/types';

type NumKey = 'price_private' | 'price_group' | 'mentor_share_private' | 'mentor_share_group' | 'booking_cutoff_hours' | 'reschedule_cutoff_hours' | 'hold_hours' | 'booking_horizon_days' | 'threshold_need_help' | 'threshold_mastered';

export default function BusinessSettings() {
  useTitle('Aturan bisnis');
  const data = useData();
  const { busy, run } = useAction();
  const [f, setF] = useState<Settings>(data.settings);
  const num = (k: NumKey, label: string, hint?: string) => (
    <Field label={label} hint={hint}>{(id) => <input id={id} className="input num" inputMode="numeric" value={String(f[k])} onChange={(e) => setF({ ...f, [k]: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })} />}</Field>
  );
  const txt = (k: 'admin_whatsapp' | 'admin_whatsapp_label' | 'bank_name' | 'bank_account' | 'bank_holder', label: string, hint?: string) => (
    <Field label={label} hint={hint}>{(id) => <input id={id} className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}</Field>
  );
  const bad = f.threshold_need_help >= f.threshold_mastered || f.threshold_mastered > 100 || f.mentor_share_private > f.price_private || f.mentor_share_group > f.price_group;
  return (
    <Shell title="Aturan bisnis" narrow>
      <div className="page-head"><div><h1 className="h-page">Aturan bisnis</h1><p className="lead">Berlaku untuk seluruh website. Booking yang sudah ada tidak berubah.</p></div></div>
      <section className="card stack">
        <div className="h-card">Kontak admin</div>
        <div className="form-grid">{txt('admin_whatsapp', 'WhatsApp admin', 'Tampil di halaman depan dan semua dasbor.')}{txt('admin_whatsapp_label', 'Nama yang ditampilkan')}</div>
      </section>
      <section className="card stack">
        <div className="h-card">Harga dan hak mentor</div>
        <div className="form-grid">
          {num('price_private', 'Harga private (Rp)')}{num('mentor_share_private', 'Hak mentor private (Rp)', f.price_private ? `${Math.round((f.mentor_share_private / f.price_private) * 100)}% dari harga` : undefined)}
          {num('price_group', 'Harga kelas bersama per orang (Rp)')}{num('mentor_share_group', 'Hak mentor kelas bersama (Rp)', f.price_group ? `${Math.round((f.mentor_share_group / f.price_group) * 100)}% dari harga` : undefined)}
        </div>
      </section>
      <section className="card stack">
        <div className="h-card">Rekening pembayaran</div>
        <div className="form-grid">
          {txt('bank_name', 'Bank / e-wallet')}{txt('bank_account', 'Nomor rekening')}{txt('bank_holder', 'Atas nama')}
          <Field label="Catatan pembayaran" className="full" hint="Misalnya: tulis kode sesi di berita transfer.">{(id) => <textarea id={id} className="textarea" value={f.payment_note} onChange={(e) => setF({ ...f, payment_note: e.target.value })} />}</Field>
        </div>
      </section>
      <section className="card stack">
        <div className="h-card">Jadwal</div>
        <div className="form-grid">
          {num('booking_cutoff_hours', 'Booking paling lambat (jam sebelum sesi)')}{num('reschedule_cutoff_hours', 'Pindah jadwal paling lambat (jam sebelum sesi)')}
          {num('hold_hours', 'Lama slot ditahan menunggu bukti (jam)')}{num('booking_horizon_days', 'Booking paling jauh (hari ke depan)')}
        </div>
      </section>
      <section className="card stack">
        <div className="h-card">Status nilai</div>
        <div className="form-grid">
          {num('threshold_need_help', 'Perlu konsultasi bila posttest di bawah')}{num('threshold_mastered', 'Dikuasai bila posttest minimal')}
        </div>
      </section>
      {bad && <p className="small" role="alert" style={{ color: 'var(--danger)' }}>Periksa angka: ambang konsultasi harus di bawah ambang dikuasai (maks 100), dan hak mentor tidak boleh melebihi harga.</p>}
      <button className="btn primary lg" style={{ justifySelf: 'start' }} disabled={bad || !!busy} onClick={() => run('s', () => saveSettings({ ...f, admin_whatsapp: f.admin_whatsapp.replace(/[^0-9+]/g, '') }), 'Aturan tersimpan.')}>Simpan aturan</button>
    </Shell>
  );
}
