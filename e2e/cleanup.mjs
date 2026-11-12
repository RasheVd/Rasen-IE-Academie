// Hapus data uji (mata kuliah E2E101 beserta sesi, pendaftaran, materi) sebagai admin uji.
// Pakai: E2E_PASSWORD=... node e2e/cleanup.mjs [--profiles]
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const U = env.VITE_SUPABASE_URL, K = env.VITE_SUPABASE_ANON_KEY;
const tok = await fetch(`${U}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: K, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'e2e-admin@example.com', password: process.env.E2E_PASSWORD }) }).then((r) => r.json());
if (!tok.access_token) { console.error('Gagal masuk sebagai admin uji'); process.exit(1); }
const H = { apikey: K, authorization: `Bearer ${tok.access_token}`, prefer: 'return=representation' };
const del = async (path) => { const r = await fetch(`${U}/rest/v1/${path}`, { method: 'DELETE', headers: H }); const j = await r.json(); return Array.isArray(j) ? j.length : JSON.stringify(j); };
await fetch(`${U}/rest/v1/rpc/academie_ensure_profile`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: '{}' });
console.log('sesi dihapus:', await del('academie_sessions?code=like.E2E101-*'));
console.log('mata kuliah dihapus:', await del('academie_courses?code=eq.E2E101'));
if (process.argv.includes('--profiles')) console.log('profil uji dihapus:', await del('academie_profiles?email=like.e2e-*@example.com'));
