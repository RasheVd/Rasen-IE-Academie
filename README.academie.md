# IE.Academie

Portal les privat mata kuliah Teknik Industri untuk tiga peran: admin, mentor, dan peserta.

- **Admin** menyusun jadwal induk, mendaftarkan peserta dan mentor, mengisi materi untuk tiap peserta, dan memantau laporan.
- **Mentor** melihat jadwal mengajarnya dan mengisi laporan sesi: kehadiran, nilai pretest, nilai posttest, kendala, tindak lanjut.
- **Peserta** melihat sesi berikutnya, tautan pretest dan posttest (Google Form), materi, dan progres per mata kuliah.

## Menjalankan di komputer sendiri

Butuh Node.js 20 atau lebih baru.

```bash
npm install
```

```bash
cp .env.example .env
```

Isi `.env` dengan URL dan publishable key project Supabase, lalu:

```bash
npm run dev
```

Buka http://localhost:5173.

## Menyiapkan Supabase (sekali)

1. Buka SQL Editor di Supabase, tempel isi `supabase/schema.sql`, jalankan. Sebelum menjalankan di project baru, ganti email di baris terakhir dengan email admin pertama.
2. Biarkan **Confirm email** menyala (Authentication → Providers → Email). Akun ditautkan ke data les lewat email yang sudah terkonfirmasi.
3. Admin membuat akun di halaman Masuk dengan email admin tadi.

Cara orang lain masuk: admin menambahkan nama dan email peserta atau mentor di menu Peserta atau Mentor. Orang itu lalu membuat akun sendiri di halaman Masuk dengan email yang sama. Akun dengan email yang tidak didaftarkan admin tidak melihat data apa pun.

Email bawaan Supabase dibatasi beberapa pesan per jam. Untuk banyak peserta, pasang SMTP sendiri di Authentication → SMTP Settings.

## Google Calendar

Tanpa pengaturan apa pun, setiap halaman sesi punya tombol **Tambah ke Google Calendar**.

Untuk sinkron otomatis (sesi yang ditulis admin langsung muncul di Google Calendar mentor dan peserta sebagai undangan):

1. Di https://console.cloud.google.com buat project dan aktifkan **Google Calendar API**.
2. Di **OAuth consent screen** pilih External, isi nama aplikasi, lalu **Publish app**.
3. Di **Credentials** buat **OAuth client ID** jenis Web application. Authorized redirect URI:
   `https://<project-ref>.supabase.co/functions/v1/academie-gcal/callback`
4. Di Supabase → Edge Functions → Secrets, tambah `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET`.
5. Pasang fungsi `supabase/functions/academie-gcal` dengan JWT verification dimatikan (fungsi ini memeriksa login sendiri):
   ```bash
   supabase functions deploy academie-gcal --no-verify-jwt
   ```
6. Masuk sebagai admin, buka Pengaturan, tekan **Sambungkan Google Calendar**.

Satu akun Google (akun admin) menjadi penyelenggara. Mentor dan peserta tidak perlu memberi izin apa pun; mereka menerima undangan di email yang terdaftar.

## Nilai pretest dan posttest

Admin menempel tautan Google Form pretest dan posttest saat menulis sesi. Peserta mengerjakannya lewat tombol di akun mereka. Nilai tidak mengalir otomatis dari Google Form: mentor atau admin mengetik nilainya (0 sampai 100) di laporan sesi. Tes yang tidak diikuti dibiarkan kosong.

Progres dihitung dari nilai itu saja:

- rata-rata pretest dan posttest per mata kuliah, dari sesi yang punya dua nilai;
- kenaikan per sesi = rata-rata (posttest − pretest);
- kehadiran dan jumlah sesi selesai terhadap target.

## Struktur

```
docs/DESIGN.md                  brief desain
supabase/schema.sql             tabel, RLS, fungsi laporan, admin pertama
supabase/functions/academie-gcal  sinkron Google Calendar
src/domain/                     tipe data dan hitungan progres (murni, teruji)
src/store.ts                    auth, pemuatan data, aksi
src/components/                 batang kenaikan, batang sesi, dialog
src/views/                      satu berkas per halaman
tests/                          uji unit (vitest)
e2e/                            uji tiga peran (Playwright)
```

## Perintah

```bash
npm run dev         # server pengembangan
npm run build       # typecheck lalu build ke dist/
npm test            # uji unit
npm run typecheck
```

Uji ujung ke ujung butuh lima akun uji di Supabase (`e2e-admin`, `e2e-mentor`, `e2e-siswa`, `e2e-siswa2`, `e2e-asing` @example.com, empat yang pertama juga terdaftar di `academie_profiles`) dan `npm run dev` yang sedang berjalan:

```bash
npx playwright install chromium
E2E_PASSWORD=... npm run e2e
```

## Memasang ke internet

Hasil `npm run build` adalah situs statis di `dist/`. Unggah ke Vercel, Netlify, atau Cloudflare Pages dengan dua variabel lingkungan dari `.env`, dan arahkan semua rute ke `index.html`. Tambahkan alamat situs ke Authentication → URL Configuration di Supabase.

## Batasan saat ini

- Nilai Google Form diketik manual.
- Materi berupa tautan (Drive, YouTube). Belum ada unggah berkas.
- Belum ada pencatatan pembayaran.
- Sinkron kalender satu arah: perubahan di Google Calendar tidak kembali ke website.
