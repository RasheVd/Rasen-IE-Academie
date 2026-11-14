// IE.Academie · undangan akun (hanya admin)
// POST { email, full_name, role, phone?, note?, site }   undang orang baru
// POST { resend: profile_id, site }                       kirim ulang undangan
// POST { link: profile_id, site }                         buat tautan undangan untuk dikirim manual (WhatsApp)
//
// Email dikirim oleh Supabase Auth. Pastikan SMTP sendiri sudah diatur
// (Authentication → Emails → SMTP Settings); pengirim bawaan Supabase hanya
// mengirim ke anggota tim project. Bila email gagal, admin tetap mendapat
// tautan undangan untuk dikirim sendiri.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://academie.my.id,https://www.academie.my.id,https://ie-academie.vercel.app,http://localhost:5173')
  .split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const ROLE_LABEL: Record<string, string> = { student: 'Peserta', mentor: 'Mentor', admin: 'Admin' };

function siteFrom(v: unknown): string {
  try { const o = new URL(String(v)).origin; if (ORIGINS.includes(o)) return o; } catch { /* default */ }
  return ORIGINS[0];
}
const friendly = (m: string) => {
  if (/rate limit/i.test(m)) return 'Batas kirim email Supabase tercapai. Coba lagi nanti atau kirim tautan lewat WhatsApp.';
  if (/not authorized|email address .* not authorized|smtp|sending/i.test(m)) return 'Email belum bisa dikirim karena SMTP belum diatur di Supabase. Kirim tautan undangan lewat WhatsApp.';
  return m;
};

async function authUserByEmail(email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (hit || data.users.length < 200) return hit ?? null;
  }
  return null;
}

/** Kirim email undangan (orang baru) atau email atur-kata-sandi (sudah punya akun Auth). */
async function deliver(email: string, fullName: string, role: string, site: string) {
  const redirectTo = `${site}/undangan`;
  const existing = await authUserByEmail(email);
  const { error } = existing
    ? await admin.auth.resetPasswordForEmail(email, { redirectTo })
    : await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { full_name: fullName, role_label: ROLE_LABEL[role] ?? '' } });
  return error ? friendly(error.message) : null;
}

/**
 * Tautan sekali pakai untuk dikirim admin sendiri (WhatsApp). Tautan menuju langsung ke
 * `${site}/undangan?token_hash=…&type=…`, lalu halaman itu memverifikasi tokennya sendiri
 * (supabase.auth.verifyOtp). Jadi tautan tetap benar walau Site URL / Redirect URLs di
 * Supabase Auth belum diatur.
 */
async function manualLink(email: string, fullName: string, site: string) {
  const redirectTo = `${site}/undangan`;
  const existing = await authUserByEmail(email);
  const type = existing ? 'recovery' : 'invite';
  const { data, error } = existing
    ? await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })
    : await admin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo, data: { full_name: fullName } } });
  if (error) throw new Error(friendly(error.message));
  const hash = data.properties?.hashed_token;
  if (hash) return `${redirectTo}?token_hash=${encodeURIComponent(hash)}&type=${type}`;
  return data.properties?.action_link ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung' }, 405);
  try {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u } = await admin.auth.getUser(token);
    if (!u.user) return json({ error: 'Harus login' }, 401);
    const { data: me } = await admin.from('academie_profiles').select('id, role, active').eq('user_id', u.user.id).maybeSingle();
    if (!me?.active || me.role !== 'admin') return json({ error: 'Hanya admin yang bisa mengundang' }, 403);

    const body = await req.json().catch(() => ({}));
    const site = siteFrom(body.site);

    if (body.resend || body.link) {
      const { data: p } = await admin.from('academie_profiles').select('id, email, full_name, role, user_id').eq('id', body.resend ?? body.link).maybeSingle();
      if (!p) return json({ error: 'Orang tidak ditemukan' }, 404);
      if (body.link) {
        const link = await manualLink(p.email, p.full_name, site);
        await admin.from('academie_profiles').update({ invited_at: new Date().toISOString() }).eq('id', p.id);
        return json({ status: 'link', link });
      }
      const err = await deliver(p.email, p.full_name, p.role, site);
      if (err) return json({ status: 'email-failed', message: err });
      await admin.from('academie_profiles').update({ invited_at: new Date().toISOString() }).eq('id', p.id);
      return json({ status: 'sent' });
    }

    const email = String(body.email ?? '').trim().toLowerCase();
    const fullName = String(body.full_name ?? '').trim();
    const role = String(body.role ?? '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Email tidak valid' }, 400);
    if (fullName.length < 2) return json({ error: 'Isi nama lengkap' }, 400);
    if (!['student', 'mentor', 'admin'].includes(role)) return json({ error: 'Peran tidak dikenal' }, 400);
    const phone = String(body.phone ?? '').replace(/[^0-9+]/g, '');

    const { data: existing } = await admin.from('academie_profiles').select('id, user_id, role').eq('email', email).maybeSingle();
    let profileId = existing?.id as string | undefined;
    if (existing?.user_id) return json({ status: 'active', profile_id: existing.id, message: 'Orang ini sudah punya akun aktif. Ia tinggal masuk.' });
    if (existing) {
      await admin.from('academie_profiles').update({ full_name: fullName, role, phone, note: String(body.note ?? ''), active: true }).eq('id', existing.id);
    } else {
      const { data: ins, error } = await admin.from('academie_profiles').insert({ email, full_name: fullName, role, phone, note: String(body.note ?? '') }).select('id').single();
      if (error) return json({ error: error.message }, 400);
      profileId = ins.id;
    }
    const err = await deliver(email, fullName, role, site);
    if (err) return json({ status: 'email-failed', profile_id: profileId, message: err });
    await admin.from('academie_profiles').update({ invited_at: new Date().toISOString() }).eq('id', profileId!);
    return json({ status: 'sent', profile_id: profileId });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || 'Kesalahan server' }, 500);
  }
});
