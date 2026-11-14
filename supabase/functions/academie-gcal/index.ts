// IE.Academie · fungsi server Google Calendar
// Rute:
//   POST /connect {return_to}         sambungkan akun Google milik pengguna yang login
//   GET  /callback                    dipanggil Google setelah izin diberikan
//   GET  /status                      status sambungan pengguna
//   POST /disconnect                  putuskan sambungan
//   POST /sync-rules {mentor_id?}     tulis slot biru berulang dari pola ketersediaan mentor
//   POST /sync-session {session_id}   tulis atau perbarui satu sesi
//   POST /cron (x-cron-secret)        tiap 15 menit: jam sibuk mentor, sesi yang berubah, pengingat yang tertunda
//
// Secret: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (Supabase → Edge Functions → Secrets).
// Opsional: SITE_URL (default https://academie.my.id), ALLOWED_ORIGINS (dipisah koma).
// Redirect URI di Google Cloud: <SUPABASE_URL>/functions/v1/academie-gcal/callback
import { createClient } from 'npm:@supabase/supabase-js@2';
import { Gcal, syncRules, syncSession, toLocal, type Rule, type SessionView } from './core.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const CSECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const SITE = (Deno.env.get('SITE_URL') ?? 'https://academie.my.id').replace(/\/$/, '');
const ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://academie.my.id,https://www.academie.my.id,https://ie-academie.vercel.app,http://localhost:5173')
  .split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
const FN = `${SB_URL}/functions/v1/academie-gcal`;
const SCOPES = [
  'openid', 'email',
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
].join(' ');
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const allowedReturn = (u: string) => { try { const o = new URL(u).origin; return ORIGINS.includes(o); } catch { return false; } };

interface Me { profileId: string; role: 'admin' | 'mentor' | 'student'; email: string }
async function caller(req: Request): Promise<Me | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  if (!data.user) return null;
  const { data: p } = await db.from('academie_profiles').select('id, role, email, active').eq('user_id', data.user.id).maybeSingle();
  return p?.active ? { profileId: p.id, role: p.role, email: p.email } : null;
}

/* ── Token Google per profil (cache per permintaan) ──────── */
type Account = { profile_id: string; refresh_token: string; google_email: string; calendar_id: string | null };
async function accessToken(acc: Account, cache: Map<string, Gcal | null>): Promise<Gcal | null> {
  if (cache.has(acc.profile_id)) return cache.get(acc.profile_id)!;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CID, client_secret: CSECRET, refresh_token: acc.refresh_token, grant_type: 'refresh_token' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    await db.from('academie_google_accounts').update({ last_error: body.error === 'invalid_grant' ? 'Akses Google dicabut. Sambungkan ulang di Pengaturan.' : `Gagal memperbarui token (${res.status})` }).eq('profile_id', acc.profile_id);
    cache.set(acc.profile_id, null);
    return null;
  }
  const gc = new Gcal(body.access_token, fetch as any);
  cache.set(acc.profile_id, gc);
  return gc;
}

async function accountsFor(ids: string[]): Promise<Map<string, Account>> {
  if (!ids.length) return new Map();
  const { data } = await db.from('academie_google_accounts').select('profile_id, refresh_token, google_email, calendar_id').in('profile_id', ids);
  return new Map((data ?? []).map((a: Account) => [a.profile_id, a]));
}

async function adminAccount(): Promise<Account | null> {
  const { data: admins } = await db.from('academie_profiles').select('id').eq('role', 'admin').eq('active', true);
  const accs = await accountsFor((admins ?? []).map((a: { id: string }) => a.id));
  return [...accs.values()].find((a) => a.calendar_id) ?? null;
}

/* ── Pola ketersediaan mentor ────────────────────────────── */
async function syncMentorRules(mentorId: string, cache: Map<string, Gcal | null>) {
  const acc = (await accountsFor([mentorId])).get(mentorId);
  if (!acc?.calendar_id) return { ok: false, reason: 'belum-tersambung' };
  const gc = await accessToken(acc, cache);
  if (!gc) return { ok: false, reason: 'token' };
  const { data: rules } = await db.from('academie_availability_rules').select('id, weekday, start_min, end_min, active, gcal_events').eq('mentor_id', mentorId);
  const todo = (rules ?? []).filter((r: Rule) => r.active || r.gcal_events.length);
  const now = new Date();
  const map = await syncRules(gc, acc.calendar_id, todo, toLocal(now).date, now);
  for (const [id, events] of Object.entries(map)) await db.from('academie_availability_rules').update({ gcal_events: events }).eq('id', id);
  // Sesi mendatang mentor ini perlu ditulis ulang (kejadian berulang bisa berubah).
  await db.from('academie_sessions').update({ gcal_dirty: true }).eq('mentor_id', mentorId).eq('status', 'scheduled').gt('starts_at', now.toISOString());
  return { ok: true };
}

/* ── Satu sesi ───────────────────────────────────────────── */
async function processSession(sessionId: string, cache: Map<string, Gcal | null>) {
  const { data: s } = await db.from('academie_sessions')
    .select('*, course:academie_courses(code, title), topic:academie_topics(title), mentor:academie_profiles!academie_sessions_mentor_id_fkey(id, full_name, email)')
    .eq('id', sessionId).maybeSingle();
  if (!s) return { ok: false, reason: 'tidak-ada' };
  const { data: seats } = await db.from('academie_session_students')
    .select('student_id, payment_status, gcal_reminders_ok, student:academie_profiles!academie_session_students_student_id_fkey(full_name, email)')
    .eq('session_id', sessionId);
  const students = (seats ?? []).map((x: any) => ({ profile_id: x.student_id, name: x.student?.full_name ?? '', email: x.student?.email ?? '', paid: x.payment_status === 'paid' }));

  const accs = await accountsFor([s.mentor_id, ...students.map((x) => x.profile_id)]);
  const adminAcc = await adminAccount();
  const mentorAcc = accs.get(s.mentor_id);
  const mentorGc = mentorAcc?.calendar_id ? await accessToken(mentorAcc, cache) : null;
  const adminGc = adminAcc ? await accessToken(adminAcc, cache) : null;

  // Token mentor atau admin gagal sementara: tunda (cron mencoba lagi) daripada membuat acara ganda di kalender lain.
  if ((mentorAcc?.calendar_id && !mentorGc) || (adminAcc && !adminGc)) {
    await db.from('academie_sessions').update({ gcal_error: 'Token Google tidak bisa diperbarui; dicoba lagi otomatis.' }).eq('id', sessionId);
    return { ok: false, reason: 'token' };
  }
  let organizer: { kind: 'mentor' | 'admin'; calendarId: string; gc: Gcal } | null = null;
  if (mentorGc && mentorAcc?.calendar_id) organizer = { kind: 'mentor', calendarId: mentorAcc.calendar_id, gc: mentorGc };
  else if (adminGc && adminAcc?.calendar_id) organizer = { kind: 'admin', calendarId: adminAcc.calendar_id, gc: adminGc };

  const { data: rules } = await db.from('academie_availability_rules').select('id, weekday, start_min, end_min, active, gcal_events').eq('mentor_id', s.mentor_id);
  const studentClients: { profile_id: string; gc: Gcal }[] = [];
  for (const st of students) {
    const a = accs.get(st.profile_id);
    const gc = a ? await accessToken(a, cache) : null;
    if (gc) studentClients.push({ profile_id: st.profile_id, gc });
  }
  const calendarOwners = new Map<string, Account>();
  for (const a of [...accs.values(), ...(adminAcc ? [adminAcc] : [])]) if (a.calendar_id) calendarOwners.set(a.calendar_id, a);

  const view: SessionView = {
    id: s.id, code: s.code, status: s.status, mode: s.mode, starts_at: new Date(s.starts_at).toISOString(), ends_at: new Date(s.ends_at).toISOString(),
    place: s.place, pretest_url: s.pretest_url, posttest_url: s.posttest_url,
    course_code: s.course?.code ?? '', course_title: s.course?.title ?? '', topic: s.topic?.title ?? '',
    mentor: { name: s.mentor?.full_name ?? '', email: s.mentor?.email ?? '' }, students,
    gcal_calendar_id: s.gcal_calendar_id, gcal_event_id: s.gcal_event_id, gcal_kind: s.gcal_kind, gcal_admin_event_id: s.gcal_admin_event_id,
  };
  try {
    const r = await syncSession({
      session: view, site: SITE, organizer, mentorRules: rules ?? [],
      admin: adminGc && adminAcc?.calendar_id ? { calendarId: adminAcc.calendar_id, gc: adminGc } : null,
      students: studentClients,
      clientFor: (cal) => { const a = calendarOwners.get(cal); return a ? cache.get(a.profile_id) ?? null : null; },
    });
    await db.from('academie_sessions').update({
      gcal_calendar_id: r.calendarId, gcal_event_id: r.eventId, gcal_kind: r.kind, gcal_admin_event_id: r.adminEventId,
      gcal_dirty: false, gcal_synced_at: new Date().toISOString(), gcal_error: null,
    }).eq('id', sessionId);
    for (const [pid, ok] of Object.entries(r.reminders)) {
      await db.from('academie_session_students').update({ gcal_reminders_ok: ok }).eq('session_id', sessionId).eq('student_id', pid);
    }
    return { ok: true, organizer: organizer?.kind ?? null };
  } catch (e) {
    await db.from('academie_sessions').update({ gcal_error: String((e as Error).message).slice(0, 300) }).eq('id', sessionId);
    return { ok: false, reason: 'google', detail: String((e as Error).message).slice(0, 200) };
  }
}

async function canTouchSession(me: Me, sessionId: string) {
  if (me.role === 'admin') return true;
  const { data: s } = await db.from('academie_sessions').select('mentor_id').eq('id', sessionId).maybeSingle();
  if (s?.mentor_id === me.profileId) return true;
  const { data: seat } = await db.from('academie_session_students').select('student_id').eq('session_id', sessionId).eq('student_id', me.profileId).maybeSingle();
  return !!seat;
}

/* ── Rute ────────────────────────────────────────────────── */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const route = url.pathname.split('/academie-gcal')[1] || '/';
  const cache = new Map<string, Gcal | null>();

  try {
    if (route === '/callback') {
      const state = url.searchParams.get('state') ?? '';
      const { data: st } = await db.from('academie_oauth_states').select('*').eq('state', state).maybeSingle();
      if (!st) return new Response('Tautan sudah tidak berlaku. Ulangi dari halaman Pengaturan.', { status: 400 });
      await db.from('academie_oauth_states').delete().eq('state', state);
      const back = (q: string) => Response.redirect(`${st.return_to}${st.return_to.includes('?') ? '&' : '?'}google=${q}`, 302);
      const code = url.searchParams.get('code');
      if (!code) return back('ditolak');
      const tok = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: CID, client_secret: CSECRET, redirect_uri: `${FN}/callback`, grant_type: 'authorization_code' }),
      }).then((r) => r.json());
      if (!tok.refresh_token) return back('gagal');
      const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json()).catch(() => ({}));
      const { data: prof } = await db.from('academie_profiles').select('id, role').eq('id', st.profile_id).maybeSingle();
      if (!prof) return back('gagal');
      const prev = (await accountsFor([prof.id])).get(prof.id);
      let calendarId = prev?.calendar_id ?? null;
      const gc = new Gcal(tok.access_token, fetch as any);
      if (prof.role !== 'student' && !calendarId) calendarId = await gc.createCalendar('IE.Academie');
      await db.from('academie_google_accounts').upsert({ profile_id: prof.id, refresh_token: tok.refresh_token, google_email: info.email ?? '', calendar_id: calendarId, connected_at: new Date().toISOString(), last_error: null });
      if (prof.role === 'mentor') await syncMentorRules(prof.id, new Map([[prof.id, gc]]));
      if (prof.role === 'admin') await db.from('academie_sessions').update({ gcal_dirty: true }).eq('status', 'scheduled').gt('starts_at', new Date().toISOString());
      if (prof.role === 'student') {
        const { data: seats } = await db.from('academie_session_students').select('session_id').eq('student_id', prof.id).eq('payment_status', 'paid');
        const ids = (seats ?? []).map((x: { session_id: string }) => x.session_id);
        if (ids.length) await db.from('academie_sessions').update({ gcal_dirty: true }).in('id', ids).eq('status', 'scheduled');
      }
      return back('tersambung');
    }

    if (route === '/cron') {
      const secret = req.headers.get('x-cron-secret') ?? '';
      const { data: ok } = await db.rpc('academie_cron_secret_ok', { p: secret });
      if (!ok) return json({ error: 'forbidden' }, 403);
      if (!CID || !CSECRET) return json({ ok: true, skipped: 'google belum diatur' });
      const now = new Date();
      // 1. Jam sibuk pribadi mentor, 60 hari ke depan.
      const { data: mentors } = await db.from('academie_profiles').select('id').eq('role', 'mentor').eq('active', true);
      const maccs = await accountsFor((mentors ?? []).map((m: { id: string }) => m.id));
      let busyCount = 0;
      for (const acc of maccs.values()) {
        const gc = await accessToken(acc, cache);
        if (!gc) continue;
        try {
          const busy = await gc.busy(now, new Date(now.getTime() + 60 * 864e5));
          await db.from('academie_mentor_busy').delete().eq('mentor_id', acc.profile_id);
          if (busy.length) await db.from('academie_mentor_busy').insert(busy.map((b) => ({ mentor_id: acc.profile_id, starts_at: b.start, ends_at: b.end })));
          busyCount += busy.length;
        } catch (e) { await db.from('academie_google_accounts').update({ last_error: String((e as Error).message).slice(0, 200) }).eq('profile_id', acc.profile_id); }
      }
      // 2. Sesi yang berubah, dan pengingat peserta yang belum terpasang.
      const { data: dirty } = await db.from('academie_sessions').select('id').eq('gcal_dirty', true).gt('ends_at', new Date(now.getTime() - 864e5).toISOString()).order('starts_at').limit(25);
      const { data: pending } = await db.from('academie_session_students').select('session_id, session:academie_sessions!inner(status, starts_at)')
        .eq('payment_status', 'paid').eq('gcal_reminders_ok', false).eq('session.status', 'scheduled').gt('session.starts_at', now.toISOString()).limit(25);
      const ids = [...new Set([...(dirty ?? []).map((x: { id: string }) => x.id), ...(pending ?? []).map((x: { session_id: string }) => x.session_id)])];
      const results = [];
      for (const id of ids) results.push(await processSession(id, cache));
      return json({ ok: true, busy: busyCount, sessions: results.length, failed: results.filter((r) => !r.ok).length });
    }

    const me = await caller(req);
    if (!me) return json({ error: 'Harus login' }, 401);

    if (route === '/status') {
      const acc = (await accountsFor([me.profileId])).get(me.profileId);
      const { data: row } = await db.from('academie_google_accounts').select('last_error').eq('profile_id', me.profileId).maybeSingle();
      return json({ configured: !!(CID && CSECRET), connected: !!acc, email: acc?.google_email ?? null, calendar: !!acc?.calendar_id, last_error: row?.last_error ?? null });
    }

    if (route === '/connect' && req.method === 'POST') {
      if (!CID || !CSECRET) return json({ error: 'Google belum diatur oleh admin (GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET di Supabase).' }, 400);
      const { return_to } = await req.json();
      if (typeof return_to !== 'string' || !allowedReturn(return_to)) return json({ error: 'Alamat kembali tidak diizinkan' }, 400);
      const state = crypto.randomUUID() + crypto.randomUUID();
      await db.from('academie_oauth_states').delete().lt('created_at', new Date(Date.now() - 3600_000).toISOString());
      await db.from('academie_oauth_states').insert({ state, profile_id: me.profileId, return_to });
      const q = new URLSearchParams({
        client_id: CID, redirect_uri: `${FN}/callback`, response_type: 'code', access_type: 'offline', prompt: 'consent',
        include_granted_scopes: 'true', scope: SCOPES, state, login_hint: me.email,
      });
      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
    }

    if (route === '/disconnect' && req.method === 'POST') {
      const acc = (await accountsFor([me.profileId])).get(me.profileId);
      if (acc) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(acc.refresh_token)}`, { method: 'POST' }).catch(() => null);
        await db.from('academie_google_accounts').delete().eq('profile_id', me.profileId);
      }
      return json({ ok: true });
    }

    if (route === '/sync-rules' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const mentorId = me.role === 'admin' && body.mentor_id ? body.mentor_id : me.profileId;
      if (me.role !== 'admin' && me.role !== 'mentor') return json({ error: 'Hanya mentor' }, 403);
      const r = await syncMentorRules(mentorId, cache);
      if (r.ok) {
        const { data: ss } = await db.from('academie_sessions').select('id').eq('mentor_id', mentorId).eq('gcal_dirty', true).gt('starts_at', new Date().toISOString()).limit(10);
        for (const x of ss ?? []) await processSession(x.id, cache);
      }
      return json(r);
    }

    if (route === '/sync-session' && req.method === 'POST') {
      const { session_id } = await req.json();
      if (typeof session_id !== 'string' || !(await canTouchSession(me, session_id))) return json({ error: 'Bukan sesi kamu' }, 403);
      if (!CID || !CSECRET) return json({ ok: false, reason: 'google belum diatur' });
      return json(await processSession(session_id, cache));
    }

    return json({ error: 'Rute tidak dikenal' }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: 'Kesalahan server' }, 500);
  }
});
