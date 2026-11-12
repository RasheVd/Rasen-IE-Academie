// IE.Academie · sinkron Google Calendar
// Satu akun Google (admin) menjadi penyelenggara. Setiap sesi yang ditulis di
// website dibuat sebagai acara di kalender itu, dengan mentor dan peserta
// sebagai tamu, sehingga langsung muncul di Google Calendar mereka.
//
// Secret yang dibutuhkan (Supabase → Edge Functions → Secrets):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// Redirect URI di Google Cloud: <SUPABASE_URL>/functions/v1/academie-gcal/callback
import { createClient } from 'npm:@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const CSECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const FN = `${SB_URL}/functions/v1/academie-gcal`;
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

async function caller(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  if (!data.user) return null;
  const { data: profile } = await db.from('academie_profiles').select('id, role, active').eq('user_id', data.user.id).maybeSingle();
  if (!profile?.active) return null;
  return { userId: data.user.id, profileId: profile.id as string, role: profile.role as string };
}

async function accessToken(): Promise<string | null> {
  const { data } = await db.from('academie_google').select('refresh_token').eq('id', 1).maybeSingle();
  if (!data?.refresh_token) return null;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CID, client_secret: CSECRET, refresh_token: data.refresh_token, grant_type: 'refresh_token' }),
  });
  if (!res.ok) return null;
  return (await res.json()).access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const route = url.pathname.split('/academie-gcal')[1] || '/';

  try {
    /* Google mengembalikan admin ke sini setelah memberi izin. */
    if (route === '/callback') {
      const state = url.searchParams.get('state') ?? '';
      const code = url.searchParams.get('code');
      const { data: st } = await db.from('academie_oauth_states').select('*').eq('state', state).maybeSingle();
      if (!st) return new Response('Tautan sudah tidak berlaku. Ulangi dari halaman Pengaturan.', { status: 400 });
      await db.from('academie_oauth_states').delete().eq('state', state);
      const back = (q: string) => Response.redirect(`${st.return_to}${st.return_to.includes('?') ? '&' : '?'}gcal=${q}`, 302);
      if (!code) return back('ditolak');
      const tok = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: CID, client_secret: CSECRET, redirect_uri: `${FN}/callback`, grant_type: 'authorization_code' }),
      }).then((r) => r.json());
      if (!tok.refresh_token) return back('gagal');
      const me = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json());
      await db.from('academie_google').upsert({ id: 1, refresh_token: tok.refresh_token, connected_email: me.email ?? '', updated_at: new Date().toISOString() });
      return back('tersambung');
    }

    const who = await caller(req);
    if (!who) return json({ error: 'Harus login' }, 401);

    if (route === '/status') {
      const { data } = await db.from('academie_google').select('connected_email').eq('id', 1).maybeSingle();
      return json({ configured: !!(CID && CSECRET), connected: !!data, email: who.role === 'admin' ? data?.connected_email ?? null : null });
    }

    if (route === '/connect' && req.method === 'POST') {
      if (who.role !== 'admin') return json({ error: 'Hanya admin' }, 403);
      if (!CID || !CSECRET) return json({ error: 'GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET belum diisi di Supabase' }, 400);
      const { return_to } = await req.json();
      if (typeof return_to !== 'string' || !/^https?:\/\//.test(return_to)) return json({ error: 'return_to tidak sah' }, 400);
      const state = crypto.randomUUID() + crypto.randomUUID();
      await db.from('academie_oauth_states').delete().lt('created_at', new Date(Date.now() - 3600_000).toISOString());
      await db.from('academie_oauth_states').insert({ state, user_id: who.userId, return_to });
      const q = new URLSearchParams({
        client_id: CID, redirect_uri: `${FN}/callback`, response_type: 'code', access_type: 'offline', prompt: 'consent', state,
        scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email',
      });
      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
    }

    if (route === '/disconnect' && req.method === 'POST') {
      if (who.role !== 'admin') return json({ error: 'Hanya admin' }, 403);
      await db.from('academie_google').delete().eq('id', 1);
      return json({ ok: true });
    }

    /* Tulis, perbarui, atau hapus acara untuk satu sesi. */
    if (route === '/sync' && req.method === 'POST') {
      const { session_id, deleted_event_id } = await req.json();
      const token = await accessToken();
      if (!token) return json({ ok: false, reason: 'belum-tersambung' });
      const g = (path: string, init: RequestInit = {}) =>
        fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events${path}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } });

      if (deleted_event_id) {
        if (who.role !== 'admin') return json({ error: 'Hanya admin' }, 403);
        await g(`/${encodeURIComponent(deleted_event_id)}?sendUpdates=all`, { method: 'DELETE' });
        return json({ ok: true });
      }

      const { data: s } = await db.from('academie_sessions').select('*').eq('id', session_id).maybeSingle();
      if (!s) return json({ error: 'Sesi tidak ditemukan' }, 404);
      if (who.role !== 'admin' && s.mentor_id !== who.profileId) return json({ error: 'Bukan sesi kamu' }, 403);

      if (s.status === 'cancelled') {
        if (s.gcal_event_id) {
          await g(`/${encodeURIComponent(s.gcal_event_id)}?sendUpdates=all`, { method: 'DELETE' });
          await db.from('academie_sessions').update({ gcal_event_id: null }).eq('id', s.id);
        }
        return json({ ok: true });
      }

      const [{ data: course }, { data: links }] = await Promise.all([
        db.from('academie_courses').select('code, title').eq('id', s.course_id).maybeSingle(),
        db.from('academie_session_students').select('student_id').eq('session_id', s.id),
      ]);
      const ids = [s.mentor_id, ...(links ?? []).map((l) => l.student_id)].filter(Boolean);
      const { data: people } = await db.from('academie_profiles').select('email, full_name').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
      const start = new Date(s.starts_at);
      const end = new Date(start.getTime() + s.duration_min * 60_000);
      const body = {
        summary: `IE.Academie · ${course?.code ?? ''} ${s.topic || course?.title || ''}`.trim(),
        description: [`Kode sesi: ${s.code}`, s.topic && `Topik: ${s.topic}`, s.pretest_url && `Pretest: ${s.pretest_url}`, s.posttest_url && `Posttest: ${s.posttest_url}`].filter(Boolean).join('\n'),
        location: s.place || undefined,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        attendees: (people ?? []).map((p) => ({ email: p.email, displayName: p.full_name || undefined })),
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }, { method: 'popup', minutes: 10 }] },
      };
      let res = s.gcal_event_id
        ? await g(`/${encodeURIComponent(s.gcal_event_id)}?sendUpdates=all`, { method: 'PATCH', body: JSON.stringify(body) })
        : await g(`?sendUpdates=all`, { method: 'POST', body: JSON.stringify(body) });
      if (res.status === 404 || res.status === 410) res = await g(`?sendUpdates=all`, { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) return json({ ok: false, reason: 'google', detail: (await res.text()).slice(0, 300) });
      const ev = await res.json();
      await db.from('academie_sessions').update({ gcal_event_id: ev.id }).eq('id', s.id);
      return json({ ok: true, link: ev.htmlLink });
    }

    return json({ error: 'Rute tidak dikenal' }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: 'Kesalahan server' }, 500);
  }
});
