/**
 * State aplikasi. Semua data yang boleh dilihat akun ini dimuat sekali
 * (RLS di Supabase yang menyaring), lalu dimuat ulang setelah tiap perubahan.
 * Aturan bisnis (batas waktu, kapasitas, bentrok, kredit) dijaga di database.
 */
import { useSyncExternalStore } from 'react';
import { createClient, type EmailOtpType } from '@supabase/supabase-js';
import {
  defaultSettings, emptyData, type AvailabilityException, type BookingOptions, type Course, type Data, type Enrollment, type Material,
  type Mode, type Payout, type Profile, type Role, type Rule, type Session, type Settings, type Topic,
} from './domain/types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const configured = !!(url && key);
export const sb = createClient(url || 'http://localhost', key || 'missing', { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
export const SITE = typeof location !== 'undefined' ? location.origin : 'https://academie.my.id';

type Status = 'booting' | 'signed-out' | 'no-profile' | 'loading' | 'ready' | 'error';
export interface Toast { id: number; message: string; tone?: 'error' }
export interface Gcal { configured: boolean; connected: boolean; email: string | null; last_error?: string | null }
export interface PublicInfo { admin_whatsapp: string; admin_whatsapp_label: string; price_private: number; price_group: number; mentors: number; courses: number }
interface Root { status: Status; error: string | null; email: string | null; me: Profile | null; data: Data; gcal: Gcal | null; toasts: Toast[]; info: PublicInfo | null; recovery: boolean }

let root: Root = {
  status: configured ? 'booting' : 'error', error: configured ? null : 'VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY belum diisi di file .env',
  email: null, me: null, data: emptyData, gcal: null, toasts: [], info: null, recovery: false,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<Root>) => { root = { ...root, ...patch }; listeners.forEach((l) => l()); };
export function useStore<T>(sel: (r: Root) => T): T {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => sel(root));
}
export const useData = () => useStore((r) => r.data);
export const useMe = () => useStore((r) => r.me)!;
export const useSettings = () => useStore((r) => r.data.settings);
export const getRoot = () => root;

let toastId = 0;
export function toast(message: string, tone?: 'error') {
  const id = ++toastId;
  set({ toasts: [...root.toasts.slice(-2), { id, message, tone }] });
  setTimeout(() => set({ toasts: root.toasts.filter((t) => t.id !== id) }), tone ? 7000 : 3600);
}

const friendly = (m: string) => {
  if (/invalid login credentials/i.test(m)) return 'Email atau kata sandi salah.';
  if (/email not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Buka tautan undangan di kotak masukmu dulu.';
  if (/rate limit|too many/i.test(m)) return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
  if (/password should be|at least 6/i.test(m)) return 'Kata sandi minimal 8 karakter.';
  if (/same.*password|different from the old/i.test(m)) return 'Kata sandi baru harus berbeda dari yang lama.';
  if (/academie_courses_name_key/i.test(m)) return 'Mata kuliah dengan nama itu sudah ada (huruf besar kecil dan spasi dianggap sama).';
  if (/academie_courses_code_key/i.test(m)) return 'Kode mata kuliah itu sudah dipakai.';
  if (/academie_topics_name_key/i.test(m)) return 'Topik dengan nama itu sudah ada di mata kuliah ini.';
  if (/academie_rules_no_overlap/i.test(m)) return 'Jam ini bertumpuk dengan jam lain di hari yang sama. Ubah atau hapus yang lama dulu.';
  if (/academie_sessions_no_overlap/i.test(m)) return 'Mentor sudah punya sesi di jam itu.';
  if (/academie_availability_rules_check|% 60/i.test(m)) return 'Durasi harus kelipatan 60 menit dan jam selesai setelah jam mulai.';
  if (/academie_profiles_email|duplicate key.*email/i.test(m)) return 'Email itu sudah terdaftar di IE.Academie.';
  if (/academie_enrollments_student_id_course_id/i.test(m)) return 'Peserta sudah terdaftar di mata kuliah itu.';
  if (/mentor_courses_pkey/i.test(m)) return 'Mata kuliah itu sudah ada di daftar kompetensimu.';
  if (/payouts_mentor_id_month/i.test(m)) return 'Transfer untuk bulan itu sudah dicatat. Ubah catatan yang ada.';
  if (/violates foreign key.*academie_sessions/i.test(m)) return 'Data ini masih dipakai oleh sesi. Nonaktifkan saja.';
  if (/kapasitas|penuh/i.test(m)) return m;
  if (/row-level security|permission denied/i.test(m)) return 'Akunmu tidak punya izin untuk tindakan ini.';
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Tidak bisa menghubungi server. Periksa koneksi internet.';
  if (/url.*https?|~\*/i.test(m)) return 'Tautan harus diawali https://';
  return m;
};
export class AppError extends Error {}
function ok<R extends { error: { message: string } | null }>(res: R): R extends { data: infer D } ? NonNullable<D> : never {
  if (res.error) throw new AppError(friendly(res.error.message));
  return (res as any).data;
}

/* ── Boot dan auth ───────────────────────────────────────── */
let started = false;
export async function boot() {
  if (!configured || started) return;
  started = true;
  loadInfo();
  sb.auth.onAuthStateChange((event, session) => {
    const email = session?.user.email ?? null;
    if (event === 'PASSWORD_RECOVERY') set({ recovery: true });
    if (!session) { set({ status: 'signed-out', me: null, data: emptyData, email: null, gcal: null }); return; }
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'PASSWORD_RECOVERY') {
      if (root.email === email && root.status === 'ready') return;
      set({ email });
      // Hindari memanggil Supabase di dalam callback auth (bisa saling mengunci).
      setTimeout(() => load(), 0);
    }
  });
  // Muat ulang diam-diam saat tab kembali aktif, supaya booking baru terlihat.
  let last = Date.now();
  window.addEventListener('focus', () => { if (root.status === 'ready' && Date.now() - last > 60_000) { last = Date.now(); load(true); } });
}

async function loadInfo() {
  const { data } = await sb.rpc('academie_public_info');
  if (data) set({ info: data as PublicInfo });
}

export async function load(silent = false) {
  if (!silent) set({ status: 'loading', error: null });
  try {
    const me = ok(await sb.rpc('academie_ensure_profile')) as Profile | null;
    if (!me?.id || !me.active) { set({ status: 'no-profile', me: null }); return; }
    const q = (t: string) => sb.from(`academie_${t}`).select('*');
    const [settings, profiles, courses, topics, enrollments, mentorCourses, rules, exceptions, sessions, seats, credits, materials, notices, payouts] = await Promise.all([
      q('settings').maybeSingle(), q('profiles').order('full_name'), q('courses').order('category').order('title'), q('topics').order('position'),
      q('enrollments'), q('mentor_courses'), q('availability_rules').order('weekday').order('start_time'), q('availability_exceptions').order('starts_on'),
      q('sessions').order('starts_at'), q('session_students'), q('credits').order('created_at'), q('materials').order('created_at', { ascending: false }),
      q('notifications').order('created_at', { ascending: false }).limit(50), q('payouts').order('month', { ascending: false }),
    ]);
    set({
      status: 'ready', me,
      data: {
        settings: { ...defaultSettings, ...(ok(settings) as Settings | null ?? {}) },
        profiles: ok(profiles), courses: ok(courses), topics: ok(topics), enrollments: ok(enrollments), mentorCourses: ok(mentorCourses),
        rules: ok(rules), exceptions: ok(exceptions), sessions: ok(sessions), seats: (ok(seats) as any[]).map((x) => ({
          ...x, pretest_score: x.pretest_score == null ? null : Number(x.pretest_score), posttest_score: x.posttest_score == null ? null : Number(x.posttest_score),
        })), credits: ok(credits), materials: ok(materials), notices: ok(notices), payouts: ok(payouts),
      } as Data,
    });
    if (!root.gcal) refreshGcal();
  } catch (e) {
    if (silent) toast((e as Error).message, 'error');
    else set({ status: 'error', error: (e as Error).message });
  }
}
export const reload = () => load(true);

const verifying = new Map<string, Promise<void>>();
export const auth = {
  async signIn(email: string, password: string) { ok(await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })); },
  async forgot(email: string) { ok(await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: SITE + '/undangan' })); },
  async setPassword(password: string) { ok(await sb.auth.updateUser({ password })); set({ recovery: false }); },
  /** Tautan undangan/atur ulang dari admin: ?token_hash=…&type=invite|recovery. Satu token hanya diverifikasi sekali. */
  async verifyLink(tokenHash: string, type: string) {
    if (!verifying.has(tokenHash)) {
      const t = (['invite', 'recovery', 'magiclink', 'signup', 'email'].includes(type) ? type : 'invite') as EmailOtpType;
      verifying.set(tokenHash, sb.auth.verifyOtp({ token_hash: tokenHash, type: t }).then((r) => { ok(r); }));
    }
    try { await verifying.get(tokenHash); }
    catch (e) {
      const m = (e as Error).message;
      throw new AppError(/expired|invalid|not found/i.test(m) ? 'Tautan sudah dipakai atau kedaluwarsa.' : m);
    }
  },
  async signOut() { await sb.auth.signOut(); },
};

/* ── Fungsi server ───────────────────────────────────────── */
async function fn<T>(name: string, path: string, body?: unknown): Promise<T> {
  const { data, error } = await sb.functions.invoke(`${name}${path}`, body === undefined ? { method: 'GET' } : { body: body as Record<string, unknown> });
  if (error) {
    let msg = '';
    try { msg = (await (error as any).context?.json?.())?.error ?? ''; } catch { /* abaikan */ }
    throw new AppError(msg || 'Layanan server tidak merespons. Coba lagi sebentar.');
  }
  if (data?.error) throw new AppError(data.error);
  return data as T;
}

/* ── Google Calendar ─────────────────────────────────────── */
export async function refreshGcal() {
  try { set({ gcal: await fn<Gcal>('academie-gcal', '/status') }); } catch { set({ gcal: { configured: false, connected: false, email: null } }); }
}
export async function connectGcal(returnPath = '/pengaturan') {
  const { url } = await fn<{ url: string }>('academie-gcal', '/connect', { return_to: SITE + returnPath });
  location.href = url;
}
export async function disconnectGcal() { await fn('academie-gcal', '/disconnect', {}); await refreshGcal(); }
/** Tulis ke Google Calendar sekarang. Kalau gagal, jadwal otomatis tiap 15 menit yang mengulang. */
export function syncSession(session_id: string) { fn('academie-gcal', '/sync-session', { session_id }).catch(() => {}); }
export function syncRules(mentor_id?: string) { fn('academie-gcal', '/sync-rules', mentor_id ? { mentor_id } : {}).catch(() => {}); }
export async function syncSessionNow(session_id: string) {
  const r = await fn<{ ok: boolean; reason?: string; error?: string }>('academie-gcal', '/sync-session', { session_id });
  await reload();
  return r;
}

/* ── Undangan akun ───────────────────────────────────────── */
export type InviteResult = { status: 'sent' | 'active' | 'email-failed' | 'link'; message?: string; link?: string; profile_id?: string };
export async function invite(p: { email: string; full_name: string; role: Role; phone?: string; note?: string }) {
  const r = await fn<InviteResult>('academie-invite', '', { ...p, email: p.email.trim().toLowerCase(), site: SITE });
  await reload(); return r;
}
export async function resendInvite(profileId: string) { const r = await fn<InviteResult>('academie-invite', '', { resend: profileId, site: SITE }); await reload(); return r; }
export async function inviteLink(profileId: string) { return fn<InviteResult>('academie-invite', '', { link: profileId, site: SITE }); }

/* ── Aksi data ───────────────────────────────────────────── */
type Draft<T> = Partial<T> & { id?: string };
async function upsert<T extends { id: string }>(table: string, draft: Draft<T>): Promise<T> {
  const { id, ...rest } = draft as any;
  const q = id ? sb.from(`academie_${table}`).update(rest).eq('id', id).select().single() : sb.from(`academie_${table}`).insert(rest).select().single();
  return ok(await q) as T;
}
async function del(table: string, id: string) { ok(await sb.from(`academie_${table}`).delete().eq('id', id)); }
const rpc = async <T = unknown>(name: string, args: Record<string, unknown>) => ok(await sb.rpc(`academie_${name}`, args)) as T;

// Profil
export async function updateMyProfile(p: { full_name: string; phone: string; bio: string; meeting_link: string; learning_needs: string }) {
  await rpc('update_my_profile', { p_full_name: p.full_name, p_phone: p.phone, p_bio: p.bio, p_meeting_link: p.meeting_link.trim(), p_learning_needs: p.learning_needs });
  await reload();
}
export async function saveProfile(d: Draft<Profile>) { const p = await upsert<Profile>('profiles', d); await reload(); return p; }

// Katalog
export async function saveCourse(d: Draft<Course>) { const c = await upsert<Course>('courses', { ...d, code: d.code?.trim().toUpperCase(), title: d.title?.trim().replace(/\s+/g, ' ') }); await reload(); return c; }
export async function saveTopic(d: Draft<Topic>) { const t = await upsert<Topic>('topics', { ...d, title: d.title?.trim().replace(/\s+/g, ' '), pretest_url: d.pretest_url?.trim(), posttest_url: d.posttest_url?.trim() }); await reload(); return t; }
export async function removeTopic(id: string) { await del('topics', id); await reload(); }
export async function moveTopic(t: Topic, dir: -1 | 1) {
  const list = root.data.topics.filter((x) => x.course_id === t.course_id).sort((a, b) => a.position - b.position);
  const i = list.findIndex((x) => x.id === t.id), j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await Promise.all(list.map((x, k) => (x.position === k + 1 ? null : sb.from('academie_topics').update({ position: k + 1 }).eq('id', x.id))));
  await reload();
}

// Mata kuliah peserta
export async function setEnrollment(studentId: string, courseId: string, on: boolean) {
  const e = root.data.enrollments.find((x) => x.student_id === studentId && x.course_id === courseId);
  if (on && !e) ok(await sb.from('academie_enrollments').insert({ student_id: studentId, course_id: courseId }));
  if (!on && e) await del('enrollments', e.id);
  await reload();
}
export async function saveEnrollment(d: Draft<Enrollment>) { await upsert<Enrollment>('enrollments', d); await reload(); }

// Kompetensi mentor
export async function requestCompetency(mentorId: string, courseId: string) { ok(await sb.from('academie_mentor_courses').insert({ mentor_id: mentorId, course_id: courseId })); await reload(); }
export async function setCompetency(mentorId: string, courseId: string, status: 'approved' | 'pending' | null) {
  if (status === null) ok(await sb.from('academie_mentor_courses').delete().eq('mentor_id', mentorId).eq('course_id', courseId));
  else ok(await sb.from('academie_mentor_courses').upsert({ mentor_id: mentorId, course_id: courseId, status }));
  await reload();
}

// Ketersediaan
const t2s = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export async function saveRule(d: { id?: string; mentor_id: string; weekday: number; start_min: number; end_min: number; modes: Rule['modes']; active?: boolean }) {
  await upsert<Rule>('availability_rules', { id: d.id, mentor_id: d.mentor_id, weekday: d.weekday, start_time: t2s(d.start_min), end_time: t2s(d.end_min), modes: d.modes, active: d.active ?? true });
  syncRules(); await reload();
}
export async function removeRule(id: string) { await del('availability_rules', id); syncRules(); await reload(); }
export async function saveException(d: Draft<AvailabilityException>) { await upsert<AvailabilityException>('availability_exceptions', d); await reload(); }
export async function removeException(id: string) { await del('availability_exceptions', id); await reload(); }

// Booking
export async function bookingOptions(courseId: string) { return rpc<BookingOptions>('booking_options', { p_course: courseId }); }
export async function book(p: { mentor: string; course: string; topic: string | null; starts_at: string; mode: Mode; open: boolean }) {
  const r = await rpc<{ session_id: string; paid: boolean }>('book', { p_mentor: p.mentor, p_course: p.course, p_topic: p.topic, p_starts_at: p.starts_at, p_mode: p.mode, p_open: p.open });
  syncSession(r.session_id); await reload(); return r;
}
export async function reschedule(sessionId: string, mentor: string, startsAt: string) {
  const r = await rpc<{ session_id: string; paid: boolean }>('reschedule', { p_session: sessionId, p_mentor: mentor, p_starts_at: startsAt });
  syncSession(sessionId); syncSession(r.session_id); await reload(); return r;
}
export async function cancelPending(sessionId: string) { await rpc('cancel_pending', { p_session: sessionId }); syncSession(sessionId); await reload(); }
export async function uploadProof(sessionId: string, file: File) {
  const me = root.me!;
  if (file.size > 5 * 1024 * 1024) throw new AppError('Ukuran file maksimal 5 MB.');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${me.id}/${sessionId}-${Date.now()}.${ext}`;
  ok(await sb.storage.from('academie-proofs').upload(path, file, { contentType: file.type || undefined, upsert: false }));
  await rpc('submit_payment', { p_session: sessionId, p_proof_path: path });
  await reload();
}
export async function proofUrl(path: string) {
  const r = ok(await sb.storage.from('academie-proofs').createSignedUrl(path, 600));
  return r.signedUrl;
}
export async function confirmPayment(sessionId: string, studentId: string) { await rpc('confirm_payment', { p_session: sessionId, p_student: studentId }); syncSession(sessionId); await reload(); }
export async function rejectPayment(sessionId: string, studentId: string, reason: string) { await rpc('reject_payment', { p_session: sessionId, p_student: studentId, p_reason: reason }); syncSession(sessionId); await reload(); }

// Sesi
export async function cancelSession(sessionId: string, reason: string) {
  const r = await rpc<{ student_id: string; full_name: string; phone: string; credit: boolean }[]>('cancel_session', { p_session: sessionId, p_reason: reason });
  syncSession(sessionId); await reload(); return r;
}
export interface ReportRow { student_id: string; attendance: string; pretest_score: number | null; posttest_score: number | null }
export async function submitReport(sessionId: string, status: 'scheduled' | 'done', report: string, followup: string, rows: ReportRow[]) {
  await rpc('submit_report', { p_session: sessionId, p_status: status, p_report: report, p_followup: followup, p_rows: rows });
  await reload();
}
export async function markReady(sessionId: string) { await rpc('mark_ready', { p_session: sessionId }); await reload(); }
export async function rateSession(sessionId: string, rating: number, feedback: string) { await rpc('rate_session', { p_session: sessionId, p_rating: rating, p_feedback: feedback }); await reload(); }
export async function updateSession(id: string, patch: Partial<Pick<Session, 'place' | 'pretest_url' | 'posttest_url' | 'topic_id' | 'is_open'>>) {
  ok(await sb.from('academie_sessions').update(patch).eq('id', id)); syncSession(id); await reload();
}

// Kredit (admin)
export async function grantCredit(studentId: string, courseId: string | null, reason: string) { ok(await sb.from('academie_credits').insert({ student_id: studentId, course_id: courseId, reason })); await reload(); }

// Materi
export async function saveMaterial(d: Draft<Material>) { const m = await upsert<Material>('materials', d); await reload(); return m; }
export async function removeMaterial(id: string) { await del('materials', id); await reload(); }

// Pemberitahuan
export async function markNoticesRead() {
  const ids = root.data.notices.filter((n) => !n.read_at).map((n) => n.id);
  if (!ids.length) return;
  await sb.from('academie_notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
  await reload();
}

// Hak mentor (admin)
export async function savePayout(d: Draft<Payout>) { await upsert<Payout>('payouts', d); await reload(); }
export async function removePayout(id: string) { await del('payouts', id); await reload(); }

// Pengaturan bisnis (admin)
export async function saveSettings(patch: Partial<Settings>) { ok(await sb.from('academie_settings').update(patch).eq('id', 1)); await reload(); loadInfo(); }
