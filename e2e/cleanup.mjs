// Hapus file bukti transfer milik akun uji (e2e-*@example.com) dari Storage, sebagai admin uji.
// Data tabel dan akun uji dihapus lewat SQL (lihat README bagian Pengujian).
// Pakai: E2E_PASSWORD=... node e2e/cleanup.mjs
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const U = env.VITE_SUPABASE_URL, K = env.VITE_SUPABASE_ANON_KEY;
const tok = await fetch(`${U}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: K, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'e2e-admin@example.com', password: process.env.E2E_PASSWORD }) }).then((r) => r.json());
if (!tok.access_token) { console.error('Gagal masuk sebagai admin uji'); process.exit(1); }
const H = { apikey: K, authorization: `Bearer ${tok.access_token}`, 'content-type': 'application/json' };
await fetch(`${U}/rest/v1/rpc/academie_ensure_profile`, { method: 'POST', headers: H, body: '{}' });
const people = await fetch(`${U}/rest/v1/academie_profiles?email=like.e2e-*@example.com&select=id`, { headers: H }).then((r) => r.json());
let removed = 0;
for (const { id } of people) {
  const files = await fetch(`${U}/storage/v1/object/list/academie-proofs`, { method: 'POST', headers: H, body: JSON.stringify({ prefix: id, limit: 1000 }) }).then((r) => r.json());
  if (!Array.isArray(files) || !files.length) continue;
  const res = await fetch(`${U}/storage/v1/object/academie-proofs`, { method: 'DELETE', headers: H, body: JSON.stringify({ prefixes: files.map((f) => `${id}/${f.name}`) }) }).then((r) => r.json());
  removed += Array.isArray(res) ? res.length : 0;
}
console.log('bukti transfer uji dihapus:', removed);
