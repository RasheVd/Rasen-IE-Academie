/**
 * State aplikasi. Semua data yang boleh dilihat akun ini dimuat sekali
 * (RLS di Supabase yang menyaring), lalu dimuat ulang setelah tiap perubahan.
 */
import { useSyncExternalStore } from 'react';
import { createClient } from '@supabase/supabase-js';
import { emptyData, type Course, type Data, type Enrollment, type Material, type Profile, type Session, type SessionStudent } from './domain/types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const configured = !!(url && key);
export const sb = createClient(url || 'http://localhost', key || 'missing', { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

type Status = 'booting' | 'signed-out' | 'no-profile' | 'loading' | 'ready' | 'error';
export interface Toast { id: number; message: string; tone?: 'error' }
export interface Gcal { configured: boolean; connected: boolean; email: string | null }
interface Root { status: Status; error: string | null; email: string | null; me: Profile | null; data: Data; gcal: Gcal | null; toasts: Toast[] }

let root: Root = { status: configured ? 'booting' : 'error', error: configured ? null : 'VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY belum diisi di file .env', email: null, me: null, data: emptyData, gcal: null, toasts: [] };
const listeners = new Set<() => void>();
const set = (patch: Partial<Root>) => { root = { ...root, ...patch }; listeners.forEach((l) => l()); };
export function useStore<T>(sel: (r: Root) => T): T {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => sel(root));
}
export const useData = () => useStore((r) => r.data);
export const useMe = () => useStore((r) => r.me)!;
export const getRoot = () => root;

let toastId = 0;
export function toast(message: string, tone?: 'error') {
  const id = ++toastId;
  set({ toasts: [...root.toasts.slice(-2), { id, message, tone }] });
  setTimeout(() => set({ toasts: root.toasts.filter((t) => t.id !== id) }), tone ? 6000 : 3200);
}

const friendly = (m: string) => {
  if (/invalid login credentials/i.test(m)) return 'Email atau kata sandi salah.';
  if (/email not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Buka tautan di kotak masukmu dulu.';
  if (/already registered/i.test(m)) return 'Email ini sudah terdaftar. Silakan masuk.';
  if (/rate limit/i.test(m)) return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
  if (/password should be/i.test(m)) return 'Kata sandi minimal 6 karakter.';
  if (/duplicate key.*code/i.test(m)) return 'Kode itu sudah dipakai.';
  if (/duplicate key.*email/i.test(m)) return 'Email itu sudah terdaftar di IE.Academie.';
  if (/duplicate key.*student_id.*course_id|academie_enrollments_student_id_course_id/i.test(m)) return 'Peserta sudah terdaftar di mata kuliah itu.';
  if (/violates foreign key.*academie_sessions_course/i.test(m)) return 'Mata kuliah ini masih punya sesi. Hapus atau pindahkan sesinya dulu.';
  if (/row-level security/i.test(m)) return 'Akunmu tidak punya izin untuk tindakan ini.';
  if (/failed to fetch|networkerror/i.test(m)) return 'Tidak bisa menghubungi server. Periksa koneksi internet.';
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
  sb.auth.onAuthStateChange((event, session) => {
    const email = session?.user.email ?? null;
    if (!session) { set({ status: 'signed-out', me: null, data: emptyData, email: null, gcal: null }); return; }
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      if (root.email === email && root.status === 'ready') return;
      set({ email });
      // Hindari memanggil Supabase di dalam callback auth (bisa saling mengunci).
      setTimeout(() => load(), 0);
    }
  });
}

export async function load(silent = false) {
  if (!silent) set({ status: 'loading', error: null });
  try {
    const me = ok(await sb.rpc('academie_ensure_profile')) as Profile | null;
    if (!me?.id || !me.active) { set({ status: 'no-profile', me: null }); return; }
    const [profiles, courses, enrollments, sessions, links, materials] = await Promise.all([
      sb.from('academie_profiles').select('*').order('full_name'),
      sb.from('academie_courses').select('*').order('code'),
      sb.from('academie_enrollments').select('*'),
      sb.from('academie_sessions').select('*').order('starts_at'),
      sb.from('academie_session_students').select('*'),
      sb.from('academie_materials').select('*').order('created_at', { ascending: false }),
    ]);
    set({
      status: 'ready', me,
      data: {
        profiles: ok(profiles) as Profile[], courses: ok(courses) as Course[], enrollments: ok(enrollments) as Enrollment[],
        sessions: ok(sessions) as Session[], links: ok(links) as SessionStudent[], materials: ok(materials) as Material[],
      },
    });
    if (!root.gcal) refreshGcal();
  } catch (e) {
    if (silent) toast((e as Error).message, 'error');
    else set({ status: 'error', error: (e as Error).message });
  }
}
const reload = () => load(true);

export const auth = {
  async signIn(email: string, password: string) { ok(await sb.auth.signInWithPassword({ email, password })); },
  async signUp(email: string, password: string) {
    const d = ok(await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + '/beranda' } }));
    return { needsConfirmation: !d.session };
  },
  async magicLink(email: string) { ok(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/beranda' } })); },
  async signOut() { await sb.auth.signOut(); },
};

/* ── Google Calendar ─────────────────────────────────────── */
async function fn<T>(path: string, body?: unknown): Promise<T> {
  const { data, error } = await sb.functions.invoke(`academie-gcal/${path}`, body === undefined ? { method: 'GET' } : { body: body as Record<string, unknown> });
  if (error) throw new AppError('Layanan Google Calendar tidak merespons.');
  if (data?.error) throw new AppError(data.error);
  return data as T;
}
export async function refreshGcal() {
  try { set({ gcal: await fn<Gcal>('status') }); } catch { set({ gcal: { configured: false, connected: false, email: null } }); }
}
export async function connectGcal() {
  const { url } = await fn<{ url: string }>('connect', { return_to: location.origin + '/pengaturan' });
  location.href = url;
}
export async function disconnectGcal() { await fn('disconnect', {}); await refreshGcal(); }
/** Tulis sesi ke Google Calendar. Diam bila belum tersambung. */
async function syncGcal(payload: { session_id?: string; deleted_event_id?: string }): Promise<'synced' | 'skipped' | 'failed'> {
  if (!root.gcal?.connected) return 'skipped';
  try {
    const r = await fn<{ ok: boolean }>('sync', payload);
    return r.ok ? 'synced' : 'failed';
  } catch { return 'failed'; }
}

/* ── Aksi data ───────────────────────────────────────────── */
type Draft<T> = Partial<T> & { id?: string };
async function upsert<T extends { id: string }>(table: string, draft: Draft<T>): Promise<T> {
  const { id, ...rest } = draft as any;
  const q = id ? sb.from(table).update(rest).eq('id', id).select().single() : sb.from(table).insert(rest).select().single();
  return ok(await q) as T;
}
async function del(table: string, id: string) { ok(await sb.from(table).delete().eq('id', id)); }

export async function savePerson(d: Draft<Profile>) {
  const p = await upsert<Profile>('academie_profiles', { ...d, email: d.email?.trim().toLowerCase() });
  await reload(); return p;
}
export async function removePerson(id: string) { await del('academie_profiles', id); await reload(); }

export async function saveCourse(d: Draft<Course>) { const c = await upsert<Course>('academie_courses', { ...d, code: d.code?.trim().toUpperCase() }); await reload(); return c; }
export async function removeCourse(id: string) { await del('academie_courses', id); await reload(); }

export async function saveEnrollment(d: Draft<Enrollment>) { const e = await upsert<Enrollment>('academie_enrollments', d); await reload(); return e; }
export async function removeEnrollment(id: string) { await del('academie_enrollments', id); await reload(); }

export async function saveMaterial(d: Draft<Material>) { const m = await upsert<Material>('academie_materials', d); await reload(); return m; }
export async function removeMaterial(id: string) { await del('academie_materials', id); await reload(); }

/** Simpan sesi beserta pesertanya, lalu tulis ke Google Calendar. */
export async function saveSession(d: Draft<Session>, studentIds: string[]) {
  const s = await upsert<Session>('academie_sessions', d);
  const current = root.data.links.filter((l) => l.session_id === s.id).map((l) => l.student_id);
  const drop = current.filter((x) => !studentIds.includes(x));
  const add = studentIds.filter((x) => !current.includes(x));
  if (drop.length) ok(await sb.from('academie_session_students').delete().eq('session_id', s.id).in('student_id', drop));
  for (const student_id of add) ok(await sb.from('academie_session_students').insert({ session_id: s.id, student_id }));
  // Peserta yang belum terdaftar di mata kuliah ini didaftarkan otomatis.
  for (const student_id of add) {
    if (!root.data.enrollments.some((e) => e.student_id === student_id && e.course_id === s.course_id))
      await sb.from('academie_enrollments').insert({ student_id, course_id: s.course_id, mentor_id: s.mentor_id });
  }
  const g = await syncGcal({ session_id: s.id });
  await reload();
  return { session: s, gcal: g };
}
export async function removeSession(s: Session) {
  await del('academie_sessions', s.id);
  if (s.gcal_event_id) await syncGcal({ deleted_event_id: s.gcal_event_id });
  await reload();
}

export interface ReportRow { student_id: string; attendance: string; pretest_score: number | null; posttest_score: number | null }
export async function submitReport(sessionId: string, status: Session['status'], report: string, followup: string, rows: ReportRow[]) {
  ok(await sb.rpc('academie_submit_report', { p_session: sessionId, p_status: status, p_report: report, p_followup: followup, p_rows: rows }));
  if (status === 'cancelled') await syncGcal({ session_id: sessionId });
  await reload();
}
