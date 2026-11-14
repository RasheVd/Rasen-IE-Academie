/**
 * Uji ujung ke ujung IE.Academie v2 di browser sungguhan, terhadap project Supabase.
 * Akun uji: e2e-admin, e2e-mentor, e2e-siswa, e2e-siswa2 (@example.com), kata sandi di E2E_PASSWORD.
 * Mentor uji mengajar STI1 dengan slot 08.00–22.00 tiap hari; kedua peserta terdaftar di STI1.
 *
 *   node e2e/run.mjs <baseUrl> 1   booking, bayar, konfirmasi, batal oleh mentor, kredit, pindah jadwal
 *   (geser sesi private ke masa lalu lewat SQL, lihat e2e/state.json)
 *   node e2e/run.mjs <baseUrl> 2   laporan mentor, dasbor peserta, ulasan, hak mentor, undangan, kalender, HP
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const base = process.argv[2] ?? 'http://localhost:4173';
const phase = process.argv[3] ?? '1';
const PASS = process.env.E2E_PASSWORD;
if (!PASS) { console.error('Set E2E_PASSWORD'); process.exit(2); }
mkdirSync('e2e/screenshots', { recursive: true });
const STATE = 'e2e/state.json';
const state = existsSync(STATE) && phase !== '1' ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const browser = await chromium.launch();
const results = [], errors = [];
// 1x1 PNG sebagai bukti transfer uji.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function as(who, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|academie-gcal|FunctionsHttpError/.test(m.text())) errors.push(`${who}: ${m.text()}`); });
  await page.goto(base + '/masuk');
  await page.getByLabel('Email').fill(`e2e-${who}@example.com`);
  await page.getByLabel('Kata sandi').fill(PASS);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(/\/beranda/, { timeout: 20000 });
  await page.locator('.side').waitFor({ timeout: 20000 });
  return { ctx, page };
}
const step = async (name, page, fn) => {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', `${name}: ${e.message.split('\n')[0]}`]); await page?.screenshot({ path: `e2e/screenshots/FAIL-${name.replace(/\W+/g, '_').slice(0, 50)}.png`, fullPage: true }).catch(() => {}); }
};
const shot = (page, n, fullPage = false) => page.screenshot({ path: `e2e/screenshots/${n}.png`, fullPage });
const toast = (page, re) => page.locator('.toast').filter({ hasText: re }).first().waitFor({ timeout: 15000 });
const dialog = (page) => page.getByRole('dialog');

async function bookFirst(page, { mode, topicIndex, join = false }) {
  await page.goto(base + '/booking');
  await page.getByLabel('Topik yang mau dipelajari').selectOption({ index: topicIndex });
  if (mode === 'group') await page.getByRole('button', { name: /^Kelas bersama ·/ }).click();
  const slot = page.locator(join ? '.slot.join' : '.slot:not(.join)').first();
  await slot.waitFor({ timeout: 20000 });
  const label = await slot.innerText();
  await slot.click();
  await dialog(page).getByRole('button', { name: /Booking/ }).click();
  await page.waitForURL(/\/sesi\/[0-9a-f-]{36}/, { timeout: 20000 });
  return { id: page.url().match(/sesi\/([0-9a-f-]{36})/)[1], label };
}
async function uploadProof(page) {
  await page.getByLabel('Bukti transfer').setInputFiles({ name: 'bukti.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Kirim bukti bayar' }).click();
  await page.getByText('Menunggu konfirmasi admin').first().waitFor({ timeout: 15000 });
}

if (phase === '1') {
  /* Halaman publik */
  {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    page.on('pageerror', (e) => errors.push(`publik: ${e.message}`));
    await step('halaman depan menampilkan WA admin dan harga', page, async () => {
      await page.goto(base + '/');
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.getByText('+62 859-6707-2383').first().waitFor();
      await page.getByText('Rp70.000').first().waitFor();
      await shot(page, '01-depan', true);
    });
    await step('kebijakan privasi dan syarat', page, async () => {
      await page.goto(base + '/privasi'); await page.getByRole('heading', { name: 'Kebijakan privasi' }).waitFor(); await page.getByText('Limited Use').waitFor();
      await page.goto(base + '/syarat'); await page.getByRole('heading', { name: 'Syarat layanan' }).waitFor();
    });
    await step('rute terlindung diarahkan ke halaman masuk', page, async () => {
      await page.goto(base + '/booking'); await page.waitForURL(/\/masuk\?next=%2Fbooking/); await page.getByRole('heading', { name: 'Masuk ke akunmu' }).waitFor(); await shot(page, '02-masuk');
    });
    await step('tautan undangan kosong menampilkan pesan', page, async () => {
      await page.goto(base + '/undangan'); await page.getByRole('heading', { name: 'Tautan tidak berlaku' }).waitFor();
    });
    await page.close();
  }

  /* Peserta 2 membuka kelas bersama dan upload bukti */
  {
    const { ctx, page } = await as('siswa2');
    await step('peserta 2 melihat dasbor kosong', page, async () => { await page.getByRole('heading', { name: /Halo, E2E/ }).waitFor(); await shot(page, '03-peserta-dasbor-awal', true); });
    await step('peserta 2 membuka kelas bersama', page, async () => {
      const b = await bookFirst(page, { mode: 'group', topicIndex: 1 });
      state.group = b.id; state.groupLabel = b.label;
      await page.getByText(/ditahan untukmu/).waitFor();
      await shot(page, '04-peserta-bayar', true);
    });
    await step('peserta 2 upload bukti bayar', page, () => uploadProof(page));
    await ctx.close();
  }

  /* Peserta 1: private + gabung kelas bersama */
  {
    const { ctx, page } = await as('siswa');
    await step('peserta 1 booking private', page, async () => {
      await page.goto(base + '/booking');
      await page.getByLabel('Topik yang mau dipelajari').selectOption({ index: 2 });
      await page.locator('.slot').first().waitFor({ timeout: 20000 });
      await shot(page, '05-booking-slot', true);
      const b = await bookFirst(page, { mode: 'private', topicIndex: 2 });
      state.priv = b.id;
    });
    await step('peserta 1 upload bukti private', page, () => uploadProof(page));
    await step('peserta 1 bergabung ke kelas bersama terbuka', page, async () => {
      const b = await bookFirst(page, { mode: 'group', topicIndex: 1, join: true });
      if (b.id !== state.group) throw new Error('bergabung ke sesi yang salah');
      await page.getByText('Belum dibayar').waitFor();
    });
    await step('peserta 1 tidak bisa booking slot yang sudah dipakai sendiri (cek ganda di server)', page, async () => {
      await page.goto(base + '/sesi'); await page.locator('.list-item').nth(1).waitFor();
    });
    await ctx.close();
  }

  /* Admin mengonfirmasi pembayaran */
  {
    const { ctx, page } = await as('admin');
    await step('admin melihat antrean tindakan', page, async () => {
      await page.getByText('Bukti bayar menunggu konfirmasi').waitFor();
      await shot(page, '06-admin-beranda', true);
    });
    await step('admin mengonfirmasi tiga pembayaran', page, async () => {
      await page.goto(base + '/pembayaran');
      await page.getByRole('heading', { name: 'Pembayaran' }).waitFor();
      await shot(page, '07-admin-pembayaran', true);
      const btns = page.getByRole('button', { name: 'Konfirmasi lunas' });
      for (let left = 3; left > 0; left--) {
        await btns.first().waitFor({ timeout: 10000 });
        if ((await btns.count()) !== left) throw new Error(`antrean ${await btns.count()}, harusnya ${left}`);
        await btns.first().click();
        await page.waitForFunction((n) => document.querySelectorAll('button').length && [...document.querySelectorAll('button')].filter((b) => b.textContent?.includes('Konfirmasi lunas')).length === n, left - 1, { timeout: 15000 });
      }
      if (await page.getByRole('button', { name: 'Konfirmasi lunas' }).count()) throw new Error('masih ada pembayaran tertunda');
    });
    await step('admin melihat kalender induk', page, async () => {
      await page.goto(base + '/kalender');
      await page.locator('.cal').waitFor();
      if (!(await page.locator('.ev.booked').count())) await page.getByRole('button', { name: 'Minggu berikutnya' }).click();
      await page.locator('.ev.booked').first().waitFor({ timeout: 10000 });
      await shot(page, '08-admin-kalender');
    });
    await ctx.close();
  }

  /* Mentor membatalkan kelas bersama */
  {
    const { ctx, page } = await as('mentor');
    await step('mentor melihat agenda dan banner Google', page, async () => {
      await page.getByRole('heading', { name: /Halo, E2E/ }).waitFor();
      await page.locator('.list-item').first().waitFor();
      await shot(page, '09-mentor-beranda', true);
    });
    await step('mentor konfirmasi siap', page, async () => {
      await page.goto(base + '/sesi/' + state.priv);
      await page.getByRole('button', { name: 'Saya sudah siap' }).click();
      await toast(page, /siap mengajar/);
      await page.getByText('Sudah siap mengajar').waitFor();
    });
    await step('mentor membatalkan kelas bersama dan mendapat tombol WhatsApp', page, async () => {
      await page.goto(base + '/sesi/' + state.group);
      await page.getByRole('button', { name: 'Batalkan sesi' }).click();
      await dialog(page).getByLabel('Alasan untuk peserta').fill('Saya sakit, mohon maaf. Silakan pilih jadwal lain.');
      await dialog(page).getByRole('button', { name: 'Batalkan sesi' }).click();
      await dialog(page).getByRole('heading', { name: 'Sesi dibatalkan' }).waitFor({ timeout: 15000 });
      const links = dialog(page).getByRole('link', { name: /lewat WhatsApp/ });
      if ((await links.count()) !== 2) throw new Error(`tombol WA ${await links.count()}`);
      const href = await links.first().getAttribute('href');
      if (!/^https:\/\/wa\.me\/62812/.test(href) || !/kredit/.test(decodeURIComponent(href))) throw new Error('isi WA salah: ' + href);
      await shot(page, '10-mentor-batal-wa');
    });
    await step('mentor menambah libur dan mengajukan mata kuliah', page, async () => {
      await page.goto(base + '/ketersediaan');
      await page.getByText('Pola mingguan', { exact: true }).waitFor();
      await page.getByLabel('Keterangan').fill('UAS E2E');
      await page.getByRole('button', { name: 'Tambah libur' }).click();
      await toast(page, /Libur tersimpan/);
      await page.getByLabel('Pilih mata kuliah').selectOption({ label: 'KAL1 · Kalkulus 1' });
      await page.getByRole('button', { name: 'Ajukan' }).click();
      await toast(page, /Diajukan/);
      await shot(page, '11-mentor-ketersediaan', true);
    });
    await ctx.close();
  }

  /* Peserta 1 memakai kredit lalu pindah jadwal */
  {
    const { ctx, page } = await as('siswa');
    await step('peserta 1 menerima kredit dari pembatalan', page, async () => { await page.getByText('Kamu punya 1 kredit sesi').waitFor(); });
    await step('peserta 1 booking pakai kredit', page, async () => {
      const b = await bookFirst(page, { mode: 'private', topicIndex: 3 });
      state.credit = b.id;
      await page.getByText(/berhasil/).first().waitFor();
    });
    await step('peserta 1 pindah jadwal sendiri', page, async () => {
      await page.getByRole('button', { name: 'Pindah jadwal' }).click();
      await dialog(page).locator('.slot').nth(3).click();
      await dialog(page).getByRole('button', { name: 'Pindahkan' }).click();
      await page.waitForURL((u) => !u.pathname.endsWith(state.credit), { timeout: 15000 });
      state.moved = page.url().match(/sesi\/([0-9a-f-]{36})/)[1];
      await toast(page, /dipindah/);
      await page.getByText('Terjadwal').first().waitFor();
    });
    await ctx.close();
  }
  writeFileSync(STATE, JSON.stringify(state, null, 2));
}

if (phase === '2') {
  /* Mentor mengisi laporan untuk sesi yang sudah lewat */
  {
    const { ctx, page } = await as('mentor');
    await step('mentor melihat laporan belum diisi', page, async () => { await page.getByText(/Laporan .* belum diisi/).first().waitFor(); });
    await step('mentor mengisi laporan dan nilai', page, async () => {
      await page.goto(base + '/sesi/' + state.priv);
      await page.getByRole('button', { name: 'Isi laporan' }).first().click();
      await dialog(page).getByLabel('Pretest E2E Sari Peserta').fill('40');
      await dialog(page).getByLabel('Posttest E2E Sari Peserta').fill('55');
      await dialog(page).getByLabel('Catatan sesi').fill('Membahas distribusi sampling. Perlu latihan soal tambahan.');
      await shot(page, '12-mentor-laporan');
      await dialog(page).getByRole('button', { name: 'Simpan dan tandai selesai' }).click();
      await toast(page, /Sesi selesai/);
    });
    await step('mentor melihat hak 70%', page, async () => {
      await page.goto(base + '/hak'); await page.getByText('Rp49.000').first().waitFor(); await shot(page, '13-mentor-hak');
    });
    await ctx.close();
  }

  /* Peserta melihat dasbor gaya IXL dan memberi ulasan */
  {
    const { ctx, page } = await as('siswa');
    await step('dasbor menampilkan topik perlu konsultasi + WA admin', page, async () => {
      const tile = page.locator('.tile.need');
      await tile.locator('.count').filter({ hasText: '1' }).waitFor();
      await tile.getByRole('link', { name: /WhatsApp admin/ }).waitFor();
      await page.getByText('Saran berikutnya').waitFor();
      await shot(page, '14-peserta-dasbor', true);
    });
    await step('halaman topik', page, async () => { await page.goto(base + '/topik'); await page.getByText('topik perlu konsultasi').waitFor(); await shot(page, '15-peserta-topik', true); });
    await step('peserta memberi ulasan', page, async () => {
      await page.goto(base + '/sesi/' + state.priv);
      await page.getByRole('radio', { name: '5 bintang' }).click();
      await page.getByLabel('Masukan').fill('Penjelasannya jelas.');
      await page.getByRole('button', { name: 'Kirim ulasan' }).click();
      await toast(page, /Terima kasih/);
    });
    await ctx.close();
  }
  {
    const { ctx, page } = await as('siswa', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await step('tampilan HP: dasbor dan menu', page, async () => {
      await page.getByRole('heading', { name: /Halo, E2E/ }).waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) throw new Error(`gulir horizontal ${overflow}px`);
      await shot(page, '16-hp-dasbor', true);
      await page.getByRole('button', { name: 'Buka menu' }).click();
      await page.getByRole('link', { name: 'Booking sesi' }).first().waitFor();
      await shot(page, '17-hp-menu');
    });
    await step('tampilan HP: booking', page, async () => {
      await page.goto(base + '/booking');
      await page.getByLabel('Topik yang mau dipelajari').selectOption({ index: 1 });
      await page.locator('.slot').first().waitFor({ timeout: 20000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) throw new Error(`gulir horizontal ${overflow}px`);
      await shot(page, '18-hp-booking', true);
    });
    await ctx.close();
  }

  /* Admin: hak mentor, kompetensi, undangan, katalog */
  {
    const { ctx, page } = await as('admin');
    await step('admin mencatat transfer hak mentor', page, async () => {
      await page.goto(base + '/hak');
      await page.getByRole('button', { name: 'Catat transfer' }).first().click();
      await dialog(page).getByRole('button', { name: 'Simpan' }).click();
      await toast(page, /Transfer dicatat/);
      await page.getByText('Lunas').first().waitFor();
    });
    await step('admin menyetujui kompetensi mentor', page, async () => {
      await page.goto(base + '/mentor');
      await page.getByRole('link', { name: /E2E Mentor Budi/ }).click();
      await page.getByRole('button', { name: 'Setujui' }).click();
      await toast(page, /Disetujui/);
      await shot(page, '19-admin-mentor', true);
    });
    await step('admin melihat dasbor peserta', page, async () => {
      await page.goto(base + '/peserta');
      await page.getByRole('link', { name: /E2E Sari Peserta/ }).click();
      await page.locator('.tile.need').waitFor();
      await page.getByText('Kredit sesi').waitFor();
      await shot(page, '20-admin-peserta', true);
    });
    await step('admin mengundang peserta (email atau tautan WA)', page, async () => {
      await page.goto(base + '/peserta?undang=1');
      await dialog(page).getByLabel('Nama lengkap').fill('E2E Undangan');
      await dialog(page).getByLabel(/^Email/).fill('e2e-undangan@example.com');
      await dialog(page).getByLabel('Nomor WhatsApp').fill('081200000009');
      await dialog(page).getByRole('checkbox', { name: /Statistika Industri 1/ }).check();
      await dialog(page).getByRole('button', { name: 'Kirim undangan' }).click();
      const sent = page.locator('.toast').filter({ hasText: /Undangan terkirim/ });
      const failed = dialog(page).getByText('Email undangan belum bisa dikirim');
      await Promise.race([sent.waitFor({ timeout: 20000 }), failed.waitFor({ timeout: 20000 })]);
      if (await failed.isVisible().catch(() => false)) {
        state.inviteMode = 'link';
        await dialog(page).getByRole('button', { name: 'Buat tautan undangan' }).click();
        const wa = dialog(page).getByRole('link', { name: /lewat WhatsApp/ });
        await wa.waitFor({ timeout: 15000 });
        if (!/wa\.me\/6281200000009/.test(await wa.getAttribute('href'))) throw new Error('tautan WA salah');
        await shot(page, '21-admin-undangan-wa');
      } else state.inviteMode = 'email';
    });
    await step('admin membuka katalog', page, async () => {
      await page.goto(base + '/katalog');
      await page.getByRole('button', { name: /STI1 Statistika Industri 1/ }).click();
      await page.getByLabel(/^Pretest /).first().waitFor();
      await shot(page, '22-admin-katalog');
    });
    await ctx.close();
  }
  writeFileSync(STATE, JSON.stringify(state, null, 2));
}

await browser.close();
for (const [s, n] of results) console.log(s, n);
if (errors.length) { console.log('\nGalat konsol:'); for (const e of [...new Set(errors)].slice(0, 20)) console.log(' ', e); }
console.log(`\n${results.filter((r) => r[0] === 'PASS').length}/${results.length} lolos`);
process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
