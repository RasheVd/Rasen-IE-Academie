import { describe, expect, it } from 'vitest';
import {
  COLOR, Gcal, REMINDERS_ADMIN, REMINDERS_FULL, findSlotEvent, firstDateOnWeekday, fromLocal, instanceId,
  sessionTitle, slotStarts, syncRules, syncSession, toLocal, type FetchLike, type Rule, type SessionView,
} from '../supabase/functions/academie-gcal/core';

/** Google Calendar tiruan: cukup untuk calendars, events (termasuk instance berulang), freeBusy. */
class FakeGoogle {
  events = new Map<string, any>(); // key cal|id
  calls: { method: string; path: string; query: string; body?: any }[] = [];
  seq = 0;
  fetch: FetchLike = async (url, init = {}) => {
    const u = new URL(url);
    const path = u.pathname.replace('/calendar/v3', '');
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    this.calls.push({ method, path, query: u.search, body });
    const ok = (data: any, status = 200) => ({ status, ok: status < 300, json: async () => data, text: async () => JSON.stringify(data) });
    const m = path.match(/^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    if (path === '/calendars' && method === 'POST') return ok({ id: `cal${++this.seq}` });
    if (path === '/freeBusy') return ok({ calendars: { primary: { busy: [{ start: '2026-11-20T03:00:00Z', end: '2026-11-20T04:00:00Z' }] } } });
    if (!m) return ok({ error: 'not found' }, 404);
    const cal = decodeURIComponent(m[1]); const id = m[2] && decodeURIComponent(m[2]);
    if (method === 'POST') { const nid = `ev${++this.seq}`; this.events.set(`${cal}|${nid}`, { ...body, id: nid }); return ok({ id: nid }); }
    const key = `${cal}|${id}`;
    if (method === 'DELETE') { if (!this.events.has(key)) return ok({}, 404); this.events.delete(key); return { status: 204, ok: true, json: async () => null, text: async () => '' }; }
    if (method === 'PATCH') {
      if (!this.events.has(key)) {
        const base = id!.split('_')[0];
        if (id!.includes('_') && this.events.has(`${cal}|${base}`)) this.events.set(key, { ...this.events.get(`${cal}|${base}`), id, recurrence: undefined });
        else return ok({ error: 'not found' }, 404);
      }
      this.events.set(key, { ...this.events.get(key), ...body });
      return ok(this.events.get(key));
    }
    return ok({}, 404);
  };
  gc() { return new Gcal('token', this.fetch); }
  get(cal: string, id: string) { return this.events.get(`${cal}|${id}`); }
}

const rule = (o: Partial<Rule> = {}): Rule => ({ id: 'r1', weekday: 2, start_min: 19 * 60, end_min: 21 * 60, active: true, gcal_events: [], ...o });
// Selasa 17 Nov 2026, 19.00 WIB = 12.00 UTC
const START = '2026-11-17T12:00:00.000Z', END = '2026-11-17T13:00:00.000Z';
const session = (o: Partial<SessionView> = {}): SessionView => ({
  id: 's1', code: 'STI1-0001', status: 'scheduled', mode: 'private', starts_at: START, ends_at: END, place: 'https://meet.google.com/abc',
  pretest_url: 'https://forms.gle/pre', posttest_url: 'https://forms.gle/post', course_code: 'STI1', course_title: 'Statistika Industri 1',
  topic: 'Uji hipotesis', mentor: { name: 'Mas Andhika', email: 'mentor@x.id' },
  students: [{ profile_id: 'p1', name: 'Budi Santoso', email: 'budi@x.id', paid: true }],
  gcal_calendar_id: null, gcal_event_id: null, gcal_kind: null, gcal_admin_event_id: null, ...o,
});

describe('waktu WIB', () => {
  it('mengonversi lokal dan UTC dengan offset +7', () => {
    expect(toLocal(new Date(START))).toEqual({ date: '2026-11-17', min: 19 * 60, weekday: 2 });
    expect(fromLocal('2026-11-17', 19 * 60).toISOString()).toBe(START);
    expect(toLocal(new Date('2026-11-17T18:30:00Z'))).toEqual({ date: '2026-11-18', min: 90, weekday: 3 });
  });
  it('mencari tanggal pertama pada hari tertentu', () => {
    expect(firstDateOnWeekday(2, '2026-11-14')).toBe('2026-11-17');
    expect(firstDateOnWeekday(6, '2026-11-14')).toBe('2026-11-14');
  });
  it('membentuk ID kejadian acara berulang', () => {
    expect(instanceId('abc', new Date(START))).toBe('abc_20261117T120000Z');
  });
  it('memecah pola jadi slot 60 menit', () => {
    expect(slotStarts(rule())).toEqual([1140, 1200]);
  });
});

describe('slot biru berulang', () => {
  it('membuat satu acara berulang per jam, biru dan transparan', async () => {
    const g = new FakeGoogle();
    const map = await syncRules(g.gc(), 'cal', [rule()], '2026-11-14', new Date('2026-11-14T00:00:00Z'));
    expect(map.r1.map((e) => e.start_min)).toEqual([1140, 1200]);
    const ev = g.get('cal', map.r1[0].id);
    expect(ev.colorId).toBe(COLOR.available);
    expect(ev.transparency).toBe('transparent');
    expect(ev.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=TU']);
    expect(ev.start).toEqual({ dateTime: '2026-11-17T19:00:00', timeZone: 'Asia/Jakarta' });
  });
  it('tidak membuat ulang yang sudah ada, dan menghentikan slot yang dihapus', async () => {
    const g = new FakeGoogle();
    const first = await syncRules(g.gc(), 'cal', [rule()], '2026-11-14', new Date('2026-11-14T00:00:00Z'));
    const posts = g.calls.filter((c) => c.method === 'POST').length;
    const second = await syncRules(g.gc(), 'cal', [rule({ end_min: 20 * 60, gcal_events: first.r1 })], '2026-11-14', new Date('2026-11-14T00:00:00Z'));
    expect(g.calls.filter((c) => c.method === 'POST').length).toBe(posts);
    expect(second.r1).toEqual([first.r1[0]]);
    expect(g.get('cal', first.r1[1].id).recurrence[0]).toBe('RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261114T000000Z');
  });
  it('menghormati masa berlaku: mulai tanggal, UNTIL, dan judul jenis kelas', async () => {
    const g = new FakeGoogle();
    const map = await syncRules(g.gc(), 'cal', [rule({ modes: 'group', valid_from: '2026-11-20', valid_until: '2026-12-31' })], '2026-11-14', new Date('2026-11-14T00:00:00Z'));
    const ev = g.get('cal', map.r1[0].id);
    expect(ev.start.dateTime).toBe('2026-11-24T19:00:00');
    expect(ev.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231T165959Z']);
    expect(ev.summary).toBe('Tersedia (Kelas bersama) · IE.Academie');
    // Tanggal akhir diubah: acara lama dihentikan, acara baru dibuat.
    const again = await syncRules(g.gc(), 'cal', [rule({ modes: 'group', valid_from: '2026-11-20', valid_until: '2027-01-31', gcal_events: map.r1 })], '2026-11-14', new Date('2026-11-14T00:00:00Z'));
    expect(again.r1[0].id).not.toBe(map.r1[0].id);
    expect(g.get('cal', map.r1[0].id).recurrence[0]).toContain('UNTIL=20261114T000000Z');
    // Pola yang sudah berakhir tidak membuat acara.
    const ended = await syncRules(g.gc(), 'cal', [rule({ valid_from: '2026-10-01', valid_until: '2026-11-01' })], '2026-11-14', new Date('2026-11-14T00:00:00Z'));
    expect(ended.r1).toEqual([]);
  });
  it('pola nonaktif menghentikan semua acaranya', async () => {
    const g = new FakeGoogle();
    const first = await syncRules(g.gc(), 'cal', [rule()], '2026-11-14', new Date('2026-11-14T00:00:00Z'));
    const off = await syncRules(g.gc(), 'cal', [rule({ active: false, gcal_events: first.r1 })], '2026-11-14', new Date('2026-11-14T00:00:00Z'));
    expect(off.r1).toEqual([]);
  });
  it('menemukan acara berulang untuk waktu sesi', () => {
    const rules = [rule({ gcal_events: [{ start_min: 1140, id: 'A' }, { start_min: 1200, id: 'B' }] })];
    expect(findSlotEvent(rules, new Date(START))).toBe('A');
    expect(findSlotEvent(rules, new Date('2026-11-17T13:00:00Z'))).toBe('B');
    expect(findSlotEvent(rules, new Date('2026-11-18T12:00:00Z'))).toBeNull();
  });
});

describe('sesi di Google Calendar', () => {
  async function setup() {
    const g = new FakeGoogle();
    const gc = g.gc();
    const map = await syncRules(gc, 'mcal', [rule()], '2026-11-14', new Date('2026-11-14T00:00:00Z'));
    const rules = [rule({ gcal_events: map.r1 })];
    return { g, gc, rules, base: map.r1[0].id };
  }

  it('slot biru berubah merah dengan nama peserta, tamu, dan 5 pengingat', async () => {
    const { g, gc, rules, base } = await setup();
    const r = await syncSession({ session: session(), site: 'https://academie.my.id', organizer: { kind: 'mentor', calendarId: 'mcal', gc }, mentorRules: rules, admin: null, students: [], clientFor: () => null });
    expect(r.kind).toBe('instance');
    expect(r.eventId).toBe(`${base}_20261117T120000Z`);
    const ev = g.get('mcal', r.eventId!);
    expect(ev.colorId).toBe(COLOR.booked);
    expect(ev.summary).toBe('IE.Academie · STI1 · Private · Budi');
    expect(ev.attendees).toEqual([{ email: 'budi@x.id', displayName: 'Budi Santoso' }]);
    expect(ev.reminders.overrides.map((o: any) => o.minutes)).toEqual(REMINDERS_FULL);
    expect(ev.description).toContain('Pretest (kerjakan sebelum sesi): https://forms.gle/pre');
    expect(g.calls.find((c) => c.path.includes(r.eventId!))!.query).toContain('sendUpdates=all');
  });

  it('booking yang belum dibayar tampil abu-abu tanpa tamu', async () => {
    const { g, gc, rules } = await setup();
    const r = await syncSession({ session: session({ students: [{ profile_id: 'p1', name: 'Budi', email: 'budi@x.id', paid: false }] }), site: '', organizer: { kind: 'mentor', calendarId: 'mcal', gc }, mentorRules: rules, admin: null, students: [], clientFor: () => null });
    const ev = g.get('mcal', r.eventId!);
    expect(ev.colorId).toBe(COLOR.held);
    expect(ev.attendees).toEqual([]);
    expect(sessionTitle(session({ students: [{ profile_id: 'p1', name: 'B', email: 'b', paid: false }] }))).toBe('Ditahan · menunggu pembayaran · STI1');
  });

  it('kelas bersama menulis jumlah dan nama', () => {
    const s = session({ mode: 'group', students: [
      { profile_id: 'a', name: 'Budi S', email: 'a', paid: true }, { profile_id: 'b', name: 'Sari', email: 'b', paid: true }, { profile_id: 'c', name: 'Andi', email: 'c', paid: false },
    ] });
    expect(sessionTitle(s)).toBe('IE.Academie · STI1 · Kelas bersama 2/5 · Budi, Sari');
  });

  it('batal: kembali biru, tamu dihapus dengan pemberitahuan', async () => {
    const { g, gc, rules } = await setup();
    const r = await syncSession({ session: session(), site: '', organizer: { kind: 'mentor', calendarId: 'mcal', gc }, mentorRules: rules, admin: null, students: [], clientFor: () => null });
    const r2 = await syncSession({ session: session({ status: 'cancelled', gcal_calendar_id: r.calendarId, gcal_event_id: r.eventId, gcal_kind: r.kind }), site: '', organizer: { kind: 'mentor', calendarId: 'mcal', gc }, mentorRules: rules, admin: null, students: [], clientFor: () => null });
    expect(r2.eventId).toBeNull();
    const ev = g.get('mcal', r.eventId!);
    expect(ev.colorId).toBe(COLOR.available);
    expect(ev.attendees).toEqual([]);
    expect(g.calls.at(-1)!.query).toContain('sendUpdates=all');
  });

  it('mentor belum tersambung: kalender admin jadi penyelenggara, mentor ikut diundang, pengingat H-1', async () => {
    const g = new FakeGoogle();
    const gc = g.gc();
    const r = await syncSession({ session: session(), site: '', organizer: { kind: 'admin', calendarId: 'acal', gc }, mentorRules: [], admin: { calendarId: 'acal', gc }, students: [], clientFor: () => null });
    expect(r.kind).toBe('single');
    const ev = g.get('acal', r.eventId!);
    expect(ev.attendees.map((a: any) => a.email)).toEqual(['budi@x.id', 'mentor@x.id']);
    expect(ev.reminders.overrides.map((o: any) => o.minutes)).toEqual(REMINDERS_ADMIN);
    expect(r.adminEventId).toBeNull(); // tidak ada salinan kedua di kalender yang sama
  });

  it('salinan admin hanya H-1, dan peserta tersambung mendapat 5 pengingat', async () => {
    const { g, gc, rules } = await setup();
    const admin = new FakeGoogle();
    const student = new FakeGoogle();
    const r0 = await syncSession({ session: session(), site: '', organizer: { kind: 'mentor', calendarId: 'mcal', gc }, mentorRules: rules, admin: { calendarId: 'acal', gc: admin.gc() }, students: [], clientFor: () => null });
    // Undangan sudah tiba di kalender peserta (Google menyalin acara dengan ID yang sama).
    student.events.set(`primary|${r0.eventId}`, { id: r0.eventId, reminders: { useDefault: true } });
    const r = await syncSession({ session: session({ gcal_calendar_id: r0.calendarId, gcal_event_id: r0.eventId, gcal_kind: r0.kind, gcal_admin_event_id: r0.adminEventId }), site: '', organizer: { kind: 'mentor', calendarId: 'mcal', gc }, mentorRules: rules, admin: { calendarId: 'acal', gc: admin.gc() }, students: [{ profile_id: 'p1', gc: student.gc() }], clientFor: () => null });
    expect(admin.get('acal', r.adminEventId!).reminders.overrides.map((o: any) => o.minutes)).toEqual([1440]);
    expect(r.adminEventId).toBe(r0.adminEventId);
    expect(r.reminders.p1).toBe(true);
    expect(student.get('primary', r0.eventId!).reminders.overrides.map((o: any) => o.minutes)).toEqual(REMINDERS_FULL);
    expect(g.events.size).toBeGreaterThan(0);
  });

  it('undangan belum sampai ke peserta: ditandai untuk dicoba lagi', async () => {
    const { gc, rules } = await setup();
    const student = new FakeGoogle();
    const r = await syncSession({ session: session(), site: '', organizer: { kind: 'mentor', calendarId: 'mcal', gc }, mentorRules: rules, admin: null, students: [{ profile_id: 'p1', gc: student.gc() }], clientFor: () => null });
    expect(r.reminders.p1).toBe(false);
  });

  it('mentor baru tersambung: acara lama di kalender admin dihapus, pindah ke kalender mentor', async () => {
    const { g, gc, rules } = await setup();
    const adm = new FakeGoogle();
    const first = await syncSession({ session: session(), site: '', organizer: { kind: 'admin', calendarId: 'acal', gc: adm.gc() }, mentorRules: [], admin: { calendarId: 'acal', gc: adm.gc() }, students: [], clientFor: () => null });
    expect(adm.get('acal', first.eventId!)).toBeTruthy();
    const r = await syncSession({ session: session({ gcal_calendar_id: 'acal', gcal_event_id: first.eventId, gcal_kind: 'single' }), site: '', organizer: { kind: 'mentor', calendarId: 'mcal', gc }, mentorRules: rules, admin: null, students: [], clientFor: (c) => (c === 'acal' ? adm.gc() : null) });
    expect(adm.get('acal', first.eventId!)).toBeUndefined();
    expect(r.kind).toBe('instance');
    expect(g.get('mcal', r.eventId!).colorId).toBe(COLOR.booked);
  });

  it('slot di luar pola (pola diubah setelah booking) dibuat sebagai acara tunggal', async () => {
    const { g, gc } = await setup();
    const r = await syncSession({ session: session(), site: '', organizer: { kind: 'mentor', calendarId: 'mcal', gc }, mentorRules: [], admin: null, students: [], clientFor: () => null });
    expect(r.kind).toBe('single');
    expect(g.get('mcal', r.eventId!).start).toEqual({ dateTime: START, timeZone: 'Asia/Jakarta' });
  });
});

describe('jam sibuk', () => {
  it('membaca freeBusy kalender utama', async () => {
    const g = new FakeGoogle();
    expect(await g.gc().busy(new Date(), new Date())).toEqual([{ start: '2026-11-20T03:00:00Z', end: '2026-11-20T04:00:00Z' }]);
  });
});
