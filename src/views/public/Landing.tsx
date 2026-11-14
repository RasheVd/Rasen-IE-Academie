import { Link } from 'react-router-dom';
import { Logo, Icon } from '../../components/Icon';
import { WaButton, prettyPhone } from '../../components/bits';
import { useStore } from '../../store';
import { defaultSettings } from '../../domain/types';
import { rupiah } from '../../domain/time';
import { useTitle } from '../../hooks';

export function usePublicInfo() {
  const info = useStore((r) => r.info);
  return {
    admin_whatsapp: info?.admin_whatsapp ?? defaultSettings.admin_whatsapp,
    admin_whatsapp_label: info?.admin_whatsapp_label ?? defaultSettings.admin_whatsapp_label,
    price_private: info?.price_private ?? defaultSettings.price_private,
    price_group: info?.price_group ?? defaultSettings.price_group,
    mentors: info?.mentors ?? null, courses: info?.courses ?? null,
  };
}

export function PubNav() {
  const info = usePublicInfo();
  const signedIn = useStore((r) => r.status === 'ready');
  return (
    <header className="pub-nav">
      <Link to="/" className="brand" style={{ padding: 0 }}><Logo /> <span>IE<span className="dot">.</span>Academie</span></Link>
      <div className="links">
        <span className="hide-sm"><WaButton phone={info.admin_whatsapp} text="Halo admin IE.Academie, saya mau tanya soal les." label="Chat admin" sm /></span>
        <Link className="btn primary sm" to={signedIn ? '/beranda' : '/masuk'}>{signedIn ? 'Buka dasbor' : 'Masuk'}</Link>
      </div>
    </header>
  );
}

export function PubFoot() {
  const info = usePublicInfo();
  return (
    <footer className="pub-foot">
      <div className="in">
        <div>© {new Date().getFullYear()} IE.Academie · Les privat Teknik Industri</div>
        <div className="row wrap" style={{ gap: 16 }}>
          <span>WhatsApp admin: <a href={`https://wa.me/${info.admin_whatsapp.replace(/[^0-9]/g, '')}`}>{prettyPhone(info.admin_whatsapp)}</a> ({info.admin_whatsapp_label})</span>
          <Link to="/privasi">Kebijakan privasi</Link>
          <Link to="/syarat">Syarat layanan</Link>
        </div>
      </div>
    </footer>
  );
}

export function SessionTimeline() {
  const parts = [
    { t: 'Pretest', m: '0–5', bg: '#5b6b78' },
    { t: 'Materi & latihan', m: '5–45', bg: '#0f4c45' },
    { t: 'Pembahasan', m: '45–55', bg: '#0a9488' },
    { t: 'Posttest', m: '55–60', bg: '#5b6b78' },
  ];
  return (
    <div className="timeline" role="list" aria-label="Susunan satu sesi 60 menit">
      {parts.map((p) => <div key={p.t} role="listitem" style={{ background: p.bg }} title={`${p.t}, menit ${p.m}`}>{p.t.split(' ')[0]}<span>{p.m}</span></div>)}
    </div>
  );
}

export function Landing() {
  useTitle('');
  const info = usePublicInfo();
  const signup = 'Halo admin IE.Academie, saya mau daftar les. Nama: \nMata kuliah: \nKampus/angkatan: ';
  return (
    <div className="pub">
      <PubNav />
      <section className="hero">
        <div className="hero-in">
          <div>
            <h1>Les privat Teknik Industri dengan <em>progres yang terukur</em>.</h1>
            <p className="lead">Pilih mata kuliah, pilih jam dari mentor yang siap mengajarkannya, lalu lihat nilai pretest dan posttest tiap topik naik dari sesi ke sesi.</p>
            <div className="cta">
              <WaButton phone={info.admin_whatsapp} text={signup} label="Daftar lewat WhatsApp" />
              <Link className="btn lg" to="/masuk">Sudah punya akun? Masuk</Link>
            </div>
            <p className="small muted" style={{ marginTop: 14 }}>
              Admin: <b className="num">{prettyPhone(info.admin_whatsapp)}</b> ({info.admin_whatsapp_label})
            </p>
          </div>
          <div className="card stack">
            <div className="h-card">Satu sesi, 60 menit</div>
            <SessionTimeline />
            <p className="small muted">Pretest di awal menunjukkan bagian yang belum dikuasai. Posttest di akhir mengukur hasil sesi. Nilai posttest menentukan status topik di dasbormu.</p>
            <div className="tiles" style={{ gridTemplateColumns: '1fr', gap: 8 }}>
              <div className="tile need" style={{ padding: 10 }}><div className="tile-top"><Icon name="alert" size={16} />Perlu konsultasi<span className="ml-auto small">di bawah 60</span></div></div>
              <div className="tile practice" style={{ padding: 10 }}><div className="tile-top"><Icon name="refresh" size={16} />Sedang dilatih<span className="ml-auto small">60 sampai 79</span></div></div>
              <div className="tile mastered" style={{ padding: 10 }}><div className="tile-top"><Icon name="check" size={16} />Dikuasai<span className="ml-auto small">80 ke atas</span></div></div>
            </div>
          </div>
        </div>
      </section>

      <section className="pub-section">
        <h2>Cara kerjanya</h2>
        <p className="lead">Dari daftar sampai nilai tercatat, semuanya di satu tempat dan langsung masuk Google Calendar.</p>
        <div className="flow">
          <div><h3>Admin mendaftarkanmu</h3><p>Kamu menerima email undangan, membuat kata sandi sendiri, dan mata kuliahmu sudah terpasang.</p></div>
          <div><h3>Pilih jam dan mentor</h3><p>Hanya mentor yang mengajar mata kuliahmu yang tampil. Private atau kelas bersama, paling lambat 24 jam sebelumnya.</p></div>
          <div><h3>Bayar, lalu masuk kalender</h3><p>Upload bukti transfer. Setelah admin konfirmasi, sesi masuk Google Calendar dengan pengingat 5 hari, 3 hari, 1 hari, 6 jam, dan 1 jam sebelumnya.</p></div>
          <div><h3>Lihat progresmu</h3><p>Tiap topik berstatus Perlu konsultasi, Sedang dilatih, atau Dikuasai, lengkap dengan saran topik berikutnya.</p></div>
        </div>
      </section>

      <section className="pub-section" style={{ paddingTop: 0 }}>
        <h2>Biaya per sesi</h2>
        <p className="lead">{info.courses ? `${info.courses} mata kuliah Teknik Industri` : 'Mata kuliah Teknik Industri'}{info.mentors ? ` dengan ${info.mentors} mentor` : ''}. Tanpa paket wajib, bayar per sesi.</p>
        <div className="grid g2">
          <div className="price-card">
            <div className="h-card">Private</div>
            <div className="p num">{rupiah(info.price_private)}</div>
            <div className="muted small">per sesi 60 menit, 1 peserta</div>
            <ul><li>Materi mengikuti kebutuhanmu</li><li>Pretest dan posttest per topik</li><li>Laporan sesi dari mentor</li></ul>
          </div>
          <div className="price-card">
            <div className="h-card">Kelas bersama</div>
            <div className="p num">{rupiah(info.price_group)}</div>
            <div className="muted small">per orang per sesi, maksimal 5 peserta</div>
            <ul><li>Bisa membuka kelas atau bergabung ke kelas yang sudah dibuka</li><li>Terbuka untuk peserta mata kuliah yang sama</li><li>Pretest dan posttest tetap per orang</li></ul>
          </div>
        </div>
        <div className="banner info" style={{ marginTop: 16 }}>
          <Icon name="info" size={18} className="ic" />
          <div className="grow">
            <div>Aturan jadwal</div>
            <p>Booking paling lambat 24 jam sebelum sesi. Pindah jadwal sendiri paling lambat H-1; uang tidak dikembalikan, tetapi kursimu berubah jadi kredit untuk sesi lain. Bila mentor membatalkan, kamu otomatis mendapat kredit.</p>
          </div>
        </div>
      </section>

      <section className="pub-section" style={{ paddingTop: 0 }}>
        <div className="card row wrap between" style={{ padding: 24 }}>
          <div className="stack sm">
            <div className="h-section">Ada pertanyaan sebelum daftar?</div>
            <p className="muted">Hubungi admin {info.admin_whatsapp_label} di <b className="num">{prettyPhone(info.admin_whatsapp)}</b>.</p>
          </div>
          <WaButton phone={info.admin_whatsapp} text="Halo admin IE.Academie, saya mau tanya soal les." label="Chat di WhatsApp" />
        </div>
      </section>
      <PubFoot />
    </div>
  );
}
