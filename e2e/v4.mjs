/**
 * Uji v4 di browser: mentor membuka jam kelas bersama (terbuka, tempat via WA, berlaku sampai tanggal),
 * peserta melihat harga dan jenis di tiap jam, kursi "sisa 1" lalu "PENUH" tetap tampil merah,
 * mentor mengganti tempat dari kalender dan memakai tampilan Tabel + unduh CSV,
 * Kelasku peserta (sesi hari ini, pretest, posttest, materi), admin hanya melihat jam mentor,
 * Pusat data (kesehatan, ubah data, riwayat + kembalikan, log galat, cadangan).
 * Akun: e2e-admin, e2e-mentor (OTIN), e2e-siswa … e2e-siswa6 (OTIN). Pakai: E2E_PASSWORD=… node e2e/v4.mjs <baseUrl>
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:4173';
const PASS = process.env.E2E_PASSWORD;
if (!PASS) { console.error('Set E2E_PASSWORD'); process.exit(2); }
mkdirSync('e2e/screenshots', { recursive: true });
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const U = env.VITE_SUPABASE_URL, K = env.VITE_SUPABASE_ANON_KEY;
const token = async (who) => {
  const r = await fetch(`${U}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: K, 'content-type': 'application/json' }, body: JSON.stringify({ email: `e2e-${who}@example.com`, password: PASS }) }).then((r) => r.json());
  return { apikey: K, authorization: `Bearer ${r.access_token}`, 'content-type': 'application/json' };
};
const rpc = (h, fn, body) => fetch(`${U}/rest/v1/rpc/${fn}`, { method: 'POST', headers: h, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const rest = (h, path) => fetch(`${U}/rest/v1/${path}`, { headers: h }).then((r) => r.json());

const browser = await chromium.launch();
const results = [], errors = [];
const step = async (name, page, fn) => {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', `${name}: ${e.message.split('\n')[0]}`]); await page?.screenshot({ path: `e2e/screenshots/FAIL-v4-${name.replace(/\W+/g, '_').slice(0, 40)}.png` }).catch(() => {}); }
};
async function as(who, vp = { width: 1360, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  await page.goto(base + '/masuk');
  await page.getByLabel('Email').fill(`e2e-${who}@example.com`);
  await page.getByLabel('Kata sandi').fill(PASS);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.locator('.side').waitFor({ timeout: 25000 });
  return { ctx, page };
}
const go = async (page, path) => { await page.goto(base + path); await page.locator('.side').waitFor({ timeout: 25000 }); await page.waitForTimeout(600); };
const toast = (page, re) => page.locator('.toast').filter({ hasText: re }).first().waitFor({ timeout: 15000 });

// Sabtu berikutnya (paling cepat 3 hari lagi) pukul 15.00 WIB.
const wib = (t = Date.now()) => new Date(t + 7 * 3600e3);
const ymd = (d) => d.toISOString().slice(0, 10);
let sat; for (let i = 3; i < 11; i++) { const d = wib(Date.now() + i * 864e5); if (d.getUTCDay() === 6) { sat = ymd(d); break; } }
const until = ymd(wib(Date.now() + 40 * 864e5));
const satStart = new Date(`${sat}T15:00:00+07:00`).toISOString();
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const satLabel = `Sabtu, ${Number(sat.slice(8))} ${MONTHS[Number(sat.slice(5, 7)) - 1]}`;
let sessionId = '', sessionCode = '';

/* ── Mentor membuka jam ─────────────────────────────────── */
{
  const { ctx, page } = await as('mentor');
  await step('mentor membuka jam kelas bersama terbuka, tempat via WA, berlaku sampai tanggal', page, async () => {
    await go(page, '/ketersediaan');
    await page.locator('.wr').filter({ has: page.locator('.day', { hasText: 'Sabtu' }) }).getByRole('button', { name: 'Jam' }).click();
    const dlg = page.getByRole('dialog', { name: 'Buka jam mengajar' });
    await dlg.getByLabel('Mulai', { exact: true }).selectOption(String(15 * 60));
    await dlg.getByLabel('Selesai', { exact: true }).selectOption(String(16 * 60));
    if (await dlg.getByRole('button', { name: 'Simpan' }).isEnabled()) throw new Error('Simpan aktif sebelum jenis kelas dipilih');
    await dlg.getByRole('button', { name: /Kelas bersama saja/ }).click();
    await dlg.getByRole('button', { name: /^Terbuka/ }).click();
    await dlg.getByRole('group', { name: 'Jenis tempat' }).getByRole('button', { name: 'Bahas lewat WA' }).click();
    await dlg.getByLabel('Sampai').fill(until);
    await page.screenshot({ path: 'e2e/screenshots/v4-01-form-jam-mentor.png' });
    await dlg.getByRole('button', { name: 'Simpan' }).click();
    await toast(page, /Jam tersimpan/);
    const chip = page.locator('.rule-chip').filter({ hasText: '15.00–16.00' });
    await chip.filter({ hasText: /Kelas bersama saja · bersama terbuka · tempat via WA · s\.d\./ }).waitFor();
  });
  await ctx.close();
}

/* ── Peserta membuka kelas bersama; kursi terisi ────────── */
{
  const { ctx, page } = await as('siswa');
  await step('peserta melihat harga dan jenis di tiap jam, lalu membuka kelas bersama', page, async () => {
    await go(page, '/booking');
    await page.getByRole('button', { name: /Kelas bersama · Rp40\.000\/orang/ }).click();
    await page.locator(`.day-btn[aria-label^="${satLabel}"]`).click();
    const slot = page.locator('button.slot').filter({ hasText: '15.00–16.00' });
    await slot.filter({ hasText: /Buka kelas · Rp40\.000\/orang · terbuka/ }).waitFor();
    await slot.filter({ hasText: 'Tempat via WA' }).waitFor();
    await page.screenshot({ path: 'e2e/screenshots/v4-02-booking-label.png' });
    await slot.click();
    const dlg = page.getByRole('dialog', { name: 'Konfirmasi booking' });
    await dlg.getByText('(terbuka untuk peserta lain)').waitFor();
    await dlg.getByText('Tempat dibahas lewat WhatsApp').waitFor();
    await dlg.getByText('Rp40.000 per orang').waitFor();
    await dlg.getByRole('button', { name: /Booking dan tahan slot/ }).click();
    await page.waitForURL(/\/sesi\//, { timeout: 20000 });
    sessionId = page.url().split('/sesi/')[1].split('?')[0];
    sessionCode = (await page.locator('.code').first().textContent()).trim();
  });
  await step('halaman sesi: tombol WhatsApp ke mentor untuk menyepakati tempat', page, async () => {
    await page.getByText('Tempat dibahas lewat WhatsApp').first().waitFor();
    const href = await page.locator('a.btn.wa').filter({ hasText: /Chat/ }).first().getAttribute('href');
    if (!/wa\.me\/62/.test(href ?? '')) throw new Error('tautan WA mentor salah: ' + href);
  });
  await ctx.close();
}
// Tiga peserta lain bergabung lewat API (cepat), lalu peserta kelima lewat browser.
const sess = sessionId ? (await rest(await token('admin'), 'academie_sessions?select=mentor_id,course_id&id=eq.' + sessionId))[0] : null;
for (const who of sess ? ['siswa2', 'siswa3', 'siswa4'] : []) {
  const h = await token(who);
  await rpc(h, 'academie_ensure_profile', {});
  const r = await rpc(h, 'academie_book', { p_mentor: sess.mentor_id, p_course: sess.course_id, p_topic: null, p_starts_at: satStart, p_mode: 'group', p_open: true });
  if (r.status !== 200) results.push(['FAIL', `${who} bergabung: ${JSON.stringify(r.body)}`]);
}
{
  const { ctx, page } = await as('siswa5');
  await step('kelas 4/5: peserta melihat peringatan "sisa 1 kursi" lalu bergabung', page, async () => {
    await go(page, '/booking');
    await page.getByRole('button', { name: /Kelas bersama · Rp40\.000\/orang/ }).click();
    await page.locator(`.day-btn[aria-label^="${satLabel}"]`).click();
    const slot = page.locator('button.slot.join.warn').filter({ hasText: '15.00–16.00' });
    await slot.filter({ hasText: '4/5 · sisa 1 kursi' }).waitFor();
    await page.screenshot({ path: 'e2e/screenshots/v4-03-sisa-1-kursi.png' });
    await slot.click();
    await page.getByRole('dialog', { name: 'Konfirmasi booking' }).getByText('kamu orang ke-5 dari 5').waitFor();
    await page.getByRole('dialog', { name: 'Konfirmasi booking' }).getByRole('button', { name: /Booking dan tahan slot/ }).click();
    await page.waitForURL(/\/sesi\//, { timeout: 20000 });
  });
  await ctx.close();
}
{
  const { ctx, page } = await as('siswa6');
  await step('kelas penuh tidak hilang: tampil merah "PENUH 5/5" dan tidak bisa diklik', page, async () => {
    await go(page, '/booking');
    await page.getByRole('button', { name: /Kelas bersama · Rp40\.000\/orang/ }).click();
    await page.locator(`.day-btn[aria-label^="${satLabel}"]`).click();
    const full = page.locator('.slot.full').filter({ hasText: '15.00–16.00' });
    await full.filter({ hasText: 'PENUH 5/5' }).waitFor();
    if (await page.locator('button.slot').filter({ hasText: '15.00–16.00' }).count()) throw new Error('slot penuh masih bisa diklik');
    await page.screenshot({ path: 'e2e/screenshots/v4-04-penuh.png' });
  });
  await ctx.close();
}

/* ── Mentor: kalender, tempat, tabel ────────────────────── */
{
  const { ctx, page } = await as('mentor');
  await step('kalender mentor: tanda PENUH di acara, ganti tempat dari popover', page, async () => {
    await go(page, '/jadwal');
    await page.locator('.gc-main').waitFor();
    await page.keyboard.press('w');
    for (let i = 0; i < 3 && !(await page.locator('.gc-ev .gc-badge.bad').count()); i++) { await page.keyboard.press('j'); await page.waitForTimeout(300); }
    const ev = page.locator('.gc-ev').filter({ has: page.locator('.gc-badge.bad') }).first();
    await ev.locator('.gc-badge.bad', { hasText: 'PENUH' }).waitFor();
    await page.screenshot({ path: 'e2e/screenshots/v4-05-kalender-penuh.png' });
    await ev.click();
    const pop = page.locator('.gc-pop');
    await pop.getByText('Ubah tempat').click();
    await pop.getByRole('button', { name: 'Tatap muka' }).click();
    await pop.getByLabel('Lokasi tatap muka').fill('Perpustakaan ITS lantai 2');
    await pop.getByRole('button', { name: 'Simpan tempat' }).click();
    await toast(page, /Tempat tersimpan/);
  });
  await step('tampilan Tabel: baris sesi, kursi penuh, unduh CSV', page, async () => {
    await page.getByRole('group', { name: 'Tampilan' }).getByRole('button', { name: 'Tabel' }).click();
    const row = page.locator('.sheet tbody tr').filter({ hasText: sessionCode });
    await row.waitFor();
    await row.locator('.seat.bad', { hasText: 'Penuh 5/5' }).waitFor();
    await row.getByText('Tatap muka: Perpustakaan ITS lantai 2').waitFor();
    await page.screenshot({ path: 'e2e/screenshots/v4-06-tabel.png' });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Unduh CSV/ }).click()]);
    const text = readFileSync(await dl.path(), 'utf8');
    if (!text.includes('Kode,Tanggal') || !text.includes(sessionCode)) throw new Error('isi CSV salah');
    await page.getByRole('group', { name: 'Tampilan' }).getByRole('button', { name: 'Minggu' }).click();
  });
  await ctx.close();
}

/* ── Peserta: Kelasku ───────────────────────────────────── */
{
  const { ctx, page } = await as('siswa');
  await step('halaman sesi peserta menampilkan tempat baru', page, async () => {
    await go(page, `/sesi/${sessionId}`);
    await page.getByText('Perpustakaan ITS lantai 2').first().waitFor();
  });
  await step('Kelasku: sesi hari ini dengan tombol pretest, posttest, dan materi', page, async () => {
    await go(page, '/kelas');
    const card = page.locator('.class-card').filter({ hasText: 'Otomasi Industri' });
    await card.getByText('1 sesi hari ini').waitFor();
    await page.screenshot({ path: 'e2e/screenshots/v4-07-kelasku.png' });
    await card.click();
    await page.getByRole('heading', { name: /Hari ini/ }).waitFor();
    const pre = await page.getByRole('link', { name: 'Kerjakan pretest' }).getAttribute('href');
    const post = await page.getByRole('link', { name: 'Kerjakan posttest' }).getAttribute('href');
    if (pre !== 'https://forms.gle/e2e-pre' || post !== 'https://forms.gle/e2e-post') throw new Error(`link tes salah: ${pre} ${post}`);
    await page.getByText('Materi uji Kelasku').waitFor();
    await page.screenshot({ path: 'e2e/screenshots/v4-08-ruang-kelas.png', fullPage: true });
  });
  await step('Kelasku di HP tanpa gulir samping', page, async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    const ow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (ow > 0) throw new Error('gulir samping ' + ow);
    await page.screenshot({ path: 'e2e/screenshots/v4-09-kelasku-hp.png', fullPage: true });
  });
  await ctx.close();
}

/* ── Admin ──────────────────────────────────────────────── */
{
  const { ctx, page } = await as('admin');
  await step('admin melihat jam mentor tanpa tombol ubah', page, async () => {
    await go(page, '/ketersediaan');
    await page.locator('.rule-chip').filter({ hasText: '15.00–16.00' }).waitFor();
    if (await page.getByRole('button', { name: 'Jam', exact: true }).count()) throw new Error('admin masih bisa menambah jam');
    if (await page.locator('.rule-chip button').count()) throw new Error('admin masih bisa mengubah jam');
  });
  await step('kalender induk: peringatan kursi dan tampilan Tabel', page, async () => {
    await go(page, '/kalender');
    await page.getByRole('group', { name: 'Tampilan' }).getByRole('button', { name: 'Tabel' }).click();
    await page.locator('.sheet tbody tr').filter({ hasText: sessionCode }).locator('.seat.bad').waitFor();
  });
  await step('Pusat data: kesehatan dan integrasi', page, async () => {
    await go(page, '/data');
    await page.getByText('Jadwal otomatis').waitFor();
    await page.getByText('Lepas slot yang tidak dibayar (tiap 10 menit)').waitFor();
    await page.locator('.issue, .card').filter({ hasText: /Galat di browser pengguna|Tidak ada masalah/ }).first().waitFor();
    await page.screenshot({ path: 'e2e/screenshots/v4-10-pusat-data.png', fullPage: true });
  });
  await step('Pusat data: ubah laporan sesi, lalu kembalikan dari riwayat', page, async () => {
    await go(page, '/data?tab=data&t=sessions');
    await page.getByLabel('Cari', { exact: true }).fill(sessionCode);
    await page.locator('.sheet tbody tr').filter({ hasText: sessionCode }).getByRole('button', { name: 'Buka' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Laporan', { exact: true }).fill('Dibetulkan admin saat uji');
    await dlg.getByRole('button', { name: /Simpan \(1 kolom\)/ }).click();
    await toast(page, /tercatat di riwayat/);
    await go(page, '/data?tab=riwayat');
    const item = page.locator('.list-item.audit').filter({ hasText: sessionCode }).filter({ hasText: 'Dibetulkan admin saat uji' }).first();
    await item.waitFor();
    await page.screenshot({ path: 'e2e/screenshots/v4-11-riwayat.png' });
    await item.getByRole('button', { name: 'Kembalikan' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Kembalikan' }).click();
    await toast(page, /dikembalikan/);
    const h = await token('admin');
    const r = await rest(h, `academie_sessions?id=eq.${sessionId}&select=report`);
    if (r[0].report !== '') throw new Error('laporan tidak kembali: ' + r[0].report);
  });
  await step('Pusat data: jam mentor hanya bisa dilihat', page, async () => {
    await go(page, '/data?tab=data&t=availability_rules');
    await page.locator('.sheet tbody tr').first().getByRole('button', { name: 'Lihat' }).click();
    if (await page.getByRole('dialog').getByRole('button', { name: /Simpan|Hapus/ }).count()) throw new Error('ada tombol ubah');
    await page.getByRole('dialog').getByRole('button', { name: 'Tutup', exact: true }).last().click();
  });
  await step('Pusat data: log galat dan tandai beres', page, async () => {
    await rpc(await token('siswa6'), 'academie_log_error', { p_path: '/kelas', p_message: 'Galat uji dari browser', p_detail: 'TypeError: x', p_ua: 'uji' });
    await go(page, '/data?tab=galat');
    await page.getByText('Galat uji dari browser').first().waitFor();
    await page.getByRole('button', { name: 'Tandai semua beres' }).click();
    await toast(page, /beres/);
  });
  await step('Pusat data: unduh cadangan lengkap', page, async () => {
    await go(page, '/data?tab=cadangan');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Unduh cadangan/ }).click()]);
    const j = JSON.parse(readFileSync(await dl.path(), 'utf8'));
    if (!Array.isArray(j.data?.sessions) || !j.data.sessions.length) throw new Error('cadangan kosong');
  });
  await ctx.close();
}

await browser.close();
for (const [s, n] of results) console.log(s, n);
if (errors.length) console.log('\nGalat halaman:\n' + errors.join('\n'));
const fails = results.filter((x) => x[0] === 'FAIL').length;
console.log(`\n${results.length - fails}/${results.length} lolos`);
process.exit(fails || errors.length ? 1 : 0);
