/**
 * Uji ujung ke ujung untuk tiga peran, terhadap dev server dan project Supabase.
 * Butuh akun uji: e2e-admin, e2e-mentor, e2e-siswa, e2e-siswa2, e2e-asing (@example.com)
 * dengan kata sandi di E2E_PASSWORD. Pakai: node e2e/run.mjs [baseUrl]
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const base = process.argv[2] ?? 'http://localhost:5173';
const PASS = process.env.E2E_PASSWORD;
if (!PASS) { console.error('Set E2E_PASSWORD'); process.exit(2); }
mkdirSync('e2e/screenshots', { recursive: true });
const browser = await chromium.launch();
const results = [], errors = [];
const day = (off) => { const d = new Date(Date.now() + off * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function as(who, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${who}: ${m.text()}`); });
  await page.goto(base + '/beranda');
  await page.getByLabel('Email').fill(`e2e-${who}@example.com`);
  await page.getByLabel('Kata sandi').fill(PASS);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  return { ctx, page };
}
const step = async (name, page, fn) => {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', `${name}: ${e.message.split('\n')[0]}`]); await page?.screenshot({ path: `e2e/screenshots/FAIL-${name.replace(/\W+/g, '_').slice(0, 50)}.png` }).catch(() => {}); }
};
const shot = (page, n) => page.screenshot({ path: `e2e/screenshots/${n}.png` });

/* Halaman depan */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await step('halaman depan tampil', page, async () => {
    await page.goto(base + '/');
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.waitForTimeout(900);
    await shot(page, '01-depan');
    await page.evaluate(() => window.scrollTo(0, 1500)); await page.waitForTimeout(700);
    await shot(page, '02-depan-progres');
  });
  await step('halaman masuk tampil', page, async () => { await page.goto(base + '/beranda'); await page.getByRole('heading', { name: 'Masuk' }).waitFor(); await shot(page, '03-masuk'); });
  await page.close();
}

/* Admin: mata kuliah, pendaftaran, sesi, materi */
let sessionUrl = '';
{
  const { ctx, page } = await as('admin');
  await step('admin masuk dan melihat dasbor', page, async () => { await page.getByRole('heading', { name: 'Dasbor admin' }).waitFor({ timeout: 20000 }); });
  await step('admin menambah mata kuliah', page, async () => {
    await page.goto(base + '/matkul');
    await page.getByRole('button', { name: 'Tambah mata kuliah' }).first().click();
    await page.getByLabel('Kode', { exact: true }).fill('E2E101');
    await page.getByLabel('Nama mata kuliah').fill('Penelitian Operasional Uji');
    await page.getByRole('button', { name: 'Simpan' }).click();
    await page.getByText('Penelitian Operasional Uji').first().waitFor();
  });
  await step('admin mendaftarkan peserta ke mata kuliah', page, async () => {
    await page.goto(base + '/peserta');
    await page.getByTestId('person-row').filter({ hasText: 'Siswa Uji' }).click();
    await page.getByRole('button', { name: 'Daftarkan mata kuliah' }).first().click();
    await page.getByLabel('Mentor utama').selectOption({ label: 'Mentor Uji' });
    await page.getByRole('button', { name: 'Simpan' }).click();
    await page.locator('.code', { hasText: 'E2E101' }).first().waitFor();
  });
  await step('admin menulis sesi kemarin dengan tautan tes', page, async () => {
    await page.getByRole('button', { name: 'Tambah sesi' }).click();
    await page.getByLabel('Tanggal').fill(day(-1));
    await page.getByLabel('Jam mulai').fill('16:00');
    await page.getByLabel('Mentor', { exact: true }).selectOption({ label: 'Mentor Uji' });
    await page.getByLabel('Topik').fill('Metode simpleks');
    await page.getByLabel('Tautan pretest (Google Form)').fill('https://forms.gle/pretest-uji');
    await page.getByLabel('Tautan posttest (Google Form)').fill('https://forms.gle/posttest-uji');
    await page.getByRole('button', { name: 'Simpan sesi' }).click();
    await page.waitForURL(/\/sesi\//);
    await page.locator('.code', { hasText: 'E2E101-01' }).first().waitFor();
    sessionUrl = page.url();
  });
  await step('admin menambah materi khusus peserta dari halaman sesi', page, async () => {
    await page.getByRole('button', { name: 'Tambah', exact: true }).click();
    await page.getByLabel('Judul').fill('PPT 01 Simpleks');
    await page.getByLabel('Tautan', { exact: true }).fill('https://drive.google.com/file/uji');
    await page.getByRole('button', { name: 'Simpan' }).click();
    await page.getByText('PPT 01 Simpleks').waitFor();
    await shot(page, '04-admin-sesi');
  });
  await step('validasi: tautan materi harus diawali https', page, async () => {
    await page.goto(base + '/materi');
    await page.getByRole('button', { name: 'Tambah materi' }).first().click();
    await page.getByLabel('Judul').fill('Salah');
    await page.getByLabel('Tautan', { exact: true }).fill('drive.google.com/x');
    await page.getByRole('button', { name: 'Simpan' }).click();
    await page.getByRole('alert').filter({ hasText: 'https://' }).waitFor();
    await page.keyboard.press('Escape');
  });
  await step('admin menulis sesi besok', page, async () => {
    await page.goto(base + '/jadwal');
    await page.getByRole('button', { name: 'Tambah sesi' }).first().click();
    await page.getByLabel('Tanggal').fill(day(1));
    await page.getByLabel('Jam mulai').fill('19:00');
    await page.getByLabel('Mentor', { exact: true }).selectOption({ label: 'Mentor Uji' });
    await page.getByRole('radio', { name: /Siswa Uji/ }).check();
    await page.getByLabel('Topik').fill('Dualitas');
    await page.getByLabel('Tautan pretest (Google Form)').fill('https://forms.gle/pretest-2');
    await page.getByRole('button', { name: 'Simpan sesi' }).click();
    await page.waitForURL(/\/sesi\//);
    await page.locator('.code', { hasText: 'E2E101-02' }).first().waitFor();
    await page.getByRole('link', { name: 'Tambah ke Google Calendar' }).waitFor();
  });
  await ctx.close();
}

/* Mentor: laporan */
{
  const { ctx, page } = await as('mentor');
  await step('mentor melihat laporan yang harus diisi', page, async () => {
    await page.getByRole('heading', { name: 'Laporan yang harus diisi' }).waitFor({ timeout: 20000 });
    await page.getByTestId('session-row').filter({ hasText: 'E2E101-01' }).first().waitFor();
    await shot(page, '05-mentor-beranda');
  });
  await step('mentor mengisi kehadiran dan nilai', page, async () => {
    await page.getByTestId('session-row').filter({ hasText: 'E2E101-01' }).first().click();
    await page.getByRole('button', { name: 'Isi laporan' }).click();
    await page.getByLabel('Nilai pretest Siswa Uji').fill('40');
    await page.getByLabel('Nilai posttest Siswa Uji').fill('130');
    await page.getByRole('button', { name: 'Simpan laporan' }).click();
    await page.getByRole('alert').filter({ hasText: '0 sampai 100' }).waitFor();
    await page.getByLabel('Nilai posttest Siswa Uji').fill('85');
    await page.getByLabel('Catatan sesi dan kendala').fill('Iterasi simpleks sudah lancar.');
    await page.getByRole('button', { name: 'Simpan laporan' }).click();
    await page.getByText('+45').first().waitFor();
    await page.getByText('Selesai').first().waitFor();
    await shot(page, '06-mentor-laporan');
  });
  await step('mentor tidak punya menu admin', page, async () => {
    if (await page.getByRole('link', { name: 'Mata kuliah' }).count()) throw new Error('menu Mata kuliah terlihat');
    await page.goto(base + '/matkul');
    await page.waitForURL(/\/beranda/);
  });
  await ctx.close();
}

/* Peserta: sesi berikutnya, progres, materi */
{
  const { ctx, page } = await as('siswa');
  await step('peserta melihat sesi berikutnya dan tombol pretest', page, async () => {
    await page.getByRole('heading', { name: 'Sesi berikutnya' }).waitFor({ timeout: 20000 });
    await page.getByRole('link', { name: 'Kerjakan pretest' }).waitFor();
    await page.locator('.next .code', { hasText: 'E2E101-02' }).waitFor();
  });
  await step('peserta melihat progres per mata kuliah', page, async () => {
    await page.locator('.pcard', { hasText: 'Penelitian Operasional Uji' }).getByText('+45').waitFor();
    await page.waitForTimeout(800);
    await shot(page, '07-peserta-beranda');
    await page.goto(base + '/progres');
    await page.locator('svg.chart').waitFor();
    await page.getByRole('cell', { name: 'Metode simpleks' }).waitFor();
    await page.waitForTimeout(700);
    await shot(page, '08-peserta-progres');
  });
  await step('peserta melihat materi khusus dirinya', page, async () => {
    await page.goto(base + '/materi');
    await page.getByText('PPT 01 Simpleks').waitFor();
    await page.getByText('Khusus kamu').first().waitFor();
    if (await page.getByRole('button', { name: 'Tambah materi' }).count()) throw new Error('peserta bisa menambah materi');
  });
  await step('peserta tidak bisa mengisi laporan', page, async () => {
    await page.goto(sessionUrl);
    await page.getByRole('heading', { name: 'Nilai kamu' }).waitFor();
    if (await page.getByRole('button', { name: /laporan/i }).count()) throw new Error('tombol laporan terlihat');
  });
  await ctx.close();
}

/* Peserta lain: tidak melihat data peserta pertama */
{
  const { ctx, page } = await as('siswa2');
  await step('peserta lain tidak melihat sesi, materi, atau nilai orang lain', page, async () => {
    await page.getByText('Belum ada sesi terjadwal').waitFor({ timeout: 20000 });
    await page.goto(base + '/materi');
    await page.getByText('Belum ada materi').waitFor();
    await page.goto(sessionUrl);
    await page.waitForURL(/\/jadwal/);
  });
  await ctx.close();
}

/* Akun tanpa profil */
{
  const { ctx, page } = await as('asing');
  await step('akun yang belum didaftarkan admin ditolak', page, async () => { await page.getByRole('heading', { name: 'Akun belum terdaftar' }).waitFor({ timeout: 20000 }); });
  await ctx.close();
}

/* Admin: dasbor terisi, detail peserta, ponsel */
{
  const { ctx, page } = await as('admin');
  await step('dasbor admin dan detail peserta menampilkan progres', page, async () => {
    await page.getByRole('heading', { name: 'Dasbor admin' }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    await shot(page, '09-admin-dasbor');
    await page.goto(base + '/peserta');
    await page.getByTestId('person-row').filter({ hasText: 'Siswa Uji' }).getByText('+45').waitFor();
    await shot(page, '10-admin-peserta');
    await page.getByTestId('person-row').filter({ hasText: 'Siswa Uji' }).click();
    await page.locator('svg.chart').waitFor();
    await page.waitForTimeout(700);
    await shot(page, '11-admin-detail-peserta');
    await page.goto(base + '/jadwal'); await page.getByTestId('session-row').first().waitFor(); await shot(page, '12-admin-jadwal');
    await page.goto(base + '/pengaturan'); await page.getByRole('heading', { name: 'Google Calendar' }).waitFor(); await page.waitForTimeout(1200); await shot(page, '13-admin-pengaturan');
  });
  await ctx.close();
  const m = await as('siswa', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await step('tampilan ponsel tanpa geser mendatar', m.page, async () => {
    await m.page.getByRole('heading', { name: 'Sesi berikutnya' }).waitFor({ timeout: 20000 });
    await m.page.waitForTimeout(800);
    await m.page.screenshot({ path: 'e2e/screenshots/14-ponsel-beranda.png' });
    for (const p of ['/beranda', '/progres', '/jadwal', '/materi']) {
      await m.page.goto(base + p); await m.page.waitForTimeout(600);
      const w = await m.page.evaluate(() => document.documentElement.scrollWidth);
      if (w > 392) throw new Error(`${p} melebar ${w}px`);
    }
    await m.page.getByRole('button', { name: 'Menu' }).click();
    await m.page.waitForTimeout(300);
    await m.page.screenshot({ path: 'e2e/screenshots/15-ponsel-menu.png' });
  });
  await m.ctx.close();
}

await browser.close();
for (const [s, n] of results) console.log(s.padEnd(5), n);
const uniq = [...new Set(errors)];
if (uniq.length) { console.log('\nGalat browser:'); uniq.slice(0, 8).forEach((e) => console.log(' -', e.slice(0, 260))); }
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} lolos`);
process.exit(failed || uniq.length ? 1 : 0);
