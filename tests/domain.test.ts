import { describe, expect, it } from 'vitest';
import { availableSlots, bookable, groupByDate, ruleValidOn, seatInfo } from '../src/domain/slots';
import { courseProgress, recentActivity, stateMessage, stateOf, topicProgress, weeklyActivity, averageGain } from '../src/domain/mastery';
import { earnings } from '../src/domain/money';
import { normalizePhone, prettyPhone, waLink, cancelMessage } from '../src/domain/wa';
import { addDays, fromLocal, hm, mondayOf, rupiah, toLocal, until } from '../src/domain/time';
import { defaultSettings, emptyData, type BookingOptions, type Data, type Seat, type Session } from '../src/domain/types';

const M1 = 'm1', M2 = 'm2', C = 'c1';
// Jumat 14 Nov 2026, 10.00 WIB
const NOW = fromLocal('2026-11-14', 10 * 60).getTime();

function opts(over: Partial<BookingOptions> = {}): BookingOptions {
  return {
    mentors: [{ id: M1, full_name: 'Andhika', bio: '' }, { id: M2, full_name: 'Sari', bio: '' }],
    rules: [
      { mentor_id: M1, weekday: 1, start_min: 19 * 60, end_min: 21 * 60, modes: 'both' },   // Senin 19-21
      { mentor_id: M2, weekday: 6, start_min: 9 * 60, end_min: 10 * 60, modes: 'private' }, // Sabtu 09-10
    ],
    exceptions: [], busy: [], sessions: [], ...over,
  };
}
const base = { courseId: C, now: NOW, cutoffHours: 24, horizonDays: 14 };

describe('waktu WIB', () => {
  it('mengubah UTC ke WIB dan kembali', () => {
    const t = fromLocal('2026-11-16', 19 * 60);
    expect(t.toISOString()).toBe('2026-11-16T12:00:00.000Z');
    expect(toLocal(t)).toMatchObject({ date: '2026-11-16', min: 1140, weekday: 1 });
    expect(toLocal('2026-11-16T18:30:00Z').date).toBe('2026-11-17'); // lewat tengah malam WIB
  });
  it('hitung tanggal dan format', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(mondayOf('2026-11-15')).toBe('2026-11-09'); // Minggu masuk minggu yang dimulai Senin sebelumnya
    expect(hm(19 * 60 + 5)).toBe('19.05');
    expect(rupiah(70000)).toMatch(/^Rp70.000$/);
    expect(until(NOW + 3 * 3_600_000, NOW)).toBe('3 jam lagi');
    expect(until(NOW - 1, NOW)).toBe('sudah lewat');
  });
});

describe('slot booking', () => {
  it('memecah pola mingguan jadi slot 60 menit dan menghormati batas 24 jam', () => {
    const s = availableSlots(opts(), { ...base, mode: 'private' });
    // Sabtu 15 Nov 09.00 masih < 24 jam? 15 Nov 09.00 adalah 23 jam lagi: tidak boleh.
    expect(s.some((x) => x.date === '2026-11-15')).toBe(false);
    expect(s.filter((x) => x.date === '2026-11-16').map((x) => x.min)).toEqual([1140, 1200]);
    expect(s.filter((x) => x.mentor_id === M2).map((x) => x.date)).toEqual(['2026-11-21', '2026-11-28']);
  });
  it('mode group hanya dari pola both/group', () => {
    const s = availableSlots(opts(), { ...base, mode: 'group' });
    expect(s.every((x) => x.mentor_id === M1)).toBe(true);
  });
  it('libur, jam sibuk Google, dan sesi yang terisi menghapus slot', () => {
    const taken = fromLocal('2026-11-16', 1140).toISOString();
    const s = availableSlots(opts({
      exceptions: [{ mentor_id: M1, starts_on: '2026-11-23', ends_on: '2026-11-23' }],
      busy: [{ mentor_id: M1, starts_at: fromLocal('2026-11-16', 1230).toISOString(), ends_at: fromLocal('2026-11-16', 1260).toISOString() }],
      sessions: [{ id: 's1', mentor_id: M1, course_id: C, topic_id: null, starts_at: taken, ends_at: fromLocal('2026-11-16', 1200).toISOString(), mode: 'private', is_open: false, seats: 1 }],
    }), { ...base, mode: 'private', mentorId: M1 });
    expect(s.map((x) => x.date)).toEqual([]);
  });
  it('kelas bersama terbuka dengan kursi < 5 muncul sebagai slot gabung', () => {
    const start = fromLocal('2026-11-16', 1140).toISOString();
    const sess = (seats: number, course = C, open = true) => ({ id: 'g', mentor_id: M1, course_id: course, topic_id: 't1', starts_at: start, ends_at: fromLocal('2026-11-16', 1200).toISOString(), mode: 'group' as const, is_open: open, seats });
    const join = availableSlots(opts({ sessions: [sess(2)] }), { ...base, mode: 'group', mentorId: M1 }).find((x) => x.starts_at === start);
    expect(join?.join).toEqual({ session_id: 'g', seats: 2, topic_id: 't1' });
    expect(availableSlots(opts({ sessions: [sess(5)] }), { ...base, mode: 'group', mentorId: M1 }).some((x) => x.starts_at === start)).toBe(false);
    expect(availableSlots(opts({ sessions: [sess(1, 'lain')] }), { ...base, mode: 'group', mentorId: M1 }).some((x) => x.starts_at === start)).toBe(false);
    expect(availableSlots(opts({ sessions: [sess(1, C, false)] }), { ...base, mode: 'group', mentorId: M1 }).some((x) => x.starts_at === start)).toBe(false);
    expect(availableSlots(opts({ sessions: [sess(1)] }), { ...base, mode: 'private', mentorId: M1 }).some((x) => x.starts_at === start)).toBe(false);
  });
  it('slot penuh, tertutup, dan terisi tetap tampil bila diminta, tetapi tidak bisa dibooking', () => {
    const start = fromLocal('2026-11-16', 1140).toISOString();
    const sess = (seats: number, open = true, mode: 'group' | 'private' = 'group') => ({ id: 'g', mentor_id: M1, course_id: C, topic_id: null, starts_at: start, ends_at: fromLocal('2026-11-16', 1200).toISOString(), mode, is_open: open, seats });
    const at = (o: BookingOptions, mode: 'group' | 'private') => availableSlots(o, { ...base, mode, mentorId: M1, includeTaken: true }).find((x) => x.starts_at === start);
    expect(at(opts({ sessions: [sess(5)] }), 'group')).toMatchObject({ state: 'full', seats: 5 });
    expect(at(opts({ sessions: [sess(2, false)] }), 'group')).toMatchObject({ state: 'closed' });
    expect(at(opts({ sessions: [sess(1, false, 'private')] }), 'group')).toMatchObject({ state: 'taken', takenMode: 'private' });
    expect(at(opts({ sessions: [sess(3)] }), 'private')).toMatchObject({ state: 'taken', takenMode: 'group' });
    expect(bookable(at(opts({ sessions: [sess(5)] }), 'group')!)).toBe(false);
    expect(bookable(at(opts({ sessions: [sess(4)] }), 'group')!)).toBe(true);
  });
  it('pola hanya berlaku di dalam masa berlakunya, termasuk jadwal sekali', () => {
    const r = { mentor_id: M1, weekday: 1, start_min: 19 * 60, end_min: 20 * 60, modes: 'private' as const };
    const dates = (rule: object) => availableSlots(opts({ rules: [{ ...r, ...rule }] }), { ...base, mode: 'private', mentorId: M1 }).map((x) => x.date);
    expect(dates({})).toEqual(['2026-11-16', '2026-11-23']);
    expect(dates({ valid_until: '2026-11-20' })).toEqual(['2026-11-16']);
    expect(dates({ valid_from: '2026-11-20' })).toEqual(['2026-11-23']);
    expect(dates({ valid_from: '2026-11-23', valid_until: '2026-11-23' })).toEqual(['2026-11-23']);
    expect(ruleValidOn({ valid_from: '2026-11-01', valid_until: null }, '2027-01-01')).toBe(true);
  });
  it('slot membawa jenis, status kelas bersama, dan tempat dari pola mentor', () => {
    const s = availableSlots(opts({ rules: [{ mentor_id: M1, weekday: 1, start_min: 19 * 60, end_min: 20 * 60, modes: 'group', group_open: false, place_kind: 'diskusi' }] }), { ...base, mode: 'group', mentorId: M1 });
    expect(s[0]).toMatchObject({ state: 'free', modes: 'group', group_open: false, place_kind: 'diskusi' });
    expect(availableSlots(opts({ rules: [{ mentor_id: M1, weekday: 1, start_min: 19 * 60, end_min: 20 * 60, modes: 'group' }] }), { ...base, mode: 'private', mentorId: M1 })).toEqual([]);
  });
  it('label sisa kursi kelas bersama', () => {
    expect(seatInfo(1)).toMatchObject({ left: 4, tone: 'ok', text: '1/5 · sisa 4 kursi' });
    expect(seatInfo(3)).toMatchObject({ left: 2, tone: 'warn' });
    expect(seatInfo(4)).toMatchObject({ left: 1, tone: 'warn', text: '4/5 · sisa 1 kursi' });
    expect(seatInfo(5)).toMatchObject({ left: 0, tone: 'bad', text: 'Penuh 5/5' });
  });
  it('mengelompokkan per tanggal', () => {
    const g = groupByDate(availableSlots(opts(), { ...base, mode: 'private' }));
    expect(g[0].date).toBe('2026-11-16');
    expect(g[0].slots).toHaveLength(2);
  });
});

function data(sessions: Partial<Session>[], seats: Partial<Seat>[]): Data {
  const S = (p: Partial<Session>): Session => ({
    id: 'x', code: 'X', course_id: C, topic_id: null, mentor_id: M1, starts_at: '', ends_at: '', duration_min: 60, mode: 'private', is_open: false, place: '', place_kind: 'online',
    status: 'done', pretest_url: '', posttest_url: '', report: '', followup: '', reported_at: null, mentor_ready_at: null, cancelled_reason: '',
    cancelled_by: null, cancelled_at: null, created_by: null, gcal_event_id: null, gcal_dirty: false, gcal_error: null, created_at: '', ...p,
  });
  const X = (p: Partial<Seat>): Seat => ({
    session_id: 'x', student_id: 'st', payment_status: 'paid', paid_via: 'transfer', proof_path: null, hold_expires_at: null, confirmed_at: null,
    attendance: 'present', pretest_score: null, posttest_score: null, rating: null, feedback: '', gcal_reminders_ok: false, joined_at: '', ...p,
  });
  return {
    ...emptyData, settings: defaultSettings,
    topics: [1, 2, 3, 4].map((i) => ({ id: `t${i}`, course_id: C, title: `Topik ${i}`, position: i, pretest_url: '', posttest_url: '' })),
    enrollments: [{ id: 'e', student_id: 'st', course_id: C, status: 'active', goal_text: '', goal_date: null }],
    sessions: sessions.map(S), seats: seats.map(X),
  };
}

describe('status penguasaan', () => {
  it('ambang 60 dan 80', () => {
    expect(stateOf(59.5, defaultSettings)).toBe('need');
    expect(stateOf(60, defaultSettings)).toBe('practice');
    expect(stateOf(79, defaultSettings)).toBe('practice');
    expect(stateOf(80, defaultSettings)).toBe('mastered');
    expect(stateOf(null, defaultSettings)).toBe('none');
  });
  it('pesan menyebut nomor WhatsApp admin', () => {
    expect(stateMessage('need', defaultSettings)).toContain('+62 859-6707-2383 (Rasen/Sandy)');
    expect(stateMessage('need', defaultSettings)).toMatch(/dievaluasi/);
    expect(stateMessage('mastered', defaultSettings)).toMatch(/semangat belajar/);
  });
  it('memakai posttest terbaru per topik, abaikan sesi batal', () => {
    const d = data(
      [
        { id: 'a', topic_id: 't1', starts_at: '2026-11-01T12:00:00Z' },
        { id: 'b', topic_id: 't1', starts_at: '2026-11-08T12:00:00Z' },
        { id: 'c', topic_id: 't2', starts_at: '2026-11-09T12:00:00Z' },
        { id: 'd', topic_id: 't3', starts_at: '2026-11-10T12:00:00Z', status: 'cancelled' },
      ],
      [
        { session_id: 'a', pretest_score: 30, posttest_score: 50 },
        { session_id: 'b', pretest_score: 60, posttest_score: 85 },
        { session_id: 'c', pretest_score: 40, posttest_score: 55 },
        { session_id: 'd', posttest_score: 100 },
      ],
    );
    const p = topicProgress(d, 'st');
    expect(p.map((x) => x.state)).toEqual(['mastered', 'need', 'none', 'none']);
    expect(p[0]).toMatchObject({ last: 85, pre: 60, attempts: 2 });
    const cp = courseProgress(d, 'st', C);
    expect(cp).toMatchObject({ pct: 25, mastered: 1, total: 4 });
    expect(cp.points.map((x) => x.pct)).toEqual([0, 25, 25]);
    expect(recentActivity(d, 'st').map((x) => x.session.id)).toEqual(['c', 'b', 'a']);
    expect(averageGain(d.seats.filter((x) => x.session_id !== 'd'))).toBe(20); // (20 + 25 + 15) / 3
  });
  it('aktivitas mingguan memisahkan selesai dan terjadwal', () => {
    const d = data(
      [
        { id: 'a', starts_at: fromLocal('2026-11-10', 600).toISOString() },
        { id: 'b', starts_at: fromLocal('2026-11-12', 600).toISOString(), status: 'scheduled' },
      ],
      [{ session_id: 'a' }, { session_id: 'b' }],
    );
    const w = weeklyActivity(d, 'st', '2026-11-14');
    expect(w[0].date).toBe('2026-11-09');
    expect(w[1]).toMatchObject({ done: 1, planned: 0 });
    expect(w[3]).toMatchObject({ done: 0, planned: 1 });
  });
});

describe('hak mentor', () => {
  it('70% per sesi selesai, termasuk tidak hadir, dikurangi yang sudah ditransfer', () => {
    const d = data(
      [
        { id: 'a', mode: 'private', starts_at: '2026-11-01T12:00:00Z' },
        { id: 'b', mode: 'group', starts_at: '2026-11-02T12:00:00Z' },
        { id: 'c', mode: 'private', starts_at: '2026-10-31T18:00:00Z' }, // 1 Nov WIB
        { id: 'd', mode: 'private', starts_at: '2026-11-03T12:00:00Z', status: 'cancelled' },
      ],
      [{ session_id: 'a', attendance: 'absent' }],
    );
    d.payouts = [{ id: 'p', mentor_id: M1, month: '2026-11-01', amount: 49000, transferred_at: '', note: '' }];
    const [nov] = earnings(d, M1);
    expect(nov).toMatchObject({ month: '2026-11', privateCount: 2, groupCount: 1, amount: 49000 * 2 + 28000, paid: 49000 });
  });
});

describe('WhatsApp', () => {
  it('normalisasi nomor Indonesia', () => {
    expect(normalizePhone('0859-6707-2383')).toBe('6285967072383');
    expect(normalizePhone('+62 859 6707 2383')).toBe('6285967072383');
    expect(normalizePhone('859 6707 2383')).toBe('6285967072383');
    expect(waLink('+6285967072383', 'Halo ya')).toBe('https://wa.me/6285967072383?text=Halo%20ya');
    expect(prettyPhone('085967072383')).toBe('+62 859-6707-2383');
  });
  it('pesan batal menyebut kredit bila sudah bayar', () => {
    const m = cancelMessage({ studentName: 'Budi Santoso', mentorName: 'Mas Andhika', code: 'STI1-0001', course: 'Statistika Industri 1', when: 'Senin 16 Nov 19.00', reason: 'sakit', credit: true, site: 'https://academie.my.id' });
    expect(m).toMatch(/^Halo Budi,/);
    expect(m).toContain('1 kredit');
    expect(m).toContain('https://academie.my.id/booking');
  });
});
