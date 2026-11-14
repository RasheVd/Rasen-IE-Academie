# IE.Academie

Portal les privat mata kuliah Teknik Industri di **academie.my.id**, untuk tiga peran:

- **Peserta** memilih jam dari mentor yang mengajar mata kuliahnya, membayar dengan upload bukti transfer, pindah jadwal sendiri sampai H-1, dan melihat dasbor progres per topik (Perlu konsultasi, Sedang dilatih, Dikuasai).
- **Mentor** mengisi pola jam mingguan tanpa tanggal akhir, menyambungkan Google Calendar sendiri (slot biru, terbooking merah), konfirmasi siap H-1, mengisi laporan dan nilai, membatalkan sesi dengan tombol "Kabari lewat WhatsApp", mengusulkan bahan, dan melihat rekap hak 70%.
- **Admin** mengundang orang lewat email, memasang mata kuliah per peserta, menyetujui kompetensi mentor, mengonfirmasi pembayaran, mengelola katalog mata kuliah dan topik (anti salah ketik), meninjau bahan mentor, mencatat transfer hak mentor, dan mengatur aturan bisnis.

Aturan bisnis dijaga di database, bukan hanya di tampilan: sesi 60 menit, private 1 orang, kelas bersama maks 5, booking paling lambat 24 jam sebelumnya, slot ditahan 12 jam menunggu bukti bayar, pindah jadwal sampai H-1 (kursi lunas jadi kredit), pembatalan mentor memberi kredit otomatis, satu mentor tidak bisa punya dua sesi bertumpuk, peserta tidak hadir tetap dihitung untuk hak mentor.

## Teknologi

React 19, Vite 8, TypeScript 7, react-router 7, Supabase (Postgres + RLS, Auth, Storage, Edge Functions, pg_cron), Google Calendar API. Tanpa server sendiri: situsnya statis, logika ada di database dan dua Edge Function.

```
src/domain/            logika murni dan teruji: waktu WIB, slot, status topik, hak mentor, WhatsApp
src/store.ts           auth, pemuatan data, semua aksi ke Supabase
src/components/        kerangka, grafik, pemilih slot, kartu Google
src/views/             halaman per peran (student/, mentor/, admin/, public/) dan halaman bersama
supabase/schema.sql    tabel, RLS, fungsi booking/bayar/batal/laporan, cron
supabase/seed.sql      34 mata kuliah Teknik Industri dan 201 topik
supabase/functions/    academie-gcal (Google Calendar), academie-invite (undangan email)
tests/                 uji unit (vitest): domain + logika Google Calendar terhadap API tiruan
e2e/                   uji browser tiga peran (Playwright) dan uji keamanan API
.github/workflows/     build, uji, unggah ke DomaiNesia
```

## Menjalankan di komputer sendiri

Butuh Node.js 20 atau lebih baru.

```bash
npm install
```

```bash
cp .env.example .env
```

Isi `.env` dengan URL project dan publishable key (Supabase → Project Settings → API). Jangan pernah menaruh service_role key di sini.

```bash
npm run dev
```

Buka http://localhost:5173.

## Supabase

Project: `jemvkqefasfdctayihfu` (sudah terpasang skema, katalog, fungsi, dan cron). Untuk project baru:

1. SQL Editor: jalankan `supabase/schema.sql`, lalu `supabase/seed.sql`. Ganti `<PROJECT_REF>` di bagian cron dengan ref project.
2. Pasang fungsi:
   ```bash
   supabase functions deploy academie-gcal --no-verify-jwt
   ```
   ```bash
   supabase functions deploy academie-invite --no-verify-jwt
   ```
   Kedua fungsi memeriksa login sendiri. `academie-gcal/callback` dipanggil Google tanpa token Supabase, jadi verifikasi JWT bawaan harus mati.

### Wajib diisi di dasbor Supabase

**Authentication → URL Configuration**
- Site URL: `https://academie.my.id`
- Redirect URLs: `https://academie.my.id/**` dan `http://localhost:5173/**`

Tanpa ini, tautan undangan dan atur ulang kata sandi membuka alamat yang salah.

**Authentication → Emails → SMTP Settings.** Email bawaan Supabase hanya terkirim ke anggota tim project, jadi undangan ke peserta gagal tanpa SMTP sendiri. Pakai mailbox DomaiNesia:

1. cPanel → Email Accounts → buat `no-reply@academie.my.id`.
2. Isi SMTP Supabase: host `mail.academie.my.id`, port `465`, username `no-reply@academie.my.id`, kata sandi mailbox, sender name `IE.Academie`.
3. Templat **Invite user** (opsional, bahasa Indonesia): "Kamu diundang ke IE.Academie. Klik tautan ini untuk membuat kata sandi: {{ .ConfirmationURL }}".

Selama SMTP belum siap, tombol **Tautan WA** di halaman Peserta/Mentor membuat tautan undangan sekali pakai untuk dikirim lewat WhatsApp.

## Google Calendar

Sampai langkah ini selesai, website tetap berjalan; yang belum ada hanya penulisan ke Google Calendar.

1. https://console.cloud.google.com: buat project `IE Academie`, aktifkan **Google Calendar API**.
2. **OAuth consent screen**: External. Nama aplikasi IE.Academie, email dukungan, logo opsional.
   - Beranda aplikasi `https://academie.my.id`, kebijakan privasi `https://academie.my.id/privasi`, syarat `https://academie.my.id/syarat`, domain resmi `academie.my.id`.
   - Scope: `openid`, `email`, `.../auth/calendar.app.created`, `.../auth/calendar.events`, `.../auth/calendar.freebusy`.
   - Selama status Testing, tambahkan email mentor dan peserta sebagai test users (maks 100). Setelah siap, tekan **Publish app** dan ajukan verifikasi.
3. **Credentials → OAuth client ID**, jenis Web application. Authorized redirect URI:
   `https://jemvkqefasfdctayihfu.supabase.co/functions/v1/academie-gcal/callback`
4. Supabase → Edge Functions → Secrets: isi `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET`. Opsional: `SITE_URL`, `ALLOWED_ORIGINS` (dipisah koma).
5. Verifikasi domain di Google Search Console: tambah properti Domain `academie.my.id`, salin record TXT, tempel di DomaiNesia → DNS Management, tunggu terverifikasi. Ini syarat pengajuan verifikasi aplikasi.

Cara kerjanya:
- Mentor dan admin mendapat kalender terpisah bernama "IE.Academie". Pola jam mentor ditulis sebagai acara berulang biru "Tersedia". Saat dibooking, slot itu berubah merah dengan nama peserta; selama menunggu bayar berwarna abu.
- Pengingat 5 hari, 3 hari, 1 hari, 6 jam, dan 1 jam sebelum sesi untuk mentor dan peserta yang menyambungkan Google. Admin mendapat salinan dengan pengingat H-1.
- Deskripsi acara memuat topik, peserta, tempat, tautan pretest dan posttest.
- Mentor yang belum menyambungkan Google: sesi ditulis di kalender admin dan mentor diundang sebagai tamu.
- Jam sibuk di kalender pribadi mentor dibaca (hanya sibuk/luang) tiap 15 menit dan disembunyikan dari peserta.
- Cron tiap 15 menit mengulang penulisan yang gagal, jadi gangguan sesaat di Google tidak menghilangkan sesi.

## Deploy ke academie.my.id (DomaiNesia)

Setiap push ke `main` menjalankan `.github/workflows/deploy.yml`: install, uji, build, lalu unggah `dist/` ke `public_html` lewat FTPS.

Satu langkah manual: GitHub → repo → Settings → Secrets and variables → Actions → New repository secret, nama `FTP_PASSWORD`, isi kata sandi cPanel. Lalu buka tab Actions dan jalankan ulang workflow.

Tanpa secret itu, workflow tetap build dan menyimpan hasil sebagai artifact **situs**. Unggah manual: unduh artifact, buka cPanel → File Manager → `public_html`, upload isi zip (termasuk `.htaccess`, aktifkan "Show Hidden Files"), lalu Extract.

`public/.htaccess` memaksa HTTPS, mengalihkan www, dan mengarahkan semua alamat ke `index.html`. Pastikan SSL aktif di cPanel → SSL/TLS Status (AutoSSL) sebelum unggah pertama.

Vercel (`ie-academie.vercel.app`) tetap menyala sebagai cadangan dari repo yang sama. Paket Hobby Vercel hanya untuk pemakaian non-komersial, jadi alamat resmi tetap academie.my.id.

## Perintah

```bash
npm run dev         # server pengembangan
npm run build       # typecheck lalu build ke dist/
npm test            # uji unit
```

## Pengujian

- `npm test`: 32 uji unit (slot, ambang nilai, hak mentor, WhatsApp, WIB, dan seluruh alur Google Calendar terhadap API tiruan).
- `e2e/run.mjs`: 34 langkah di browser untuk tiga peran: booking private dan kelas bersama, bergabung ke kelas, upload bukti, konfirmasi admin, kalender induk, mentor batal dengan tombol WA, kredit, pindah jadwal, laporan dan nilai, dasbor IXL, ulasan, hak mentor, undangan, tampilan HP.
- `e2e/rls.mjs`: 24 uji keamanan langsung ke API dengan token tiap peran (peserta tidak bisa menandai dirinya lunas, memberi diri kredit, menjadi admin, melihat bukti bayar orang lain, dan seterusnya).

Keduanya butuh akun uji `e2e-admin`, `e2e-mentor`, `e2e-siswa`, `e2e-siswa2` @example.com dengan kata sandi di `E2E_PASSWORD`, dibuat lewat SQL dan dihapus setelah uji (`e2e/cleanup.mjs` untuk file bukti, SQL untuk sisanya). Akun uji tidak ada di database produksi sekarang.

Catatan advisor keamanan Supabase: peringatan "SECURITY DEFINER function executable" memang disengaja (setiap fungsi memeriksa peran di dalamnya), dan dua tabel tanpa policy (`academie_google_accounts`, `academie_oauth_states`) hanya dibaca fungsi server.

## Belum ada

- Nilai Google Form belum mengalir otomatis; mentor mengetik nilai di laporan.
- Pembayaran manual lewat bukti transfer, belum lewat payment gateway.
- Perubahan yang dibuat langsung di Google Calendar tidak kembali ke website (kecuali jam sibuk mentor).
