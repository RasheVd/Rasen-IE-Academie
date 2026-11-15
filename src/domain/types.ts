export type Role = 'admin' | 'mentor' | 'student';
export type Mode = 'private' | 'group';
export type SessionStatus = 'scheduled' | 'done' | 'cancelled';
export type Attendance = 'present' | 'absent' | 'excused';
export type MaterialKind = 'ppt' | 'pdf' | 'latihan' | 'video' | 'link';
export const COURSE_COLORS = ['teal', 'violet', 'amber', 'coral', 'sky', 'green', 'slate'] as const;
export type CourseColor = (typeof COURSE_COLORS)[number];

export interface Settings {
  admin_whatsapp: string; admin_whatsapp_label: string;
  price_private: number; price_group: number; mentor_share_private: number; mentor_share_group: number;
  booking_cutoff_hours: number; reschedule_cutoff_hours: number; hold_hours: number; booking_horizon_days: number;
  threshold_need_help: number; threshold_mastered: number;
  bank_name: string; bank_account: string; bank_holder: string; payment_note: string;
  theme: SiteTheme; content: SiteContent;
}
/** Warna situs yang diatur admin. Kosong = bawaan. */
export interface SiteTheme { preset?: string; primary?: string; accent?: string; ink?: string; bg?: string }
/** Teks halaman depan yang diatur admin. Kosong = teks bawaan. */
export interface SiteContent { hero_title?: string; hero_accent?: string; hero_lead?: string; cta_label?: string; about?: string; intro_3d?: boolean }
/** Preferensi pribadi tiap orang. */
export interface Prefs { density?: 'nyaman' | 'padat'; calendar_view?: 'day' | 'week' | 'month'; widgets?: string[]; hidden?: string[]; nav_collapsed?: boolean }
export interface Profile {
  id: string; user_id: string | null; email: string; full_name: string; role: Role; phone: string; bio: string;
  meeting_link: string; learning_needs: string; note: string; active: boolean; invited_at: string | null; created_at: string; prefs: Prefs;
}
export interface Course { id: string; code: string; title: string; category: string; description: string; color: CourseColor; active: boolean; semester: number | null; kind: 'wajib' | 'pilihan' }
export interface Topic { id: string; course_id: string; title: string; position: number; pretest_url: string; posttest_url: string }
export interface Enrollment { id: string; student_id: string; course_id: string; status: 'active' | 'paused' | 'finished'; goal_text: string; goal_date: string | null }
export interface MentorCourse { mentor_id: string; course_id: string; status: 'pending' | 'approved' }
export interface Rule {
  id: string; mentor_id: string; weekday: number; start_time: string; end_time: string; start_min: number; end_min: number;
  modes: 'private' | 'group' | 'both'; active: boolean;
}
export interface AvailabilityException { id: string; mentor_id: string; starts_on: string; ends_on: string; reason: string }
export interface Session {
  id: string; code: string; course_id: string; topic_id: string | null; mentor_id: string; starts_at: string; ends_at: string;
  duration_min: number; mode: Mode; is_open: boolean; place: string; status: SessionStatus; pretest_url: string; posttest_url: string;
  report: string; followup: string; reported_at: string | null; mentor_ready_at: string | null;
  cancelled_reason: string; cancelled_by: string | null; cancelled_at: string | null; created_by: string | null;
  gcal_event_id: string | null; gcal_dirty: boolean; gcal_error: string | null; created_at: string;
}
export interface Seat {
  session_id: string; student_id: string; payment_status: 'pending' | 'paid'; paid_via: 'transfer' | 'credit' | 'admin' | null;
  proof_path: string | null; hold_expires_at: string | null; confirmed_at: string | null;
  attendance: Attendance | null; pretest_score: number | null; posttest_score: number | null; rating: number | null; feedback: string;
  gcal_reminders_ok: boolean; joined_at: string;
}
export interface Credit { id: string; student_id: string; course_id: string | null; reason: string; source_session: string | null; used_session: string | null; created_at: string }
export interface Material {
  id: string; course_id: string; topic_id: string | null; student_id: string | null; session_id: string | null; title: string; kind: MaterialKind;
  url: string; description: string; created_by: string | null; status: 'approved' | 'pending' | 'rejected'; review_note: string; created_at: string;
}
export interface Notice { id: string; profile_id: string; title: string; body: string; link: string; read_at: string | null; created_at: string }
export interface Payout { id: string; mentor_id: string; month: string; amount: number; transferred_at: string; note: string }
export interface Todo { id: string; profile_id: string; title: string; done: boolean; due_on: string | null; created_at: string }

export interface Data {
  settings: Settings; profiles: Profile[]; courses: Course[]; topics: Topic[]; enrollments: Enrollment[]; mentorCourses: MentorCourse[];
  rules: Rule[]; exceptions: AvailabilityException[]; sessions: Session[]; seats: Seat[]; credits: Credit[]; materials: Material[];
  notices: Notice[]; payouts: Payout[]; todos: Todo[];
}
export const defaultSettings: Settings = {
  admin_whatsapp: '+6285967072383', admin_whatsapp_label: 'Rasen/Sandy', price_private: 70000, price_group: 40000,
  mentor_share_private: 49000, mentor_share_group: 28000, booking_cutoff_hours: 24, reschedule_cutoff_hours: 24, hold_hours: 12,
  booking_horizon_days: 60, threshold_need_help: 60, threshold_mastered: 80, bank_name: '', bank_account: '', bank_holder: '', payment_note: '',
  theme: {}, content: {},
};
export const emptyData: Data = {
  settings: defaultSettings, profiles: [], courses: [], topics: [], enrollments: [], mentorCourses: [], rules: [], exceptions: [],
  sessions: [], seats: [], credits: [], materials: [], notices: [], payouts: [], todos: [],
};

/** Hasil RPC academie_booking_options. */
export interface BookingOptions {
  mentors: { id: string; full_name: string; bio: string }[];
  rules: { mentor_id: string; weekday: number; start_min: number; end_min: number; modes: 'private' | 'group' | 'both' }[];
  exceptions: { mentor_id: string; starts_on: string; ends_on: string }[];
  busy: { mentor_id: string; starts_at: string; ends_at: string }[];
  sessions: { id: string; mentor_id: string; course_id: string; topic_id: string | null; starts_at: string; ends_at: string; mode: Mode; is_open: boolean; seats: number }[];
}

export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', mentor: 'Mentor', student: 'Peserta' };
export const MODE_LABEL: Record<Mode, string> = { private: 'Private', group: 'Kelas bersama' };
export const ATT_LABEL: Record<Attendance, string> = { present: 'Hadir', absent: 'Tidak hadir', excused: 'Izin' };
export const KIND_LABEL: Record<MaterialKind, string> = { ppt: 'PPT', pdf: 'PDF', latihan: 'Latihan', video: 'Video', link: 'Tautan' };
export const WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** Kelompok tampilan mata kuliah: "Semester 3", "Pilihan", atau "Umum". */
export function courseGroup(c: Pick<Course, 'semester' | 'kind'>): string {
  if (c.kind === 'pilihan') return 'Pilihan';
  return c.semester ? `Semester ${c.semester}` : 'Umum';
}
/** Urutan kelompok: semester naik, lalu Pilihan, lalu Umum. */
export function groupOrder(g: string): number {
  const m = g.match(/^Semester (\d)$/);
  return m ? Number(m[1]) : g === 'Pilihan' ? 20 : 30;
}
export function groupCourses<T extends Pick<Course, 'semester' | 'kind' | 'title'>>(list: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const c of list) { const g = courseGroup(c); (map.get(g) ?? map.set(g, []).get(g)!).push(c); }
  return [...map.entries()].sort((a, b) => groupOrder(a[0]) - groupOrder(b[0])).map(([g, l]) => [g, l.sort((x, y) => x.title.localeCompare(y.title))]);
}
