import { PubFoot, PubNav, usePublicInfo } from './Landing';
import { prettyPhone } from '../../components/bits';
import { useTitle } from '../../hooks';

const UPDATED = '14 November 2026';

export function Privacy() {
  useTitle('Kebijakan privasi');
  const info = usePublicInfo();
  return (
    <div className="pub">
      <PubNav />
      <article className="legal">
        <h1>Kebijakan privasi</h1>
        <p className="muted">Berlaku sejak {UPDATED}. Berlaku untuk situs academie.my.id dan layanan IE.Academie.</p>

        <h2>Data yang kami simpan</h2>
        <ul>
          <li>Akun: nama, email, nomor WhatsApp (opsional), dan peran (peserta, mentor, admin).</li>
          <li>Belajar: mata kuliah yang diambil, jadwal sesi, kehadiran, nilai pretest dan posttest, catatan mentor, ulasan sesi.</li>
          <li>Kebutuhan belajar yang kamu isi sendiri (opsional). Hanya terlihat oleh mentor sesimu dan admin.</li>
          <li>Pembayaran: file bukti transfer. Disimpan privat, hanya terlihat olehmu dan admin.</li>
          <li>Mentor: jam ketersediaan, mata kuliah yang diajar, dan rekap hak mengajar.</li>
        </ul>

        <h2>Google Calendar</h2>
        <p>Peserta tidak menyambungkan akun Google; undangan sesi dikirim ke email peserta. Admin dan mentor yang menyambungkan akun Google memberi izin berikut, dan IE.Academie memakainya hanya untuk keperluan di bawah ini:</p>
        <ul>
          <li><b>Membuat kalender terpisah bernama "IE.Academie"</b> (mentor dan admin) untuk slot ketersediaan dan sesi.</li>
          <li><b>Membuat, mengubah, dan menghapus acara sesi</b> beserta pengingatnya, dan mengatur pengingat pada undangan sesi di kalendermu.</li>
          <li><b>Membaca status sibuk atau luang (free/busy)</b> kalender mentor supaya jam yang bentrok tidak ditawarkan ke peserta. Judul dan isi acara pribadimu tidak dibaca.</li>
        </ul>
        <p>Token akses Google disimpan di server, tidak pernah dikirim ke browser, dan dihapus saat kamu memutus sambungan di halaman Akun. Kamu juga bisa mencabut izin kapan saja di myaccount.google.com/permissions.</p>
        <p>Penggunaan dan pemindahan informasi yang diterima dari Google API oleh IE.Academie mematuhi Google API Services User Data Policy, termasuk ketentuan Limited Use. Data Google tidak dijual, tidak dipakai untuk iklan, dan tidak dipakai untuk melatih model AI.</p>

        <h2>Siapa yang bisa melihat data</h2>
        <ul>
          <li>Peserta melihat data dirinya sendiri, sesi yang diikutinya, dan nama mentornya.</li>
          <li>Mentor melihat peserta di sesi yang ia ajar beserta nilai di sesi tersebut.</li>
          <li>Admin melihat semua data untuk menjalankan layanan.</li>
          <li>Kami tidak membagikan data ke pihak lain, kecuali penyedia infrastruktur (Supabase untuk basis data, Google untuk kalender) dan bila diwajibkan hukum.</li>
        </ul>

        <h2>Penyimpanan dan penghapusan</h2>
        <p>Data disimpan selama akunmu aktif. Kamu bisa meminta salinan, koreksi, atau penghapusan data lewat admin. Bukti transfer dihapus paling lambat 12 bulan setelah sesi.</p>

        <h2>Kontak</h2>
        <p>Admin IE.Academie ({info.admin_whatsapp_label}), WhatsApp <b>{prettyPhone(info.admin_whatsapp)}</b>.</p>
      </article>
      <PubFoot />
    </div>
  );
}

export function Terms() {
  useTitle('Syarat layanan');
  const info = usePublicInfo();
  return (
    <div className="pub">
      <PubNav />
      <article className="legal">
        <h1>Syarat layanan</h1>
        <p className="muted">Berlaku sejak {UPDATED}.</p>
        <h2>Akun</h2>
        <ul>
          <li>Akun dibuat lewat undangan admin. Jaga kata sandimu; aktivitas di akunmu dianggap dilakukan olehmu.</li>
          <li>Peserta hanya bisa memesan sesi untuk mata kuliah yang didaftarkan admin.</li>
        </ul>
        <h2>Sesi</h2>
        <ul>
          <li>Satu sesi berdurasi 60 menit: pretest, materi dan latihan, pembahasan, posttest.</li>
          <li>Private untuk 1 peserta. Kelas bersama maksimal 5 peserta dari mata kuliah yang sama.</li>
          <li>Booking paling lambat 24 jam sebelum sesi dimulai.</li>
        </ul>
        <h2>Pembayaran</h2>
        <ul>
          <li>Slot ditahan sementara setelah booking. Upload bukti transfer sebelum batas waktu yang tertera, atau slot dilepas otomatis.</li>
          <li>Sesi pasti setelah admin mengonfirmasi pembayaran.</li>
        </ul>
        <h2>Pindah jadwal dan pembatalan</h2>
        <ul>
          <li>Peserta bisa pindah jadwal sendiri paling lambat H-1 (24 jam sebelum sesi). Pembayaran tidak dikembalikan; kursi yang sudah dibayar menjadi kredit untuk sesi lain.</li>
          <li>Lewat dari H-1, perubahan hanya lewat admin.</li>
          <li>Peserta yang tidak hadir tanpa kabar dianggap sudah mengikuti sesi.</li>
          <li>Bila mentor membatalkan, peserta yang sudah membayar otomatis mendapat kredit untuk booking ulang.</li>
        </ul>
        <h2>Materi</h2>
        <p>Materi, soal, dan rekaman dari IE.Academie hanya untuk belajar pribadi dan tidak boleh disebarluaskan tanpa izin.</p>
        <h2>Kontak</h2>
        <p>Pertanyaan atau keberatan: admin ({info.admin_whatsapp_label}), WhatsApp <b>{prettyPhone(info.admin_whatsapp)}</b>.</p>
      </article>
      <PubFoot />
    </div>
  );
}
