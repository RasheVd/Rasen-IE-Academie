/**
 * IE.Academie · logika Google Calendar (tanpa ketergantungan Deno, bisa diuji di Node).
 *
 * Model:
 *  - Mentor yang menyambungkan Google punya kalender terpisah "IE.Academie".
 *    Tiap jam dari pola ketersediaannya ditulis sebagai acara berulang mingguan
 *    berwarna biru "Tersedia" (transparan, tidak memblokir jadwal pribadi).
 *  - Saat slot dibooking dan dibayar, satu kejadian (instance) dari acara berulang itu
 *    diubah jadi merah, berisi nama peserta, dengan peserta sebagai tamu dan
 *    5 pengingat: H-5, H-3, H-1, H-6 jam, H-1 jam. Batal: kembali biru.
 *  - Peserta yang menyambungkan Google: pengingat 5 kali dipasang di salinan acara miliknya.
 *  - Admin yang menyambungkan Google: salinan tiap sesi di kalendernya, pengingat H-1 saja.
 *  - Mentor belum tersambung: kalender admin menjadi penyelenggara, mentor dan peserta jadi tamu.
 */

export const TZ = 'Asia/Jakarta';
const TZ_OFFSET_MIN = 7 * 60; // WIB, tanpa daylight saving
export const REMINDERS_FULL = [7200, 4320, 1440, 360, 60]; // H-5, H-3, H-1, H-6 jam, H-1 jam (menit)
export const REMINDERS_ADMIN = [1440];
export const COLOR = { available: '9', held: '8', booked: '11' } as const; // Blueberry, Graphite, Tomato
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const SLOT_MIN = 60;

/* ── Waktu ───────────────────────────────────────────────── */
const pad = (n: number) => String(n).padStart(2, '0');
export const hm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** Tanggal dan menit lokal WIB dari waktu UTC. */
export function toLocal(utc: Date): { date: string; min: number; weekday: number } {
  const l = new Date(utc.getTime() + TZ_OFFSET_MIN * 60_000);
  return { date: `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}`, min: l.getUTCHours() * 60 + l.getUTCMinutes(), weekday: l.getUTCDay() };
}
/** Waktu UTC dari tanggal dan menit lokal WIB. */
export function fromLocal(date: string, min: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, min) - TZ_OFFSET_MIN * 60_000);
}
/** Tanggal pertama (>= fromDate) yang jatuh pada hari tertentu, dalam kalender WIB. */
export function firstDateOnWeekday(weekday: number, fromDate: string): string {
  const [y, m, d] = fromDate.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const add = (weekday - base.getUTCDay() + 7) % 7;
  const t = new Date(base.getTime() + add * 864e5);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
/** ID kejadian dari acara berulang, format Google: <id>_YYYYMMDDTHHMMSSZ (waktu mulai asli, UTC). */
export function instanceId(eventId: string, startUtc: Date): string {
  return `${eventId}_${startUtc.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`;
}

/* ── Pola ketersediaan ───────────────────────────────────── */
export interface Rule {
  id: string; weekday: number; start_min: number; end_min: number; active: boolean;
  modes?: 'private' | 'group' | 'both'; valid_from?: string; valid_until?: string | null;
  gcal_events: { start_min: number; id: string; from?: string; until?: string | null }[];
}
const MODE_TEXT = { private: 'Private', group: 'Kelas bersama', both: 'Private/bersama' } as const;
/** Batas akhir RRULE: 23.59.59 WIB pada tanggal itu, dalam UTC. */
export const untilUtc = (date: string) => `${date.replace(/-/g, '')}T165959Z`;

export function slotStarts(rule: Pick<Rule, 'start_min' | 'end_min'>): number[] {
  const out: number[] = [];
  for (let m = rule.start_min; m + SLOT_MIN <= rule.end_min; m += SLOT_MIN) out.push(m);
  return out;
}

/** ID acara berulang yang mewakili slot jam ini, bila ada. */
export function findSlotEvent(rules: Rule[], startUtc: Date): string | null {
  const l = toLocal(startUtc);
  for (const r of rules) {
    if (!r.active || r.weekday !== l.weekday) continue;
    if ((r.valid_from && l.date < r.valid_from) || (r.valid_until && l.date > r.valid_until)) continue;
    const e = r.gcal_events.find((x) => x.start_min === l.min);
    if (e && slotStarts(r).includes(l.min)) return e.id;
  }
  return null;
}

/* ── Klien Google Calendar ───────────────────────────────── */
export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; ok: boolean; json(): Promise<any>; text(): Promise<string> }>;
export class GoogleError extends Error { constructor(public status: number, message: string) { super(message); } }

export class Gcal {
  constructor(private token: string, private fetchImpl: FetchLike) {}
  private async call(method: string, path: string, body?: unknown, query: Record<string, string> = {}) {
    const q = new URLSearchParams(query).toString();
    const res = await this.fetchImpl(`https://www.googleapis.com/calendar/v3${path}${q ? `?${q}` : ''}`, {
      method, headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return { status: 204, data: null };
    if (!res.ok) throw new GoogleError(res.status, (await res.text()).slice(0, 300));
    return { status: res.status, data: await res.json() };
  }
  async createCalendar(summary: string): Promise<string> {
    return (await this.call('POST', '/calendars', { summary, timeZone: TZ, description: 'Jadwal les IE.Academie. Dikelola otomatis oleh website.' })).data.id;
  }
  async insert(cal: string, body: object, sendUpdates = 'none') { return (await this.call('POST', `/calendars/${enc(cal)}/events`, body, { sendUpdates })).data; }
  async patch(cal: string, id: string, body: object, sendUpdates = 'none') { return (await this.call('PATCH', `/calendars/${enc(cal)}/events/${enc(id)}`, body, { sendUpdates })).data; }
  async remove(cal: string, id: string, sendUpdates = 'none') {
    try { await this.call('DELETE', `/calendars/${enc(cal)}/events/${enc(id)}`, undefined, { sendUpdates }); }
    catch (e) { if (!(e instanceof GoogleError && (e.status === 404 || e.status === 410))) throw e; }
  }
  async busy(timeMin: Date, timeMax: Date): Promise<{ start: string; end: string }[]> {
    const r = await this.call('POST', '/freeBusy', { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), timeZone: TZ, items: [{ id: 'primary' }] });
    return r.data?.calendars?.primary?.busy ?? [];
  }
}
const enc = encodeURIComponent;
const isGone = (e: unknown) => e instanceof GoogleError && (e.status === 404 || e.status === 410);

/* ── Slot biru berulang ──────────────────────────────────── */
const availableBody = (r?: Pick<Rule, 'modes'>) => ({
  summary: `Tersedia${r?.modes ? ` (${MODE_TEXT[r.modes]})` : ''} · IE.Academie`,
  description: 'Slot terbuka untuk booking peserta IE.Academie. Berubah merah otomatis saat ada peserta yang booking.',
  colorId: COLOR.available, transparency: 'transparent', attendees: [],
  reminders: { useDefault: false, overrides: [] },
});

/**
 * Samakan acara berulang di kalender mentor dengan pola ketersediaannya.
 * Slot yang hilang dari pola dihentikan (UNTIL hari ini), bukan dihapus,
 * supaya riwayat sesi lama tetap ada. Mengembalikan gcal_events baru per pola.
 */
export async function syncRules(gc: Gcal, calendarId: string, rules: Rule[], today: string, now: Date): Promise<Record<string, Rule['gcal_events']>> {
  const out: Record<string, Rule['gcal_events']> = {};
  const until = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  for (const r of rules) {
    const ended = !!r.valid_until && r.valid_until < today;
    const want = r.active && !ended ? slotStarts(r) : [];
    const keep: Rule['gcal_events'] = [];
    for (const e of r.gcal_events) {
      const sameRange = (e.from === undefined || e.from === r.valid_from) && (e.until ?? null) === (r.valid_until ?? null);
      if (want.includes(e.start_min) && sameRange) { keep.push(e); continue; }
      try { await gc.patch(calendarId, e.id, { recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[r.weekday]};UNTIL=${until}`] }); }
      catch (err) { if (!isGone(err)) throw err; }
    }
    for (const m of want) {
      if (keep.some((e) => e.start_min === m)) continue;
      const from = r.valid_from && r.valid_from > today ? r.valid_from : today;
      const date = firstDateOnWeekday(r.weekday, from);
      if (r.valid_until && date > r.valid_until) continue;
      const ev = await gc.insert(calendarId, {
        ...availableBody(r),
        start: { dateTime: `${date}T${hm(m)}:00`, timeZone: TZ },
        end: { dateTime: `${date}T${hm(m + SLOT_MIN)}:00`, timeZone: TZ },
        recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[r.weekday]}${r.valid_until ? `;UNTIL=${untilUtc(r.valid_until)}` : ''}`],
      });
      keep.push({ start_min: m, id: ev.id, from: r.valid_from, until: r.valid_until ?? null });
    }
    out[r.id] = keep.sort((a, b) => a.start_min - b.start_min);
  }
  return out;
}

/* ── Sesi ────────────────────────────────────────────────── */
export interface SessionView {
  id: string; code: string; status: 'scheduled' | 'done' | 'cancelled'; mode: 'private' | 'group';
  starts_at: string; ends_at: string; place: string; place_kind?: 'online' | 'offline' | 'diskusi'; pretest_url: string; posttest_url: string;
  course_code: string; course_title: string; topic: string;
  mentor: { name: string; email: string };
  students: { profile_id: string; name: string; email: string; paid: boolean }[];
  gcal_calendar_id: string | null; gcal_event_id: string | null; gcal_kind: 'instance' | 'single' | null; gcal_admin_event_id: string | null;
}
export interface Party { calendarId: string; gc: Gcal }
export interface SyncInput {
  session: SessionView;
  site: string;
  organizer: (Party & { kind: 'mentor' | 'admin' }) | null;
  mentorRules: Rule[];
  admin: Party | null;
  students: { profile_id: string; gc: Gcal }[];
  clientFor: (calendarId: string) => Gcal | null;
}
export interface SyncResult { calendarId: string | null; eventId: string | null; kind: 'instance' | 'single' | null; adminEventId: string | null; reminders: Record<string, boolean> }

export function sessionTitle(s: SessionView): string {
  const paid = s.students.filter((x) => x.paid);
  if (!paid.length) return `Ditahan · menunggu pembayaran · ${s.course_code}`;
  const names = paid.map((x) => x.name.split(' ')[0] || x.email).join(', ');
  return s.mode === 'private'
    ? `IE.Academie · ${s.course_code} · Private · ${names}`
    : `IE.Academie · ${s.course_code} · Kelas bersama ${paid.length}/5 · ${names}`;
}

export function sessionDescription(s: SessionView, site: string): string {
  const paid = s.students.filter((x) => x.paid);
  const lines = [`Kode sesi: ${s.code}`, `Mata kuliah: ${s.course_code} ${s.course_title}`];
  if (s.topic) lines.push(`Topik: ${s.topic}`);
  lines.push(`Mentor: ${s.mentor.name}`);
  if (paid.length) lines.push(`Peserta: ${paid.map((x) => x.name || x.email).join(', ')}`);
  if (s.place_kind === 'diskusi') lines.push('Tempat: dibahas lewat WhatsApp dengan mentor (lihat halaman sesi).');
  else if (s.place) lines.push(`${s.place_kind === 'offline' ? 'Tempat' : 'Kelas online'}: ${s.place}`);
  lines.push('');
  if (s.pretest_url) lines.push(`Pretest (kerjakan sebelum sesi): ${s.pretest_url}`);
  if (s.posttest_url) lines.push(`Posttest (kerjakan di akhir sesi): ${s.posttest_url}`);
  lines.push(`Detail sesi: ${site}/sesi/${s.id}`, '', 'Pengingat: H-5, H-3, H-1, 6 jam, dan 1 jam sebelum sesi.');
  return lines.join('\n');
}

export async function syncSession(input: SyncInput): Promise<SyncResult> {
  const { session: s, organizer, admin, site } = input;
  const paid = s.students.filter((x) => x.paid);
  const active = s.status !== 'cancelled' && s.students.length > 0;
  const booked = active && paid.length > 0;
  const result: SyncResult = { calendarId: s.gcal_calendar_id, eventId: s.gcal_event_id, kind: s.gcal_kind, adminEventId: s.gcal_admin_event_id, reminders: {} };

  // 1. Penyelenggara berganti (mis. mentor baru menyambungkan Google): bersihkan acara lama.
  if (s.gcal_event_id && s.gcal_calendar_id && (!organizer || organizer.calendarId !== s.gcal_calendar_id)) {
    const old = input.clientFor(s.gcal_calendar_id);
    if (old) await releaseEvent(old, s.gcal_calendar_id, s.gcal_event_id, s.gcal_kind);
    Object.assign(result, { calendarId: null, eventId: null, kind: null });
  }

  // 2. Acara di kalender penyelenggara.
  if (organizer) {
    const cal = organizer.calendarId;
    if (!active) {
      if (result.eventId && result.calendarId === cal) await releaseEvent(organizer.gc, cal, result.eventId, result.kind);
      Object.assign(result, { calendarId: null, eventId: null, kind: null });
    } else {
      const attendees = booked
        ? [...paid.map((x) => ({ email: x.email, displayName: x.name || undefined })), ...(organizer.kind === 'admin' ? [{ email: s.mentor.email, displayName: s.mentor.name }] : [])]
        : [];
      const body = {
        summary: sessionTitle(s), description: sessionDescription(s, site), location: s.place || undefined,
        colorId: booked ? COLOR.booked : COLOR.held, transparency: 'opaque', attendees,
        reminders: booked ? { useDefault: false, overrides: (organizer.kind === 'mentor' ? REMINDERS_FULL : REMINDERS_ADMIN).map((minutes) => ({ method: 'popup', minutes })) } : { useDefault: false, overrides: [] },
      };
      const timed = { start: { dateTime: s.starts_at, timeZone: TZ }, end: { dateTime: s.ends_at, timeZone: TZ } };
      const send = booked ? 'all' : 'none';
      let done = false;
      if (result.eventId && result.calendarId === cal) {
        try { await organizer.gc.patch(cal, result.eventId, result.kind === 'single' ? { ...body, ...timed } : body, send); done = true; }
        catch (e) { if (!isGone(e)) throw e; }
      }
      if (!done && organizer.kind === 'mentor') {
        const base = findSlotEvent(input.mentorRules, new Date(s.starts_at));
        if (base) {
          const iid = instanceId(base, new Date(s.starts_at));
          try { await organizer.gc.patch(cal, iid, body, send); Object.assign(result, { calendarId: cal, eventId: iid, kind: 'instance' }); done = true; }
          catch (e) { if (!isGone(e)) throw e; }
        }
      }
      if (!done) {
        const ev = await organizer.gc.insert(cal, { ...body, ...timed }, send);
        Object.assign(result, { calendarId: cal, eventId: ev.id, kind: 'single' });
      }
    }
  }

  // 3. Salinan admin (H-1 saja), hanya untuk sesi yang sudah dibayar.
  if (admin && organizer?.kind !== 'admin') {
    if (booked) {
      const body = {
        summary: sessionTitle(s), description: sessionDescription(s, site), location: s.place || undefined, colorId: COLOR.booked,
        start: { dateTime: s.starts_at, timeZone: TZ }, end: { dateTime: s.ends_at, timeZone: TZ },
        reminders: { useDefault: false, overrides: REMINDERS_ADMIN.map((minutes) => ({ method: 'popup', minutes })) },
      };
      let ok = false;
      if (result.adminEventId) { try { await admin.gc.patch(admin.calendarId, result.adminEventId, body); ok = true; } catch (e) { if (!isGone(e)) throw e; } }
      if (!ok) result.adminEventId = (await admin.gc.insert(admin.calendarId, body)).id;
    } else if (result.adminEventId) {
      await admin.gc.remove(admin.calendarId, result.adminEventId);
      result.adminEventId = null;
    }
  }

  // 4. Pengingat 5 kali di salinan acara milik peserta yang tersambung.
  if (booked && result.eventId && organizer) {
    for (const st of input.students) {
      if (!paid.some((x) => x.profile_id === st.profile_id)) continue;
      try {
        await st.gc.patch('primary', result.eventId, { reminders: { useDefault: false, overrides: REMINDERS_FULL.map((minutes) => ({ method: 'popup', minutes })) } });
        result.reminders[st.profile_id] = true;
      } catch (e) {
        if (!isGone(e)) throw e;
        result.reminders[st.profile_id] = false; // undangan belum sampai; dicoba lagi oleh cron
      }
    }
  }
  return result;
}

/** Lepas acara: kejadian berulang dikembalikan biru, acara tunggal dihapus. Tamu menerima email pembatalan dari Google. */
async function releaseEvent(gc: Gcal, cal: string, id: string, kind: 'instance' | 'single' | null) {
  if (kind === 'instance') {
    try { await gc.patch(cal, id, availableBody(), 'all'); } catch (e) { if (!isGone(e)) throw e; }
  } else {
    await gc.remove(cal, id, 'all');
  }
}
