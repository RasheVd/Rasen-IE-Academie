/**
 * Uji fitur v3: booking mata kuliah tanpa topik, kalender (Hari/Minggu/Bulan, pintasan, popover, buka slot),
 * ruang kerja (tugas, to-do, atur kotak), link tes oleh mentor, kepadatan tampilan, pratinjau warna admin.
 * Akun uji: e2e-admin, e2e-mentor (mengajar OTIN, jam Sen–Jum 09–12), e2e-siswa (OTIN). Kata sandi di E2E_PASSWORD.
 * Pakai: node e2e/v3.mjs <baseUrl>
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:4173';
const PASS = process.env.E2E_PASSWORD;
if (!PASS) { console.error('Set E2E_PASSWORD'); process.exit(2); }
mkdirSync('e2e/screenshots', { recursive: true });
const browser = await chromium.launch();
const results = [], errors = [];
const step = async (name, page, fn) => {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', `${name}: ${e.message.split('\n')[0]}`]); await page?.screenshot({ path: `e2e/screenshots/FAIL-v3-${name.replace(/\W+/g, '_').slice(0, 40)}.png` }).catch(() => {}); }
};
async function as(who, vp = { width: 1360, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  await page.goto(base + '/masuk');
  await page.getByLabel('Email').fill(`e2e-${who}@example.com`);
  await page.getByLabel('Kata sandi').fill(PASS);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.locator('.side').waitFor({ timeout: 20000 });
  return { ctx, page };
}
const toast = (page, re) => page.locator('.toast').filter({ hasText: re }).first().waitFor({ timeout: 15000 });
let sessionId = '';

{
  const { ctx, page } = await as('siswa');
  await step('booking mata kuliah tanpa daftar topik', page, async () => {
    await page.goto(base + '/booking');
    await page.getByText('Semester 5').first().waitFor();
    await page.getByLabel('Topik yang mau dipelajari').waitFor();
    if (await page.getByLabel('Topik yang mau dipelajari').inputValue() !== 'Dibahas bersama mentor') throw new Error('topik tidak opsional');
    await page.locator('.slot').first().click();
    await page.getByRole('dialog').getByRole('button', { name: /Booking/ }).click();
    await page.waitForURL(/\/sesi\//, { timeout: 20000 });
    sessionId = page.url().split('/sesi/')[1].split('?')[0];
  });
  await step('kalender peserta: tampilan bulan, minggu, pintasan, popover', page, async () => {
    await page.goto(base + '/jadwal');
    await page.locator('.gc-main').waitFor();
    await page.keyboard.press('m');
    await page.locator('.gc-month').waitFor();
    let tries = 0;
    while (!(await page.locator('.gc-chip').count()) && tries++ < 3) await page.keyboard.press('j');
    await page.locator('.gc-chip').first().click();
    await page.locator('.gc-pop').getByText('Menunggu pembayaran').or(page.locator('.gc-pop').getByText('Belum dibayar')).first().waitFor();
    await page.screenshot({ path: 'e2e/screenshots/v3-01-kalender-bulan-peserta.png' });
    await page.keyboard.press('Escape');
    await page.keyboard.press('w');
    await page.locator('.gc-time').waitFor();
    await page.keyboard.press('t');
    await page.locator('.gc-dayhead.today').waitFor();
    await page.locator('.gc-now').waitFor();
  });
  await step('ruang kerja peserta: tugas bayar dan to-do', page, async () => {
    await page.goto(base + '/ruang-kerja');
    await page.getByText(/Upload bukti bayar/).first().waitFor();
    await page.getByLabel('To-do baru').fill('Kerjakan latihan PLC bab 2');
    await page.getByRole('button', { name: 'Tambah' }).click();
    await page.getByText('Kerjakan latihan PLC bab 2').waitFor();
    await page.getByLabel('Tandai Kerjakan latihan PLC bab 2').click();
    await page.getByRole('button', { name: /Lihat \d+ selesai/ }).waitFor();
    await page.getByRole('button', { name: 'Atur ruang kerja' }).click();
    await page.getByRole('button', { name: 'Turunkan Tugas' }).click();
    await page.waitForTimeout(500);
    const first = await page.locator('.ws-grid .card .h-card').first().innerText();
    if (!/To-do/.test(first)) throw new Error('urutan tidak berubah: ' + first);
    // Kembalikan Tugas ke paling atas.
    for (let i = 0; i < 4 && await page.getByRole('button', { name: 'Naikkan Tugas' }).isEnabled(); i++) { await page.getByRole('button', { name: 'Naikkan Tugas' }).click(); await page.waitForTimeout(300); }
    await page.getByRole('button', { name: 'Selesai mengatur' }).click();
    await page.screenshot({ path: 'e2e/screenshots/v3-02-ruang-kerja-peserta.png', fullPage: true });
  });
  await step('kepadatan tampilan padat', page, async () => {
    await page.goto(base + '/pengaturan');
    await page.getByRole('group', { name: 'Kepadatan tampilan' }).getByRole('button', { name: 'Padat' }).click();
    await page.waitForFunction(() => document.body.classList.contains('dense'));
    await page.getByRole('group', { name: 'Kepadatan tampilan' }).getByRole('button', { name: 'Nyaman' }).click();
  });
  await ctx.close();
}

{
  const { ctx, page } = await as('mentor');
  await step('kalender mentor: jam tersedia, libur, buka slot dari kalender', page, async () => {
    await page.goto(base + '/jadwal');
    await page.locator('.gc-time').waitFor();
    if (!(await page.locator('.gc-block.free').count())) throw new Error('jam tersedia tidak tampil');
    await page.screenshot({ path: 'e2e/screenshots/v3-03-kalender-minggu-mentor.png' });
    // Klik jam kosong di kolom Sabtu (kolom ke-6), mulai 13.00; lewati jam yang sudah dibuka.
    const col = page.locator('.gc-col').nth(5);
    await page.locator('.gc-scroll').evaluate((el) => el.scrollTo({ top: 7 * 48 }));
    let opened = false;
    for (let h = 13; h <= 21 && !opened; h++) {
      const b = await col.boundingBox();
      await page.mouse.click(b.x + b.width / 2, b.y + (h - 6) * 48 + 20);
      opened = await page.getByRole('dialog').getByRole('button', { name: 'Buka slot' }).isVisible({ timeout: 800 }).catch(() => false);
    }
    if (!opened) throw new Error('tidak ada jam kosong yang bisa dibuka');
    await page.getByRole('dialog').getByRole('button', { name: 'Buka slot' }).click();
    await toast(page, /Slot dibuka/);
  });
  await step('mentor mengisi link pretest dan posttest', page, async () => {
    await page.goto(base + '/sesi/' + sessionId);
    await page.getByLabel(/^Pretest \(menit/).fill('https://forms.gle/pretest-contoh');
    await page.getByLabel(/^Posttest \(menit/).fill('https://forms.gle/posttest-contoh');
    await page.getByRole('button', { name: 'Simpan link tes' }).click();
    await toast(page, /Link tes tersimpan/);
    await page.getByRole('link', { name: 'Pretest' }).first().waitFor();
  });
  await step('ruang kerja mentor', page, async () => {
    await page.goto(base + '/ruang-kerja');
    await page.getByText(/Hak bulan ini/).waitFor();
    await page.screenshot({ path: 'e2e/screenshots/v3-04-ruang-kerja-mentor.png', fullPage: true });
  });
  await ctx.close();
}

{
  const { ctx, page } = await as('admin');
  await step('admin: pratinjau warna tanpa menyimpan, katalog per semester', page, async () => {
    await page.goto(base + '/pengaturan/bisnis');
    const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim());
    await page.getByRole('radio', { name: /Teal/ }).click();
    await page.waitForFunction((b) => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() !== b, before);
    await page.screenshot({ path: 'e2e/screenshots/v3-05-pengaturan-tampilan.png', fullPage: true });
    await page.goto(base + '/katalog');
    const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim());
    if (after !== before) throw new Error('warna tidak kembali setelah keluar tanpa simpan');
    await page.getByText(/Semester 3 · 8/).waitFor();
    await page.getByText(/Pilihan · 16/).waitFor();
  });
  await ctx.close();
}

{
  const { ctx, page } = await as('siswa', { width: 390, height: 844 });
  await step('kalender di HP: tampilan hari, tanpa gulir horizontal', page, async () => {
    await page.goto(base + '/jadwal');
    await page.locator('.gc-main').waitFor();
    const ow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (ow > 1) throw new Error('gulir horizontal ' + ow);
    await page.screenshot({ path: 'e2e/screenshots/v3-06-kalender-hp.png' });
  });
  await ctx.close();
}

await browser.close();
for (const [s, n] of results) console.log(s, n);
if (errors.length) console.log('\nGalat:\n' + [...new Set(errors)].join('\n'));
console.log(`\n${results.filter((r) => r[0] === 'PASS').length}/${results.length} lolos`);
process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
