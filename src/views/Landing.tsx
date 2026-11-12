import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { GainBar, GainLegend, SessionBar } from '../components/bits';
import { useStore } from '../store';

/** Halaman depan publik. Angka pada kartu contoh adalah ilustrasi dan diberi label. */
export function Landing() {
  const signedIn = useStore((r) => r.status === 'ready');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.title = 'IE.Academie · Les privat Teknik Industri';
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.15 });
    ref.current?.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  const cta = signedIn ? 'Buka akunmu' : 'Masuk';

  return (
    <div ref={ref}>
      <div className="strip"><span className="mono">Les privat mata kuliah Teknik Industri · Setiap sesi diukur dengan pretest dan posttest</span></div>
      <nav className="lnav" aria-label="Halaman depan">
        <Link to="/" className="brand">IE<span>.</span>Academie</Link>
        <div className="links"><a href="#sesi">Satu sesi</a><a href="#cara">Cara kerja</a><a href="#akun">Isi akun</a></div>
        <Link to="/beranda" className="btn">{cta}</Link>
      </nav>

      <header className="hero">
        <div className="container">
          <h1 className="display" aria-label="Pretest, belajar, posttest">
            <span className="line"><span>Pretest</span></span>
            <span className="line"><span>Belajar</span></span>
            <span className="line"><span>Posttest</span></span>
          </h1>
          <div className="hero-foot">
            <div>
              <p>Kamu mengerjakan tes singkat sebelum dan sesudah tiap sesi. Selisih dua nilai itu menunjukkan apa yang bertambah hari ini, dan kamu bisa melihatnya per mata kuliah di akunmu.</p>
              <div className="row wrap" style={{ marginTop: 20 }}><Link to="/beranda" className="btn primary">{cta}</Link><a href="#cara" className="btn">Lihat cara kerjanya</a></div>
            </div>
            <div id="sesi"><SessionBar tall /><p className="mono muted" style={{ marginTop: 10 }}>Satu sesi 60 menit · Private satu peserta · Kelas bersama maksimal lima</p></div>
          </div>
        </div>
      </header>

      <section className="band" id="cara">
        <div className="container">
          <h2 className="h reveal">Cara kerja</h2>
          <div className="steps reveal">
            <div><span className="no">01</span><h3>Jadwal</h3><p>Admin menulis jadwal sesimu. Jadwal itu muncul di akunmu dan bisa masuk ke Google Calendar.</p></div>
            <div><span className="no">02</span><h3>Materi</h3><p>PPT dan latihan untuk sesimu tersedia sebelum sesi dimulai, di halaman Materi.</p></div>
            <div><span className="no">03</span><h3>Sesi</h3><p>Lima menit pretest, empat puluh menit materi dan latihan, sepuluh menit pembahasan, lima menit posttest.</p></div>
            <div><span className="no">04</span><h3>Progres</h3><p>Mentor mengisi nilaimu dalam 24 jam. Grafikmu bergerak tiap sesi.</p></div>
          </div>
        </div>
      </section>

      <section className="band" id="akun" style={{ background: 'var(--surface)' }}>
        <div className="container">
          <h2 className="h reveal">Progres tiap mata kuliah</h2>
          <div className="hero-foot" style={{ alignItems: 'start', marginTop: 0 }}>
            <div className="reveal">
              <p style={{ fontSize: 19, maxWidth: '46ch' }}>Kotak kosong adalah rata-rata pretest. Kotak hitam adalah rata-rata posttest. Ruas hijau di antaranya adalah kenaikanmu. Kalau ruasnya oranye, nilaimu turun, dan itu juga ditampilkan apa adanya.</p>
              <div style={{ marginTop: 16 }}><GainLegend /></div>
            </div>
            <div className="reveal stack" aria-label="Contoh tampilan progres">
              <span className="tag yellow" style={{ alignSelf: 'flex-start' }}>Contoh tampilan</span>
              {[['IE2101', 'Penelitian Operasional I', 46, 82, 'cobalt'], ['IE2305', 'Statistika Industri', 58, 74, 'orange'], ['IE2203', 'Ergonomi dan Perancangan Sistem Kerja', 64, 61, 'green']].map(([code, title, pre, post, color]) => (
                <div key={code as string} className="pcard" style={{ ['--c' as any]: `var(--${color})` }}>
                  <div className="row between"><span className="code">{code}</span></div>
                  <div className="t">{title}</div>
                  <GainBar pre={pre as number} post={post as number} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="band dark">
        <div className="container">
          <h2 className="h reveal">Tiga akun, satu jadwal</h2>
          <div className="roles reveal">
            <div><h3>Peserta</h3><ul><li>Sesi berikutnya dan tautan pretest</li><li>Materi untuk mata kuliah yang diambil</li><li>Nilai pretest dan posttest tiap sesi</li><li>Progres per mata kuliah</li></ul></div>
            <div><h3>Mentor</h3><ul><li>Jadwal mengajar</li><li>Materi sesi dari pengelola</li><li>Laporan: kehadiran, nilai, kendala, tindak lanjut</li><li>Progres peserta yang diajar</li></ul></div>
            <div><h3>Admin</h3><ul><li>Jadwal induk dan kode sesi</li><li>Materi untuk tiap peserta</li><li>Peserta, mentor, dan mata kuliah</li><li>Laporan yang belum masuk</li></ul></div>
          </div>
        </div>
      </section>

      <section className="band cobalt">
        <div className="container">
          <h2 className="h reveal">Sudah terdaftar?</h2>
          <p className="reveal" style={{ fontSize: 19, maxWidth: '52ch', marginBottom: 22 }}>Buat akun dengan email yang kamu berikan ke admin. Jadwal, materi, dan nilaimu langsung muncul.</p>
          <Link to="/beranda" className="btn reveal">{cta}</Link>
        </div>
      </section>

      <footer className="container lfoot">
        <span>IE.Academie · Les privat mata kuliah Teknik Industri</span>
        <span>Data peserta hanya terlihat oleh peserta itu sendiri, mentornya, dan admin.</span>
      </footer>
    </div>
  );
}
