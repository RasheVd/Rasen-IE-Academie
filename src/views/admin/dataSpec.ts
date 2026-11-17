/** Daftar tabel yang bisa dilihat dan dibetulkan admin di Pusat data, beserta kolom yang boleh diubah. */
import type { Data } from '../../domain/types';

export type ColType = 'text' | 'long' | 'int' | 'num' | 'bool' | 'date' | 'datetime' | 'time' | 'select' | 'ref' | 'json';
export interface Col { k: string; label: string; type: ColType; options?: [string, string][]; ref?: 'profile' | 'course' | 'topic' | 'session'; nullable?: boolean; readonly?: boolean }
export interface Spec { table: string; label: string; data: keyof Data; key: string[]; note?: string; readonly?: boolean; cols: Col[] }

const yesNo: [string, string][] = [['true', 'Ya'], ['false', 'Tidak']];
export const SPECS: Spec[] = [
  {
    table: 'sessions', label: 'Sesi', data: 'sessions', key: ['id'],
    note: 'Jam mulai, mentor, dan jenis kelas sebaiknya diubah lewat pindah jadwal supaya kursi dan kredit ikut benar.',
    cols: [
      { k: 'code', label: 'Kode', type: 'text', readonly: true },
      { k: 'course_id', label: 'Mata kuliah', type: 'ref', ref: 'course' },
      { k: 'topic_id', label: 'Topik', type: 'ref', ref: 'topic', nullable: true },
      { k: 'mentor_id', label: 'Mentor', type: 'ref', ref: 'profile' },
      { k: 'starts_at', label: 'Mulai (WIB)', type: 'datetime' },
      { k: 'duration_min', label: 'Durasi (menit)', type: 'int' },
      { k: 'mode', label: 'Jenis', type: 'select', options: [['private', 'Private'], ['group', 'Kelas bersama']] },
      { k: 'is_open', label: 'Kelas bersama terbuka', type: 'bool' },
      { k: 'status', label: 'Status', type: 'select', options: [['scheduled', 'Terjadwal'], ['done', 'Selesai'], ['cancelled', 'Batal']] },
      { k: 'place_kind', label: 'Jenis tempat', type: 'select', options: [['online', 'Online'], ['offline', 'Tatap muka'], ['diskusi', 'Dibahas lewat WA']] },
      { k: 'place', label: 'Tempat / tautan', type: 'text' },
      { k: 'pretest_url', label: 'Pretest', type: 'text' },
      { k: 'posttest_url', label: 'Posttest', type: 'text' },
      { k: 'report', label: 'Laporan', type: 'long' },
      { k: 'followup', label: 'Tindak lanjut', type: 'long' },
      { k: 'cancelled_reason', label: 'Alasan batal', type: 'text' },
    ],
  },
  {
    table: 'session_students', label: 'Kursi & pembayaran', data: 'seats', key: ['session_id', 'student_id'],
    cols: [
      { k: 'session_id', label: 'Sesi', type: 'ref', ref: 'session', readonly: true },
      { k: 'student_id', label: 'Peserta', type: 'ref', ref: 'profile', readonly: true },
      { k: 'payment_status', label: 'Pembayaran', type: 'select', options: [['pending', 'Menunggu'], ['paid', 'Lunas']] },
      { k: 'paid_via', label: 'Dibayar lewat', type: 'select', options: [['transfer', 'Transfer'], ['credit', 'Kredit'], ['admin', 'Admin']], nullable: true },
      { k: 'hold_expires_at', label: 'Slot ditahan sampai', type: 'datetime', nullable: true },
      { k: 'attendance', label: 'Kehadiran', type: 'select', options: [['present', 'Hadir'], ['absent', 'Tidak hadir'], ['excused', 'Izin']], nullable: true },
      { k: 'pretest_score', label: 'Nilai pretest', type: 'num', nullable: true },
      { k: 'posttest_score', label: 'Nilai posttest', type: 'num', nullable: true },
      { k: 'rating', label: 'Rating', type: 'int', nullable: true },
      { k: 'feedback', label: 'Masukan', type: 'long' },
    ],
  },
  {
    table: 'profiles', label: 'Orang', data: 'profiles', key: ['id'],
    cols: [
      { k: 'full_name', label: 'Nama', type: 'text' },
      { k: 'email', label: 'Email', type: 'text' },
      { k: 'role', label: 'Peran', type: 'select', options: [['student', 'Peserta'], ['mentor', 'Mentor'], ['admin', 'Admin']] },
      { k: 'phone', label: 'WhatsApp', type: 'text' },
      { k: 'meeting_link', label: 'Tautan kelas', type: 'text' },
      { k: 'bio', label: 'Bio', type: 'long' },
      { k: 'learning_needs', label: 'Kebutuhan belajar', type: 'long' },
      { k: 'note', label: 'Catatan admin', type: 'long' },
      { k: 'active', label: 'Aktif', type: 'bool' },
    ],
  },
  {
    table: 'enrollments', label: 'Mata kuliah peserta', data: 'enrollments', key: ['id'],
    cols: [
      { k: 'student_id', label: 'Peserta', type: 'ref', ref: 'profile', readonly: true },
      { k: 'course_id', label: 'Mata kuliah', type: 'ref', ref: 'course' },
      { k: 'status', label: 'Status', type: 'select', options: [['active', 'Aktif'], ['paused', 'Jeda'], ['finished', 'Selesai']] },
      { k: 'goal_text', label: 'Target', type: 'text' },
      { k: 'goal_date', label: 'Tanggal target', type: 'date', nullable: true },
    ],
  },
  {
    table: 'mentor_courses', label: 'Kompetensi mentor', data: 'mentorCourses', key: ['mentor_id', 'course_id'],
    cols: [
      { k: 'mentor_id', label: 'Mentor', type: 'ref', ref: 'profile', readonly: true },
      { k: 'course_id', label: 'Mata kuliah', type: 'ref', ref: 'course', readonly: true },
      { k: 'status', label: 'Status', type: 'select', options: [['pending', 'Menunggu'], ['approved', 'Disetujui']] },
    ],
  },
  {
    table: 'courses', label: 'Mata kuliah', data: 'courses', key: ['id'],
    cols: [
      { k: 'code', label: 'Kode', type: 'text' },
      { k: 'title', label: 'Nama', type: 'text' },
      { k: 'semester', label: 'Semester', type: 'int', nullable: true },
      { k: 'kind', label: 'Jenis', type: 'select', options: [['wajib', 'Wajib'], ['pilihan', 'Pilihan']] },
      { k: 'category', label: 'Kategori', type: 'text' },
      { k: 'description', label: 'Deskripsi', type: 'long' },
      { k: 'active', label: 'Aktif', type: 'bool' },
    ],
  },
  {
    table: 'topics', label: 'Topik', data: 'topics', key: ['id'],
    cols: [
      { k: 'course_id', label: 'Mata kuliah', type: 'ref', ref: 'course', readonly: true },
      { k: 'title', label: 'Judul', type: 'text' },
      { k: 'position', label: 'Urutan', type: 'int' },
      { k: 'pretest_url', label: 'Pretest bawaan', type: 'text' },
      { k: 'posttest_url', label: 'Posttest bawaan', type: 'text' },
    ],
  },
  {
    table: 'materials', label: 'Materi', data: 'materials', key: ['id'],
    cols: [
      { k: 'title', label: 'Judul', type: 'text' },
      { k: 'course_id', label: 'Mata kuliah', type: 'ref', ref: 'course' },
      { k: 'topic_id', label: 'Topik', type: 'ref', ref: 'topic', nullable: true },
      { k: 'kind', label: 'Jenis', type: 'select', options: [['ppt', 'PPT'], ['pdf', 'PDF'], ['latihan', 'Latihan'], ['video', 'Video'], ['link', 'Tautan']] },
      { k: 'url', label: 'Tautan', type: 'text' },
      { k: 'description', label: 'Keterangan', type: 'long' },
      { k: 'status', label: 'Status', type: 'select', options: [['approved', 'Disetujui'], ['pending', 'Menunggu'], ['rejected', 'Ditolak']] },
    ],
  },
  {
    table: 'credits', label: 'Kredit sesi', data: 'credits', key: ['id'],
    cols: [
      { k: 'student_id', label: 'Peserta', type: 'ref', ref: 'profile', readonly: true },
      { k: 'course_id', label: 'Mata kuliah', type: 'ref', ref: 'course', nullable: true },
      { k: 'reason', label: 'Alasan', type: 'text' },
      { k: 'used_session', label: 'Dipakai di sesi', type: 'ref', ref: 'session', nullable: true },
    ],
  },
  {
    table: 'payouts', label: 'Transfer hak mentor', data: 'payouts', key: ['id'],
    cols: [
      { k: 'mentor_id', label: 'Mentor', type: 'ref', ref: 'profile', readonly: true },
      { k: 'month', label: 'Bulan', type: 'date' },
      { k: 'amount', label: 'Jumlah (Rp)', type: 'int' },
      { k: 'transferred_at', label: 'Tanggal transfer', type: 'date' },
      { k: 'note', label: 'Catatan', type: 'text' },
    ],
  },
  {
    table: 'availability_rules', label: 'Jam mentor', data: 'rules', key: ['id'], readonly: true,
    note: 'Jam diatur mentor sendiri. Admin hanya melihat; data yang rusak bisa dikembalikan dari Riwayat perubahan.',
    cols: [
      { k: 'mentor_id', label: 'Mentor', type: 'ref', ref: 'profile' },
      { k: 'weekday', label: 'Hari (0 = Minggu)', type: 'int' },
      { k: 'start_time', label: 'Mulai', type: 'time' },
      { k: 'end_time', label: 'Selesai', type: 'time' },
      { k: 'modes', label: 'Jenis', type: 'text' },
      { k: 'group_open', label: 'Bersama terbuka', type: 'bool' },
      { k: 'place_kind', label: 'Tempat', type: 'text' },
      { k: 'valid_from', label: 'Berlaku mulai', type: 'date' },
      { k: 'valid_until', label: 'Sampai', type: 'date', nullable: true },
      { k: 'active', label: 'Aktif', type: 'bool' },
    ],
  },
  {
    table: 'availability_exceptions', label: 'Libur mentor', data: 'exceptions', key: ['id'], readonly: true,
    cols: [
      { k: 'mentor_id', label: 'Mentor', type: 'ref', ref: 'profile' },
      { k: 'starts_on', label: 'Dari', type: 'date' },
      { k: 'ends_on', label: 'Sampai', type: 'date' },
      { k: 'reason', label: 'Keterangan', type: 'text' },
    ],
  },
];
export const BOOL_OPTIONS = yesNo;
export const TABLE_LABEL: Record<string, string> = Object.fromEntries([...SPECS.map((s) => [`academie_${s.table}`, s.label]), ['academie_settings', 'Aturan bisnis']]);
