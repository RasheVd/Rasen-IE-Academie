# IE.Academie: Brief Desain Portal Les Privat

## 1. Tujuan
Bangun portal yang tegas, padat, dan mudah dibaca untuk **IE.Academie**, les privat mata kuliah Teknik Industri. Tiga orang memakainya: admin yang menyusun jadwal dan materi, mentor yang mengajar dan melaporkan nilai, peserta yang ingin tahu satu hal: "apakah saya membaik?". Kertas hangat, tinta hitam, dan empat warna datar seperti stabilo di lembar ujian: kobalt, oranye, kuning, hijau. Huruf kapital rapat membawa judul. Rasanya seperti lembar kerja teknik yang dicetak rapi, bukan dasbor SaaS.

## 2. Tumpukan teknologi
```
React + Vite + TypeScript + CSS murni (token di :root) + Supabase (Auth, Postgres, RLS, Edge Functions)
```
Tanpa pustaka komponen. Grafik digambar dengan SVG sendiri.

## 3. Sistem desain
```css
:root {
  --paper: #F5F2EA;        /* kertas hangat, latar utama */
  --surface: #FFFFFF;      /* panel dan baris */
  --ink: #101216;          /* teks, bingkai, sidebar */
  --muted: #565B63;        /* 6.3 banding 1 di atas paper */
  --line: rgba(16,18,22,.14);
  --cobalt: #2146E0;       /* aksi utama, materi */
  --orange: #F2541B;       /* pretest, perlu perhatian */
  --yellow: #F6C427;       /* sorotan, pembahasan */
  --green: #12A06B;        /* posttest, kenaikan */
  --green-ink: #0B6B47;    /* hijau untuk teks di atas paper */
  --red-ink: #B3261E;      /* penurunan, galat */
}
```
Keempat warna dipakai sebagai isian datar. Teks di atas oranye, kuning, dan hijau selalu `--ink`. Teks di atas kobalt selalu putih. Setiap teks mencapai 4.5 banding 1 terhadap latarnya, dan tidak ada teks di bawah 13px. Sudut tajam di semua tempat: radius 0 pada tombol, panel, input, dan tag. Bingkai panel 1.5px `--ink`. Garis pemisah baris 1px `--line`.

## 4. Tipografi
- **Judul halaman:** Archivo, lebar 62, tebal 800, kapital, clamp(40px, 6vw, 84px), tinggi baris 0.9.
- **Judul bagian:** Archivo, lebar 62, tebal 800, kapital, 22px, jarak huruf 0.02em.
- **Isi:** Archivo 400, 16px, tinggi baris 1.55.
- **Nama di daftar:** Archivo 700, 16px.
- **Kode sesi, nilai, jam, tanggal:** JetBrains Mono 500, 13px, kapital, jarak huruf 0.04em, angka tabular.

## 5. Tombol
Persegi dan padat, seperti stiker harga.
- **Utama:** isi kobalt, teks putih, Archivo 700 kapital 13px, jarak huruf 0.06em, padding 12px 18px. Hover: isi berubah jadi tinta. Tidak bergerak.
- **Kedua:** isi putih, bingkai 1.5px tinta. Hover: isi kuning.
- **Bahaya:** isi putih, teks merah. Hover: bingkai merah.
- Tanpa pil, tanpa bayangan, tanpa gradien.

## 6. Elemen khas
1. **Batang kenaikan.** Skala 0 sampai 100 dengan garis ukur tiap 25. Kotak kosong menandai rata-rata pretest, kotak penuh menandai posttest, ruas di antaranya terisi hijau (merah bila turun). Di kanan, selisihnya dalam mono: `+24`. Batang ini muncul di kartu mata kuliah, daftar peserta, dan halaman progres. Seluruh produk bermuara ke batang ini.
2. **Batang sesi 60 menit.** Empat ruas datar: pretest 5 (oranye), materi 40 (kobalt), pembahasan 10 (kuning), posttest 5 (hijau). Dipakai di halaman depan dan detail sesi.
3. **Kode sesi.** Chip mono berbingkai tinta, misalnya `IE2101-07`, seperti nomor komponen.

## 7. Halaman
- **Depan:** strip kuning mono di atas, navbar tinta, hero tipografi `PRETEST` `BELAJAR` `POSTTEST` tiga baris dengan batang sesi di bawahnya, empat langkah cara kerja, contoh kartu progres, blok kobalt ajakan masuk, footer tiga baris.
- **Beranda peserta:** sesi berikutnya dalam blok besar (hari, jam, tempat, mentor, tombol pretest), lalu kartu progres per mata kuliah, lalu materi terbaru.
- **Beranda mentor:** sesi hari ini dan minggu ini, lalu laporan yang belum diisi dengan penanda oranye.
- **Beranda admin:** empat angka (peserta aktif, sesi minggu ini, laporan tertunda, rata-rata kenaikan), jadwal minggu ini, progres per mata kuliah.
- **Jadwal:** daftar sesi per hari. Tiap baris: jam mono, kode, mata kuliah, topik, mentor, peserta, status.
- **Detail sesi:** kepala dengan kode dan waktu, batang 60 menit, tautan tes, materi sesi, tabel kehadiran dan nilai. Mentor dan admin mengisi laporan di sini.
- **Peserta (admin, mentor):** daftar dengan batang kenaikan per orang. Detail: mata kuliah yang diambil, progres tiap mata kuliah, materi khusus peserta itu, riwayat sesi.
- **Materi:** dikelompokkan per mata kuliah. Tiap baris: jenis (mono), judul, sasaran (semua peserta atau satu nama), sesi terkait.
- **Progres (peserta):** satu blok per mata kuliah: batang kenaikan, grafik pretest dan posttest per sesi, kehadiran, tabel sesi.

## 8. Gerak
- Judul halaman masuk dari kiri, 0.4 detik.
- Baris daftar naik pudar dengan jeda 0.04 detik, paling banyak 12 baris.
- Batang kenaikan menggambar ruasnya dari pretest ke posttest sekali, 0.6 detik.
- Hormati `prefers-reduced-motion`: tanpa geser, tanpa gambar bertahap.

## 9. Responsif
- **Di bawah 860px:** sidebar jadi bilah atas dengan tombol `Menu` yang membuka panel tinta selayar penuh dengan tautan kapital 32px. Tabel nilai bergulir mendatar di dalam bingkainya. Kartu progres satu kolom.
- **Desktop:** sidebar tinta 232px, isi maksimal 1180px, padding bagian 40px.

## 10. Bahasa
Antarmuka berbahasa Indonesia, kalimat pendek, kata kerja di depan tombol: `Tambah sesi`, `Isi laporan`, `Kerjakan pretest`. Tanpa emoji, tanpa tanda pisah panjang, tanpa lorem ipsum.

## 11. Jangan
Sudut membulat, gradien, bayangan lembut, efek kaca, kartu putih mengambang di latar abu, ikon berjajar tanpa label, teks putih di atas kuning atau oranye, hero setinggi layar, angka tanpa sumber.
