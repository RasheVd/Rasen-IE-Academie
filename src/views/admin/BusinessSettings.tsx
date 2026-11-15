import { useEffect, useState } from 'react';
import { Shell } from '../../components/Shell';
import { Field } from '../../components/ui';
import { useAction } from '../../components/bits';
import { saveSettings, useData } from '../../store';
import { useTitle } from '../../hooks';
import type { Settings } from '../../domain/types';
import { CONTENT_DEFAULTS, DEFAULT_PRESET, PRESETS, applyTheme, contrast, resolveTheme } from '../../domain/theme';

type NumKey = 'price_private' | 'price_group' | 'mentor_share_private' | 'mentor_share_group' | 'booking_cutoff_hours' | 'reschedule_cutoff_hours' | 'hold_hours' | 'booking_horizon_days' | 'threshold_need_help' | 'threshold_mastered';

export default function BusinessSettings() {
  useTitle('Aturan bisnis');
  const data = useData();
  const { busy, run } = useAction();
  const [f, setF] = useState<Settings>(data.settings);
  // Pratinjau warna langsung; kembali ke warna tersimpan saat halaman ditinggal.
  useEffect(() => { applyTheme(f.theme); }, [f.theme]);
  useEffect(() => () => applyTheme(data.settings.theme), [data.settings.theme]);
  const num = (k: NumKey, label: string, hint?: string) => (
    <Field label={label} hint={hint}>{(id) => <input id={id} className="input num" inputMode="numeric" value={String(f[k])} onChange={(e) => setF({ ...f, [k]: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })} />}</Field>
  );
  const txt = (k: 'admin_whatsapp' | 'admin_whatsapp_label' | 'bank_name' | 'bank_account' | 'bank_holder', label: string, hint?: string) => (
    <Field label={label} hint={hint}>{(id) => <input id={id} className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}</Field>
  );
  const txtC = (k: 'hero_title' | 'hero_accent' | 'cta_label', label: string) => (
    <Field label={label}>{(id) => <input id={id} className="input" value={f.content?.[k] ?? ''} placeholder={CONTENT_DEFAULTS[k]} onChange={(e) => setF({ ...f, content: { ...f.content, [k]: e.target.value } })} />}</Field>
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
      <section className="card stack">
        <div className="h-card">Tampilan situs</div>
        <p className="small muted">Warna dipakai di halaman depan dan semua dasbor. Teks kosong memakai teks bawaan.</p>
        <div className="row wrap between">
          <div><div className="strong small">Gaya dasbor</div><div className="small muted">Komik: sidebar tinta, judul tegas, bayangan offset. Polos: tampilan tenang tanpa ornamen.</div></div>
          <div className="seg" role="group" aria-label="Gaya dasbor">
            {(['komik', 'polos'] as const).map((st) => <button key={st} type="button" aria-pressed={(f.theme?.style ?? 'komik') === st} onClick={() => setF({ ...f, theme: { ...f.theme, style: st } })}>{st === 'komik' ? 'Komik' : 'Polos'}</button>)}
          </div>
        </div>
        <div className="row wrap" role="radiogroup" aria-label="Preset warna">
          {PRESETS.map((p) => {
            const on = (f.theme?.preset ?? DEFAULT_PRESET) === p.id && !f.theme?.primary && !f.theme?.accent;
            return (
              <button key={p.id} type="button" role="radio" aria-checked={on} className={`choice ${on ? '' : ''}`} style={{ minWidth: 170 }} aria-pressed={on}
                onClick={() => setF({ ...f, theme: { preset: p.id, style: f.theme?.style } })}>
                <span className="row"><i style={{ width: 18, height: 18, borderRadius: 5, background: p.primary, display: 'inline-block' }} /><i style={{ width: 18, height: 18, borderRadius: 5, background: p.accent, display: 'inline-block' }} /></span>
                <span className="t">{p.name}</span>
              </button>
            );
          })}
        </div>
        <div className="form-grid">
          <Field label="Warna utama (tombol, menu aktif)">{(id) => (
            <div className="row"><input id={id} type="color" value={resolveTheme(f.theme).primary} onChange={(e) => setF({ ...f, theme: { ...f.theme, primary: e.target.value } })} style={{ width: 48, height: 40, border: 0, background: 'none' }} /><span className="code">{resolveTheme(f.theme).primary}</span></div>
          )}</Field>
          <Field label="Warna aksen (sorotan, grafik)">{(id) => (
            <div className="row"><input id={id} type="color" value={resolveTheme(f.theme).accent} onChange={(e) => setF({ ...f, theme: { ...f.theme, accent: e.target.value } })} style={{ width: 48, height: 40, border: 0, background: 'none' }} /><span className="code">{resolveTheme(f.theme).accent}</span></div>
          )}</Field>
        </div>
        {(contrast(resolveTheme(f.theme).primary, '#ffffff') < 4.5 || contrast(resolveTheme(f.theme).accent, '#ffffff') < 3) && (
          <p className="small" role="alert" style={{ color: 'var(--danger)' }}>Warna ini terlalu terang: teks putih di atasnya sulit dibaca. Pilih warna yang lebih gelap.</p>
        )}
        <div className="divider" />
        <div className="h-card">Teks halaman depan</div>
        <div className="form-grid">
          {txtC('hero_title', 'Judul besar')}
          {txtC('hero_accent', 'Lanjutan judul (warna aksen)')}
          <Field label="Paragraf pembuka" className="full">{(id) => <textarea id={id} className="textarea" value={f.content?.hero_lead ?? ''} placeholder={CONTENT_DEFAULTS.hero_lead} onChange={(e) => setF({ ...f, content: { ...f.content, hero_lead: e.target.value } })} />}</Field>
          {txtC('cta_label', 'Tulisan tombol masuk')}
          <Field label="Tentang Academie" className="full">{(id) => <textarea id={id} className="textarea" value={f.content?.about ?? ''} placeholder={CONTENT_DEFAULTS.about} onChange={(e) => setF({ ...f, content: { ...f.content, about: e.target.value } })} />}</Field>
          <label className="check full"><input type="checkbox" checked={f.content?.intro_3d !== false} onChange={(e) => setF({ ...f, content: { ...f.content, intro_3d: e.target.checked } })} /><span>Tampilkan intro 3D di halaman depan<br /><span className="small muted">Matikan bila pengunjung banyak memakai HP lama atau koneksi lambat. Pengunjung dengan pengaturan kurangi gerakan selalu melihat versi diam.</span></span></label>
        </div>
      </section>
      {bad && <p className="small" role="alert" style={{ color: 'var(--danger)' }}>Periksa angka: ambang konsultasi harus di bawah ambang dikuasai (maks 100), dan hak mentor tidak boleh melebihi harga.</p>}
      <button className="btn primary lg" style={{ justifySelf: 'start' }} disabled={bad || !!busy} onClick={() => run('s', () => saveSettings({ ...f, admin_whatsapp: f.admin_whatsapp.replace(/[^0-9+]/g, '') }), 'Aturan tersimpan.')}>Simpan aturan</button>
    </Shell>
  );
}
