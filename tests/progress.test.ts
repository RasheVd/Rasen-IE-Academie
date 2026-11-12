import { describe, expect, it } from 'vitest';
import { courseOverview, courseProgress, gcalTemplateLink, nextSessionCode, reportsDue, studentSummary } from '../src/domain/progress';
import type { Data, Session, SessionStudent } from '../src/domain/types';

const S = (id: string, starts: string, status: Session['status'] = 'done', course = 'c1'): Session => ({
  id, code: 'X-' + id, course_id: course, mentor_id: 'm1', starts_at: starts, duration_min: 60, mode: 'private', place: 'Zoom', topic: 'T',
  status, pretest_url: '', posttest_url: '', report: '', followup: '', reported_at: null, gcal_event_id: null,
});
const L = (session_id: string, pre: number | null, post: number | null, attendance: SessionStudent['attendance'] = 'present', student_id = 's1'): SessionStudent => ({ session_id, student_id, attendance, pretest_score: pre, posttest_score: post });
const NOW = new Date('2026-11-12T12:00:00Z').getTime();
const data: Data = {
  profiles: [], courses: [], materials: [],
  enrollments: [{ id: 'e1', student_id: 's1', course_id: 'c1', mentor_id: 'm1', target_sessions: 8, status: 'active' }],
  sessions: [S('1', '2026-11-01T02:00:00Z'), S('2', '2026-11-05T02:00:00Z'), S('3', '2026-11-08T02:00:00Z'), S('4', '2026-11-20T02:00:00Z', 'scheduled'), S('5', '2026-11-10T02:00:00Z', 'scheduled'), S('6', '2026-11-02T02:00:00Z', 'cancelled'), S('7', '2026-11-03T02:00:00Z', 'done', 'c2')],
  links: [L('1', 40, 70), L('2', 50, 90), L('3', null, 80, 'present'), L('4', null, null, null), L('5', null, null, null), L('6', null, null, null), L('7', 60, 50), L('1', 20, 60, 'present', 's2')],
};

describe('progres per mata kuliah', () => {
  const p = courseProgress(data, 's1', 'c1', NOW);
  it('menghitung rata-rata hanya dari sesi dengan dua nilai', () => {
    expect(p.avgPre).toBe(45);
    expect(p.avgPost).toBe(80);
    expect(p.gain).toBe(35);
  });
  it('menghitung sesi selesai, mendatang, kehadiran, dan nilai terakhir', () => {
    expect(p.done).toBe(3);
    expect(p.upcoming).toBe(1);
    expect(p.attended).toBe(3);
    expect(p.lastPost).toBe(80);
    expect(p.next?.id).toBe('4');
    expect(p.target).toBe(8);
  });
  it('tidak mencampur nilai peserta lain', () => {
    expect(courseProgress(data, 's2', 'c1', NOW).gain).toBe(40);
  });
  it('mencatat penurunan apa adanya', () => {
    expect(courseProgress(data, 's1', 'c2', NOW).gain).toBe(-10);
  });
  it('merangkum lintas mata kuliah', () => {
    const s = studentSummary(data, 's1', NOW);
    expect(s.per).toHaveLength(2);
    expect(s.done).toBe(4);
    expect(s.gain).toBe(20);
  });
});

describe('laporan tertunda', () => {
  it('menandai sesi lewat yang masih terjadwal atau nilainya kosong', () => {
    expect(reportsDue(data, NOW).map((s) => s.id)).toEqual(['3', '5']);
    expect(reportsDue(data, NOW, 'orang-lain')).toEqual([]);
  });
});

describe('ringkasan mata kuliah dan utilitas', () => {
  it('merata-rata semua peserta', () => {
    const o = courseOverview(data, 'c1');
    expect(o.students).toBe(1);
    expect(o.sessionsDone).toBe(3);
    expect(o.gain).toBeCloseTo(36.7, 1);
  });
  it('membuat kode sesi berurutan', () => {
    expect(nextSessionCode('ie2101', [])).toBe('IE2101-01');
    expect(nextSessionCode('IE2101', ['IE2101-01', 'IE2101-07', 'IE2203-09'])).toBe('IE2101-08');
  });
  it('membuat tautan Google Calendar dengan waktu UTC', () => {
    const u = new URL(gcalTemplateLink(S('1', '2026-11-01T02:00:00Z'), 'IE.Academie'));
    expect(u.searchParams.get('dates')).toBe('20261101T020000Z/20261101T030000Z');
    expect(u.searchParams.get('location')).toBe('Zoom');
  });
});
