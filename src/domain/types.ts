export type Role = 'admin' | 'mentor' | 'student';
export type SessionStatus = 'scheduled' | 'done' | 'cancelled';
export type Attendance = 'present' | 'absent' | 'excused';
export type MaterialKind = 'ppt' | 'pdf' | 'latihan' | 'video' | 'link';
export const COURSE_COLORS = ['cobalt', 'orange', 'yellow', 'green', 'pink', 'ink'] as const;
export type CourseColor = (typeof COURSE_COLORS)[number];

export interface Profile { id: string; user_id: string | null; email: string; full_name: string; role: Role; note: string; active: boolean; created_at: string }
export interface Course { id: string; code: string; title: string; description: string; color: CourseColor; active: boolean }
export interface Enrollment { id: string; student_id: string; course_id: string; mentor_id: string | null; target_sessions: number; status: 'active' | 'paused' | 'finished' }
export interface Session {
  id: string; code: string; course_id: string; mentor_id: string | null; starts_at: string; duration_min: number;
  mode: 'private' | 'group'; place: string; topic: string; status: SessionStatus; pretest_url: string; posttest_url: string;
  report: string; followup: string; reported_at: string | null; gcal_event_id: string | null;
}
export interface SessionStudent { session_id: string; student_id: string; attendance: Attendance | null; pretest_score: number | null; posttest_score: number | null }
export interface Material { id: string; course_id: string; student_id: string | null; session_id: string | null; title: string; kind: MaterialKind; url: string; description: string; created_at: string }

export interface Data {
  profiles: Profile[]; courses: Course[]; enrollments: Enrollment[];
  sessions: Session[]; links: SessionStudent[]; materials: Material[];
}
export const emptyData: Data = { profiles: [], courses: [], enrollments: [], sessions: [], links: [], materials: [] };

export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', mentor: 'Mentor', student: 'Peserta' };
export const STATUS_LABEL: Record<SessionStatus, string> = { scheduled: 'Terjadwal', done: 'Selesai', cancelled: 'Batal' };
export const ATT_LABEL: Record<Attendance, string> = { present: 'Hadir', absent: 'Tidak hadir', excused: 'Izin' };
export const KIND_LABEL: Record<MaterialKind, string> = { ppt: 'PPT', pdf: 'PDF', latihan: 'Latihan', video: 'Video', link: 'Tautan' };
