import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '@fontsource/anton';
import { Logo, Icon } from '../../components/Icon';
import { WaButton, prettyPhone } from '../../components/bits';
import { publicCourses, useStore } from '../../store';
import { defaultSettings, groupCourses, type Course } from '../../domain/types';
import { content, resolveTheme } from '../../domain/theme';
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
    theme: info?.theme, content: content(info?.content),
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

export function PubFoot({ dark }: { dark?: boolean }) {
  const info = usePublicInfo();
  return (
    <footer className={`pub-foot ${dark ? 'dark' : ''}`}>
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
    { t: 'Pretest', m: '0–5', w: 5, key: true },
    { t: 'Materi dan latihan', m: '5–45', w: 40 },
    { t: 'Pembahasan', m: '45–55', w: 10 },
    { t: 'Posttest', m: '55–60', w: 5, key: true },
  ];
  return (
    <div className="lp-timeline" role="list" aria-label="Susunan satu sesi 60 menit">
      {parts.map((p) => (
        <div key={p.t} role="listitem" style={{ flexGrow: p.w }} className={p.key ? 'key' : ''}>
          <b>{p.t}</b><span>menit {p.m}</span>
        </div>
      ))}
    </div>
  );
}

/** Adegan 3D, dimuat terpisah. Gambar diam bila 3D dimatikan admin, perangkat hemat data, atau WebGL tidak ada. */
function Stage({ enabled, accent }: { enabled: boolean; accent: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<'loading' | '3d' | 'still'>(enabled ? 'loading' : 'still');
  useEffect(() => {
    if (!enabled) { setMode('still'); return; }
    const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
    if (nav.connection?.saveData || (nav.deviceMemory && nav.deviceMemory <= 2)) { setMode('still'); return; }
    let stop: (() => void) | null = null, dead = false;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    import('../../landing/scene').then(({ mountScene }) => {
      if (dead || !canvas.current || !stage.current) return;
      stop = mountScene(canvas.current, stage.current, { reduced, accent });
      setMode(stop ? '3d' : 'still');
    }).catch(() => setMode('still'));
    return () => { dead = true; stop?.(); };
  }, [enabled, accent]);
  return (
    <div className="lp-stage" ref={stage}>
      <div className="lp-burst" aria-hidden="true" />
      {mode !== 'still' && (
        <canvas ref={canvas} className="lp-canvas" tabIndex={0}
          aria-label="Ilustrasi 3D buku terbuka dengan pecahan grafis merah, hitam, dan putih. Seret atau pakai tombol panah untuk memutar." />
      )}
      {mode === 'still' && <img className="lp-canvas" src="/landing/fallback-scene.svg" alt="Ilustrasi buku terbuka dengan pecahan grafis merah, hitam, dan putih" width={1000} height={900} />}
      <span className="lp-sticker s1" aria-hidden="true">Kamu pilih jamnya</span>
      <span className="lp-sticker s2" aria-hidden="true">Nilai per topik</span>
      {mode === '3d' && <span className="lp-hint" aria-hidden="true">Seret untuk memutar</span>}
    </div>
  );
}

export function Landing() {
  useTitle('');
  const info = usePublicInfo();
  const c = info.content;
  const accent = resolveTheme(info.theme).accent;
  const signedIn = useStore((r) => r.status === 'ready');
  const [courses, setCourses] = useState<Pick<Course, 'id' | 'code' | 'title' | 'semester' | 'kind'>[]>([]);
  useEffect(() => { publicCourses().then(setCourses).catch(() => {}); }, []);
  const signup = 'Halo admin IE.Academie, saya mau daftar les.\nNama: \nMata kuliah: \nAngkatan: ';
  const groups = groupCourses(courses);
  // Di layar lebar semua semester terbuka; di HP tertutup supaya halaman tidak terlalu panjang.
  const [wide] = useState(() => typeof window === 'undefined' || window.innerWidth > 700);

  return (
    <div className="lp">
      <a href="#isi" className="sr-only">Lewati ke isi</a>
      <header className="lp-nav">
        <Link to="/" className="lp-brand"><Logo /> <span>IE<b>.</b>Academie</span></Link>
        <nav className="lp-links" aria-label="Bagian halaman">
          <a href="#cara">Cara kerja</a><a href="#matkul">Mata kuliah</a><a href="#biaya">Biaya</a>
        </nav>
        <Link className="lp-btn sm" to={signedIn ? '/beranda' : '/masuk'}>{signedIn ? 'Buka dasbor' : 'Masuk'}</Link>
      </header>

      <section className="lp-hero">
        <div className="lp-copy">
          <p className="lp-tags"><span>60 menit</span><span>maks 5 orang</span><span>pretest + posttest</span></p>
          <h1 className="lp-h1"><span className="a">{c.hero_title}</span> <span className="b">{c.hero_accent}</span></h1>
          <p className="lp-lead">{c.hero_lead}</p>
          <div className="lp-cta">
            <Link className="lp-btn" to={signedIn ? '/beranda' : '/masuk'}>{c.cta_label}<Icon name="arrowR" size={18} /></Link>
            <a className="lp-btn ghost" href={`https://wa.me/${info.admin_whatsapp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(signup)}`} target="_blank" rel="noreferrer"><Icon name="chat" size={18} />Daftar lewat WhatsApp</a>
          </div>
          <a className="lp-skip" href="#isi">Lewati intro <Icon name="arrowDown" size={14} /></a>
        </div>
        <Stage enabled={c.intro_3d} accent={accent} />
      </section>

      <main id="isi">
        <section id="cara" className="lp-sec paper">
          <div className="lp-in">
            <h2 className="lp-h2">Cara kerjanya</h2>
            <p className="lp-sub">{c.about}</p>
            <ol className="lp-panels">
              <li><b className="n">01</b><h3>Admin mendaftarkanmu</h3><p>Kamu menerima email undangan dan membuat kata sandi sendiri. Mata kuliahmu sudah terpasang.</p></li>
              <li><b className="n">02</b><h3>Pilih jam dan mentor</h3><p>Kamu hanya melihat mentor yang mengajar mata kuliahmu. Booking paling lambat 24 jam sebelum mulai.</p></li>
              <li><b className="n">03</b><h3>Bayar, lalu masuk kalender</h3><p>Upload bukti transfer. Setelah admin konfirmasi, undangan sesi masuk ke email-mu dan tercatat di Google Calendar.</p></li>
              <li><b className="n">04</b><h3>Lihat nilaimu naik</h3><p>Mentor mencatat pretest dan posttest. Dasbormu menandai topik yang perlu kamu ulang.</p></li>
            </ol>
          </div>
        </section>

        <section className="lp-sec ink">
          <div className="lp-in">
            <h2 className="lp-h2">Satu sesi, 60 menit</h2>
            <SessionTimeline />
            <div className="lp-bands">
              <div className="need"><b>Di bawah 60</b><span>Perlu konsultasi. Kamu mengulang topiknya, admin siap membantu.</span></div>
              <div className="practice"><b>60 sampai 79</b><span>Sedang dilatih. Satu sesi lagi biasanya cukup.</span></div>
              <div className="mastered"><b>80 ke atas</b><span>Dikuasai. Lanjut ke topik berikutnya.</span></div>
            </div>
          </div>
        </section>

        <section id="matkul" className="lp-sec paper">
          <div className="lp-in">
            <h2 className="lp-h2">Mata kuliah S1 yang bisa kamu ambil</h2>
            <p className="lp-sub">Daftar mengikuti kurikulum Departemen Teknik Sistem dan Industri ITS. Mata kuliahmu tidak ada? Kabari admin.</p>
            {groups.length === 0 ? <p className="lp-sub">Memuat daftar…</p> : (
              <div className="lp-courses">
                {groups.map(([g, list]) => (
                  <details key={g} className="lp-cgroup" open={wide}>
                    <summary><h3>{g}</h3><span className="cnt">{list.length} mata kuliah</span></summary>
                    <ul>{list.map((x) => <li key={x.id}><span className="code">{x.code}</span>{x.title}</li>)}</ul>
                  </details>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="lp-sec red">
          <div className="lp-in lp-two">
            <div>
              <h2 className="lp-h2">Untuk peserta</h2>
              <ul className="lp-list">
                <li>Kamu pilih mata kuliah, topik, dan jam sendiri.</li>
                <li>Pindah jadwal sendiri sampai H-1. Pembayaranmu ikut pindah.</li>
                <li>Kalender, tugas, dan to-do-mu ada di satu ruang kerja.</li>
              </ul>
            </div>
            <div>
              <h2 className="lp-h2">Untuk mentor</h2>
              <ul className="lp-list">
                <li>Kamu isi jam kosong sekali. Peserta booking sendiri.</li>
                <li>Sesi masuk kalender lengkap dengan nama peserta dan link tes.</li>
                <li>Laporan sesi cukup lima menit. Rekap hak tersedia tiap bulan.</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="biaya" className="lp-sec paper">
          <div className="lp-in">
            <h2 className="lp-h2">Biaya per sesi</h2>
            <div className="lp-prices">
              <div><h3>Private</h3><p className="p">{rupiah(info.price_private)}</p><p className="lp-sub">Kamu dan mentor, 60 menit.</p></div>
              <div><h3>Kelas bersama</h3><p className="p">{rupiah(info.price_group)}</p><p className="lp-sub">Per orang, sampai 5 peserta dari mata kuliah yang sama.</p></div>
            </div>
            <p className="lp-sub">Booking paling lambat 24 jam sebelum sesi. Pindah jadwal sampai H-1 tanpa biaya; uang yang sudah dibayar menjadi kredit, tidak dikembalikan tunai.</p>
          </div>
        </section>

        <section className="lp-sec ink">
          <div className="lp-in lp-contact">
            <div>
              <h2 className="lp-h2">Ada pertanyaan?</h2>
              <p className="lp-sub">Chat admin {info.admin_whatsapp_label} di <b>{prettyPhone(info.admin_whatsapp)}</b>.</p>
            </div>
            <WaButton phone={info.admin_whatsapp} text="Halo admin IE.Academie, saya mau tanya soal les." label="Chat di WhatsApp" />
          </div>
        </section>
      </main>
      <PubFoot dark />
    </div>
  );
}
