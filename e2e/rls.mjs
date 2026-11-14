/**
 * Uji keamanan langsung ke API (tanpa browser) dengan token tiap peran uji.
 * Pakai: E2E_PASSWORD=... node e2e/rls.mjs
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
const get = (h, path) => fetch(`${U}/rest/v1/${path}`, { headers: h }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const post = (h, path, body, extra = {}) => fetch(`${U}/rest/v1/${path}`, { method: 'POST', headers: { ...h, ...extra }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const patch = (h, path, body) => fetch(`${U}/rest/v1/${path}`, { method: 'PATCH', headers: { ...h, prefer: 'return=representation' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const results = [];
const check = (name, ok, info = '') => results.push([ok ? 'PASS' : 'FAIL', name + (ok ? '' : ` (${info})`)]);

const s1 = await login('siswa'), s2 = await login('siswa2'), mentor = await login('mentor');
const me1 = (await post(s1, 'rpc/academie_ensure_profile', {})).body;
const me2 = (await post(s2, 'rpc/academie_ensure_profile', {})).body;
const mm = (await post(mentor, 'rpc/academie_ensure_profile', {})).body;
const sti = (await get(anon, 'academie_courses?code_key=eq.STI1&select=id')).body[0].id;

// Tamu tanpa login
let r = await get(anon, 'academie_profiles?select=email');
check('tamu tidak bisa membaca profil', r.status === 200 && r.body.length === 0, JSON.stringify(r.body).slice(0, 80));
r = await get(anon, 'academie_settings?select=bank_account');
check('tamu tidak bisa membaca pengaturan', r.status === 200 && r.body.length === 0, r.status);
r = await post(anon, 'rpc/academie_public_info', {});
check('tamu bisa membaca info publik (WA admin, harga)', r.status === 200 && r.body.admin_whatsapp === '+6285967072383', JSON.stringify(r.body));
r = await post(anon, 'rpc/academie_book', { p_mentor: mm.id, p_course: sti, p_topic: null, p_starts_at: new Date(Date.now() + 3 * 864e5).toISOString(), p_mode: 'private' });
check('tamu tidak bisa booking', r.status === 401 || r.status === 403 || r.status === 404, r.status);

// Peserta
r = await get(s1, 'academie_profiles?select=email,role');
check('peserta hanya melihat dirinya dan mentornya', r.body.every((p) => p.email === me1.email || p.role !== 'student'), JSON.stringify(r.body.map((p) => p.email)));
r = await get(s1, `academie_session_students?student_id=eq.${me2.id}&select=session_id`);
check('peserta tidak melihat kursi peserta lain di sesi berbeda', r.body.length === 0, r.body.length);
r = await get(s1, 'academie_google_accounts?select=*');
check('token Google tidak terbaca', r.status !== 200 || r.body.length === 0, r.status);
r = await get(s1, 'academie_availability_rules?select=id');
check('peserta tidak melihat pola mentor langsung', r.body.length === 0, r.body.length);
r = await post(s1, 'academie_sessions', { code: 'HACK-1', course_id: sti, mentor_id: mm.id, starts_at: new Date(Date.now() + 5 * 864e5).toISOString(), ends_at: new Date(Date.now() + 5 * 864e5 + 36e5).toISOString(), mode: 'private' });
check('peserta tidak bisa membuat sesi langsung', r.status >= 400, r.status);
r = await post(s1, 'academie_credits', { student_id: me1.id, reason: 'gratis' });
check('peserta tidak bisa memberi diri kredit', r.status >= 400, r.status);
r = await patch(s1, `academie_session_students?student_id=eq.${me1.id}`, { payment_status: 'paid' });
check('peserta tidak bisa menandai dirinya lunas', r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0), JSON.stringify(r.body).slice(0, 80));
r = await patch(s1, `academie_profiles?id=eq.${me1.id}`, { role: 'admin' });
check('peserta tidak bisa menjadi admin', r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0), JSON.stringify(r.body).slice(0, 80));
r = await post(s1, 'rpc/academie_book', { p_mentor: mm.id, p_course: sti, p_topic: null, p_starts_at: new Date(Date.now() + 2 * 36e5).toISOString(), p_mode: 'private' });
check('booking kurang dari 24 jam ditolak', r.status >= 400 && /24 jam/.test(JSON.stringify(r.body)), JSON.stringify(r.body).slice(0, 100));
const kal = (await get(anon, 'academie_courses?code_key=eq.KAL2&select=id')).body[0].id;
r = await post(s1, 'rpc/academie_booking_options', { p_course: kal });
check('peserta tidak melihat mentor mata kuliah yang tidak diambil', r.status >= 400, r.status);
r = await post(s1, 'rpc/academie_confirm_payment', { p_session: '00000000-0000-0000-0000-000000000000', p_student: me1.id });
check('peserta tidak bisa konfirmasi pembayaran', r.status >= 400 && /admin/i.test(JSON.stringify(r.body)), JSON.stringify(r.body).slice(0, 80));
r = await post(s1, 'rpc/academie__book', { p_student: me2.id, p_mentor: mm.id, p_course: sti, p_topic: null, p_starts_at: new Date(Date.now() + 3 * 864e5).toISOString(), p_mode: 'private', p_open: false });
check('fungsi internal tidak bisa dipanggil lewat API', r.status >= 400, r.status);
r = await post(s1, 'rpc/academie_submit_payment', { p_session: '00000000-0000-0000-0000-000000000000', p_proof_path: `${me2.id}/x.png` });
check('bukti bayar harus dari folder sendiri', r.status >= 400, r.status);
const up = await fetch(`${U}/storage/v1/object/academie-proofs/${me2.id}/hack.png`, { method: 'POST', headers: { apikey: K, authorization: s1.authorization, 'content-type': 'image/png' }, body: Buffer.from('x') });
check('peserta tidak bisa upload ke folder peserta lain', up.status >= 400, up.status);
const list = await fetch(`${U}/storage/v1/object/list/academie-proofs`, { method: 'POST', headers: { apikey: K, authorization: s1.authorization, 'content-type': 'application/json' }, body: JSON.stringify({ prefix: me2.id }) }).then((r) => r.json());
check('peserta tidak bisa melihat bukti bayar peserta lain', Array.isArray(list) && list.length === 0, JSON.stringify(list).slice(0, 80));

// Mentor
r = await get(mentor, 'academie_settings?select=price_private');
check('mentor bisa membaca pengaturan', r.body.length === 1, r.body.length);
r = await post(mentor, 'academie_mentor_courses', { mentor_id: mm.id, course_id: kal, status: 'approved' });
check('mentor tidak bisa menyetujui kompetensinya sendiri', r.status >= 400, r.status);
r = await post(mentor, 'academie_materials', { course_id: sti, title: 'Langsung tayang', url: 'https://example.com', created_by: mm.id, status: 'approved' });
check('bahan mentor tidak bisa langsung tayang', r.status >= 400, r.status);
r = await get(mentor, 'academie_payouts?select=mentor_id');
check('mentor hanya melihat transfernya sendiri', r.body.every((p) => p.mentor_id === mm.id), r.body.length);
r = await post(mentor, 'academie_availability_rules', { mentor_id: me1.id, weekday: 1, start_time: '10:00', end_time: '11:00' });
check('mentor tidak bisa menulis jam atas nama orang lain', r.status >= 400, r.status);

for (const [s, n] of results) console.log(s, n);
console.log(`\n${results.filter((x) => x[0] === 'PASS').length}/${results.length} lolos`);
process.exit(results.some((x) => x[0] === 'FAIL') ? 1 : 0);
