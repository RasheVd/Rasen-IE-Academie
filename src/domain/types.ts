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
}
export interface Profile {
  id: string; user_id: string | null; email: string; full_name: string; role: Role; phone: string; bio: string;
  meeting_link: string; learning_needs: string; note: string; active: boolean; invited_at: string | null; created_at: string;
}
export interface Course { id: string; code: string; title: string; category: string; description: string; color: CourseColor; active: boolean }
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

export interface Data {
  settings: Settings; profiles: Profile[]; courses: Course[]; topics: Topic[]; enrollments: Enrollment[]; mentorCourses: MentorCourse[];
  rules: Rule[]; exceptions: AvailabilityException[]; sessions: Session[]; seats: Seat[]; credits: Credit[]; materials: Material[];
  notices: Notice[]; payouts: Payout[];
}
export const defaultSettings: Settings = {
  admin_whatsapp: '+6285967072383', admin_whatsapp_label: 'Rasen/Sandy', price_private: 70000, price_group: 40000,
  mentor_share_private: 49000, mentor_share_group: 28000, booking_cutoff_hours: 24, reschedule_cutoff_hours: 24, hold_hours: 12,
  booking_horizon_days: 60, threshold_need_help: 60, threshold_mastered: 80, bank_name: '', bank_account: '', bank_holder: '', payment_note: '',
};
export const emptyData: Data = {
  settings: defaultSettings, profiles: [], courses: [], topics: [], enrollments: [], mentorCourses: [], rules: [], exceptions: [],
  sessions: [], seats: [], credits: [], materials: [], notices: [], payouts: [],
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
