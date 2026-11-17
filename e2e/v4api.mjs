/**
 * Uji aturan v4 langsung ke API dengan token tiap peran uji:
 * kelas bersama tertutup dari pola mentor, masa berlaku pola, jam mentor hanya dibaca admin,
 * ganti tempat sesi, cek kesehatan dan integrasi (admin saja), riwayat + kembalikan, log galat dengan batas.
 * Akun: e2e-admin, e2e-mentor (OTIN), e2e-siswa, e2e-siswa2 (OTIN). Pakai: E2E_PASSWORD=... node e2e/v4api.mjs
 */
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const U = env.VITE_SUPABASE_URL, K = env.VITE_SUPABASE_ANON_KEY;
const login = async (who) => {
  const r = await fetch(`${U}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: K, 'content-type': 'application/json' }, body: JSON.stringify({ email: `e2e-${who}@example.com`, password: process.env.E2E_PASSWORD }) }).then((r) => r.json());
  if (!r.access_token) throw new Error('login gagal ' + who);
  return { apikey: K, authorization: `Bearer ${r.access_token}`, 'content-type': 'application/json' };
};
const anon = { apikey: K, authorization: `Bearer ${K}`, 'content-type': 'application/json' };
const call = (method) => (h, path, body, extra = {}) => fetch(`${U}/rest/v1/${path}`, { method, headers: { ...h, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const get = (h, path) => call('GET')(h, path);
const post = call('POST'), del = call('DELETE');
const patch = (h, path, body) => call('PATCH')(h, path, body, { prefer: 'return=representation' });
const results = [];
const check = (name, ok, info = '') => results.push([ok ? 'PASS' : 'FAIL', name + (ok ? '' : ` (${typeof info === 'string' ? info : JSON.stringify(info)})`)]);
const msg = (r) => JSON.stringify(r.body ?? '').slice(0, 160);

// Tanggal WIB
const wib = (t = Date.now()) => new Date(t + 7 * 3600e3);
const ymd = (d) => d.toISOString().slice(0, 10);
const today = ymd(wib());
function nextWeekday(wd, minDays) { for (let i = minDays; i < minDays + 8; i++) { const d = wib(Date.now() + i * 864e5); if (d.getUTCDay() === wd) return ymd(d); } }
const at = (date, h) => new Date(`${date}T${String(h).padStart(2, '0')}:00:00+07:00`).toISOString();
const addDays = (date, n) => ymd(new Date(Date.parse(date + 'T00:00:00Z') + n * 864e5));

const admin = await login('admin'), mentor = await login('mentor'), s1 = await login('siswa'), s2 = await login('siswa2');
const mm = (await post(mentor, 'rpc/academie_ensure_profile', {})).body;
const me1 = (await post(s1, 'rpc/academie_ensure_profile', {})).body;
await post(s2, 'rpc/academie_ensure_profile', {});
await post(admin, 'rpc/academie_ensure_profile', {});
const otin = (await get(anon, 'academie_courses?code_key=eq.OTIN&select=id')).body[0].id;
const book = (h, starts, mode) => post(h, 'rpc/academie_book', { p_mentor: mm.id, p_course: otin, p_topic: null, p_starts_at: starts, p_mode: mode, p_open: true });

// 1. Pola kelas bersama tertutup, tatap muka, berlaku sampai hari Minggu pertama.
const sun = nextWeekday(0, 3);
let r = await post(mentor, 'academie_availability_rules', {
  mentor_id: mm.id, weekday: 0, start_time: '10:00', end_time: '11:00', modes: 'group', group_open: false, place_kind: 'offline', place: 'Perpustakaan ITS lt 2', valid_from: today, valid_until: sun,
}, { prefer: 'return=representation' });
check('mentor membuat pola kelas bersama tertutup dengan masa berlaku', r.status === 201, msg(r));
const ruleId = r.body?.[0]?.id;

r = await book(s1, at(sun, 10), 'group');
check('peserta membuka kelas bersama di pola itu', r.status === 200 && r.body?.session_id, msg(r));
const sid = r.body?.session_id;
r = await get(admin, `academie_sessions?id=eq.${sid}&select=is_open,place_kind,place,mode`);
check('sesi mewarisi status tertutup dan tempat dari pola mentor (bukan pilihan peserta)', r.body?.[0]?.is_open === false && r.body[0].place_kind === 'offline' && r.body[0].place === 'Perpustakaan ITS lt 2', msg(r));
r = await book(s2, at(sun, 10), 'group');
check('peserta lain ditolak masuk kelas bersama tertutup', r.status >= 400 && /tertutup/i.test(msg(r)), msg(r));
r = await book(s2, at(addDays(sun, 7), 10), 'group');
check('booking di luar masa berlaku pola ditolak', r.status >= 400 && /tidak membuka slot/i.test(msg(r)), msg(r));
r = await book(s2, at(sun, 10), 'private');
check('pola "kelas bersama saja" tidak bisa dibooking private', r.status >= 400, msg(r));

// 2. Jam mentor: admin hanya membaca.
r = await get(admin, `academie_availability_rules?mentor_id=eq.${mm.id}&select=id`);
check('admin bisa melihat jam mentor', r.status === 200 && r.body.length >= 1, msg(r));
r = await post(admin, 'academie_availability_rules', { mentor_id: mm.id, weekday: 6, start_time: '07:00', end_time: '08:00', modes: 'private' });
check('admin tidak bisa membuat jam untuk mentor', r.status === 403 || r.status === 401, msg(r));
r = await patch(admin, `academie_availability_rules?id=eq.${ruleId}`, { active: false });
check('admin tidak bisa mengubah jam mentor', Array.isArray(r.body) && r.body.length === 0, msg(r));
r = await post(admin, 'academie_availability_exceptions', { mentor_id: mm.id, starts_on: addDays(today, 30), ends_on: addDays(today, 30) });
check('admin tidak bisa membuat libur mentor', r.status === 403 || r.status === 401, msg(r));

// 3. Tempat sesi.
r = await post(s1, 'rpc/academie_set_session_place', { p_session: sid, p_kind: 'online', p_place: 'https://meet.google.com/abc' });
check('peserta tidak bisa mengubah tempat', r.status >= 400, msg(r));
r = await post(mentor, 'rpc/academie_set_session_place', { p_session: sid, p_kind: 'online', p_place: 'bukan-tautan' });
check('tautan online wajib https', r.status >= 400 && /https/.test(msg(r)), msg(r));
r = await post(mentor, 'rpc/academie_set_session_place', { p_session: sid, p_kind: 'diskusi', p_place: '' });
check('mentor sesi mengubah tempat jadi dibahas lewat WA', r.status === 200 || r.status === 204, msg(r));
r = await get(s1, `academie_notifications?select=title&title=like.*Tempat*`);
check('peserta diberi tahu perubahan tempat', r.body?.length >= 1, msg(r));

// 4. Kesehatan, integrasi, riwayat: admin saja.
for (const fn of ['academie_health', 'academie_integrations']) {
  r = await post(s1, `rpc/${fn}`, {});
  check(`peserta tidak bisa memanggil ${fn}`, r.status >= 400, msg(r));
  r = await post(mentor, `rpc/${fn}`, {});
  check(`mentor tidak bisa memanggil ${fn}`, r.status >= 400, msg(r));
}
r = await post(admin, 'rpc/academie_health', {});
check('admin membaca hasil cek kesehatan', r.status === 200 && Array.isArray(r.body), msg(r));
r = await post(admin, 'rpc/academie_integrations', {});
check('admin membaca ringkasan integrasi (jadwal otomatis, Google)', r.status === 200 && Array.isArray(r.body?.jobs) && r.body.jobs.length >= 2 && Array.isArray(r.body.google), msg(r));
r = await get(s1, 'academie_audit?select=id&limit=5');
check('peserta tidak bisa membaca riwayat perubahan', r.status === 200 && r.body.length === 0, msg(r));
r = await get(mentor, 'academie_error_log?select=id&limit=5');
check('mentor tidak bisa membaca log galat', r.status === 200 && r.body.length === 0, msg(r));

// Ubah lalu kembalikan
r = await patch(admin, `academie_sessions?id=eq.${sid}`, { report: 'catatan uji audit' });
check('admin membetulkan data sesi', r.body?.[0]?.report === 'catatan uji audit', msg(r));
r = await get(admin, `academie_audit?tbl=eq.academie_sessions&row_id=eq.${sid}&op=eq.UPDATE&order=id.desc&limit=1&select=id,actor,old,new`);
const auditId = r.body?.[0]?.id;
check('perubahan tercatat dengan nama pengubah dan nilai lama', auditId && r.body[0].actor && r.body[0].old.report === '' && r.body[0].new.report === 'catatan uji audit', msg(r));
r = await post(s1, 'rpc/academie_audit_restore', { p_id: auditId });
check('peserta tidak bisa mengembalikan perubahan', r.status >= 400, msg(r));
r = await post(admin, 'rpc/academie_audit_restore', { p_id: auditId });
r = await get(admin, `academie_sessions?id=eq.${sid}&select=report`);
check('admin mengembalikan perubahan ke nilai lama', r.body?.[0]?.report === '', msg(r));
r = await post(admin, 'rpc/academie_audit_restore', { p_id: auditId });
check('perubahan yang sama tidak bisa dikembalikan dua kali', r.status >= 400, msg(r));

// Hapus lalu kembalikan (materi)
r = await post(admin, 'academie_materials', { course_id: otin, title: 'Materi uji audit', kind: 'link', url: 'https://example.com/m', status: 'approved' }, { prefer: 'return=representation' });
const matId = r.body?.[0]?.id;
await del(admin, `academie_materials?id=eq.${matId}`);
r = await get(admin, `academie_audit?tbl=eq.academie_materials&row_id=eq.${matId}&op=eq.DELETE&select=id`);
await post(admin, 'rpc/academie_audit_restore', { p_id: r.body?.[0]?.id });
r = await get(admin, `academie_materials?id=eq.${matId}&select=title`);
check('baris yang terhapus bisa dikembalikan utuh', r.body?.[0]?.title === 'Materi uji audit', msg(r));
await del(admin, `academie_materials?id=eq.${matId}`);

// Pembaruan jam oleh sinkron Google tidak membanjiri riwayat
r = await get(admin, `academie_audit?tbl=eq.academie_sessions&row_id=eq.${sid}&select=id`);
const before = r.body.length;
await post(mentor, 'rpc/academie_set_session_tests', { p_session: sid, p_pretest: 'https://forms.gle/pre', p_posttest: '' });
r = await get(admin, `academie_audit?tbl=eq.academie_sessions&row_id=eq.${sid}&select=id`);
check('perubahan link tes tercatat sekali', r.body.length === before + 1, `${before} -> ${r.body.length}`);

// 5. Log galat dengan batas 30 per 10 menit
for (let i = 0; i < 33; i++) await post(s1, 'rpc/academie_log_error', { p_path: '/uji', p_message: `galat uji ${i}`, p_detail: 'stack', p_ua: 'node' });
r = await get(admin, `academie_error_log?profile_id=eq.${me1.id}&select=id`);
check('galat browser tercatat dan dibatasi 30 per 10 menit', r.body?.length === 30, r.body?.length);
r = await post(anon, 'rpc/academie_log_error', { p_path: '/x', p_message: 'tamu', p_detail: '', p_ua: '' });
check('tamu tanpa login tidak bisa mengirim galat', r.status >= 400, msg(r));

const fails = results.filter((x) => x[0] === 'FAIL');
for (const [s, n] of results) console.log(s, n);
console.log(`\n${results.length - fails.length}/${results.length} lolos`);
process.exit(fails.length ? 1 : 0);
