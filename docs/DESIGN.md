# IE.Academie v2: brief desain

## Tujuan
Peserta harus menjawab satu pertanyaan dalam lima detik: "topik mana yang perlu saya kerjakan?". Mentor harus tahu sesi berikutnya dan apa yang belum ia laporkan. Admin harus melihat antrean tindakan, bukan tumpukan data.

## Arah visual
Susunan dasbor analitik belajar ala IXL (area latihan berwarna, grafik mingguan, progres kurikulum, aktivitas terbaru, saran berikutnya), dengan identitas sendiri: teal tua, kartu putih di latar abu kehijauan, Plus Jakarta Sans.

## Token
| Peran | Nilai |
|---|---|
| Latar | `#F4F6F5` |
| Kartu | `#FFFFFF`, garis `#E2E6E4`, radius 12px |
| Teks | `#1F2A28`, redup `#5E6B68` |
| Utama | teal tua `#0F4C45` (tombol, navigasi aktif) |
| Seri grafik | `#0A9488` (lolos validator: band terang, chroma ≥ 0.1, kontras ≥ 3:1 di putih) |
| Perlu konsultasi | latar `#FBD5D0`, teks `#A3271A`, ikon segitiga |
| Sedang dilatih | latar `#FDECB3`, teks `#7A4F00`, ikon putar |
| Dikuasai | latar `#D6F0C5`, teks `#2E6B12`, ikon centang |
| Kalender | tersedia biru `#DBE8FB`, ditahan abu `#E7E9EA`, terbooking merah `#FBD9D6` (sama dengan warna Google Calendar) |

Warna status selalu datang bersama ikon dan label, tidak pernah sendirian.

## Aturan
- Satu tombol utama per layar. Tombol WhatsApp hijau hanya untuk menghubungi orang.
- Nomor WhatsApp admin (+62 859-6707-2383, Rasen/Sandy) terlihat di halaman depan, sidebar, dasbor, dan setiap pesan status nilai.
- Semua jam dalam WIB dan ditulis "19.00–20.00 WIB".
- Grafik: satu seri, garis ambang abu putus-putus, tooltip saat hover dan fokus keyboard, tabel tersembunyi untuk pembaca layar.
- Inklusif: lebar 390px tanpa gulir horizontal, kontras teks ≥ 4.5:1, fokus terlihat, halaman per peran dimuat terpisah supaya peserta di koneksi lambat hanya mengunduh yang ia pakai.

## Pesan status nilai
- Di bawah 60, **Perlu konsultasi**: "Topik ini perlu dievaluasi dan dipelajari lagi. Kalau butuh sesi lebih intensif, laporan, atau merasa kurang cocok, langsung hubungi admin di WhatsApp."
- 60 sampai 79, **Sedang dilatih**: "Nilaimu sudah di jalur yang benar. Ulangi latihan topik ini, dan booking sesi lagi bila masih ada bagian yang belum mantap."
- 80 ke atas, **Dikuasai**: "Pertahankan dan tetap semangat belajar. Untuk masukan atau ada masalah ke depan, hubungi admin di WhatsApp."
