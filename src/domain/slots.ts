/**
 * Slot booking dari pola ketersediaan mentor. Logika yang sama dijaga ulang di
 * database (academie__book), jadi ini hanya untuk menampilkan pilihan.
 *
 * Slot yang sudah terisi tidak dibuang bila diminta (includeTaken): peserta melihat
 * kelas bersama yang penuh (merah), tertutup, atau jam yang sudah dibooking orang lain.
 */
import { GROUP_MAX, type BookingOptions, type Mode, type PlaceKind } from './types';
import { addDays, fromLocal, toLocal } from './time';

/** free: bisa dibooking · join: kelas bersama yang bisa diikuti · full: kelas bersama penuh · closed: kelas bersama tertutup · taken: sudah dibooking. */
export type SlotState = 'free' | 'join' | 'full' | 'closed' | 'taken';

export interface Slot {
  mentor_id: string;
  starts_at: string;      // ISO UTC
  date: string;           // WIB
  min: number;            // menit WIB
  state: SlotState;
  modes: 'private' | 'group' | 'both';
  group_open: boolean;    // status kelas bersama baru di slot ini
  place_kind: PlaceKind;
  seats?: number;         // jumlah peserta bila sudah ada sesi
  takenMode?: Mode;       // jenis sesi yang mengisi slot
  join?: { session_id: string; seats: number; topic_id: string | null }; // kelas bersama yang bisa diikuti
}

export const bookable = (s: Pick<Slot, 'state'>) => s.state === 'free' || s.state === 'join';

/** Berlaku di tanggal ini? valid_from/valid_until boleh kosong (data lama). */
export function ruleValidOn(r: { valid_from?: string | null; valid_until?: string | null }, date: string): boolean {
  return (!r.valid_from || date >= r.valid_from) && (!r.valid_until || date <= r.valid_until);
}

/** Sisa kursi kelas bersama dan tingkat peringatannya. */
export function seatInfo(seats: number): { left: number; tone: 'ok' | 'warn' | 'bad'; text: string } {
  const left = Math.max(0, GROUP_MAX - seats);
  if (left === 0) return { left, tone: 'bad', text: `Penuh ${seats}/${GROUP_MAX}` };
  if (left <= 2) return { left, tone: 'warn', text: `${seats}/${GROUP_MAX} · sisa ${left} kursi` };
  return { left, tone: 'ok', text: `${seats}/${GROUP_MAX} · sisa ${left} kursi` };
}

export function availableSlots(opt: BookingOptions, p: {
  courseId: string; mode: Mode; now: number; cutoffHours: number; horizonDays: number; mentorId?: string; includeTaken?: boolean;
}): Slot[] {
  const earliest = p.now + p.cutoffHours * 3_600_000;
  const latest = p.now + p.horizonDays * 864e5;
  const today = toLocal(p.now).date;
  const out: Slot[] = [];
  const mentors = opt.mentors.filter((m) => !p.mentorId || m.id === p.mentorId);
  const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;

  for (const m of mentors) {
    const rules = opt.rules.filter((r) => r.mentor_id === m.id && (r.modes === 'both' || r.modes === p.mode));
    const taken = opt.sessions.filter((s) => s.mentor_id === m.id).map((s) => ({ ...s, s: Date.parse(s.starts_at), e: Date.parse(s.ends_at) }));
    const busy = opt.busy.filter((b) => b.mentor_id === m.id).map((b) => ({ s: Date.parse(b.starts_at), e: Date.parse(b.ends_at) }));
    const off = opt.exceptions.filter((e) => e.mentor_id === m.id);
    for (let i = 0; i <= p.horizonDays; i++) {
      const date = addDays(today, i);
      if (off.some((e) => date >= e.starts_on && date <= e.ends_on)) continue;
      const wd = toLocal(fromLocal(date, 12 * 60)).weekday;
      for (const r of rules.filter((x) => x.weekday === wd && ruleValidOn(x, date))) {
        for (let min = r.start_min; min + 60 <= r.end_min; min += 60) {
          const start = fromLocal(date, min).getTime(), end = start + 3_600_000;
          if (start < earliest || start > latest) continue;
          if (busy.some((b) => overlaps(start, end, b.s, b.e))) continue;
          const base = {
            mentor_id: m.id, starts_at: new Date(start).toISOString(), date, min,
            modes: r.modes, group_open: r.group_open ?? true, place_kind: r.place_kind ?? 'online',
          } as const;
          const hit = taken.find((t) => overlaps(start, end, t.s, t.e));
          if (!hit) { out.push({ ...base, state: 'free' }); continue; }
          const sameGroup = hit.mode === 'group' && hit.s === start && hit.course_id === p.courseId;
          let state: SlotState = 'taken';
          if (sameGroup && hit.seats >= GROUP_MAX) state = 'full';
          else if (sameGroup && !hit.is_open) state = 'closed';
          else if (sameGroup && p.mode === 'group') state = 'join';
          if (state !== 'join' && !p.includeTaken) continue;
          out.push({
            ...base, state, seats: hit.seats, takenMode: hit.mode, group_open: hit.is_open,
            ...(state === 'join' ? { join: { session_id: hit.id, seats: hit.seats, topic_id: hit.topic_id } } : {}),
          });
        }
      }
    }
  }
  // Satu slot per mentor per jam (pola bisa tumpang tindih setelah diedit), urut waktu.
  const seen = new Set<string>();
  return out
    .filter((s) => { const k = `${s.mentor_id}|${s.starts_at}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.mentor_id.localeCompare(b.mentor_id));
}

/** Kelompokkan slot per tanggal untuk tampilan kalender. */
export function groupByDate(slots: Slot[]): { date: string; slots: Slot[] }[] {
  const map = new Map<string, Slot[]>();
  for (const s of slots) (map.get(s.date) ?? map.set(s.date, []).get(s.date)!).push(s);
  return [...map.entries()].map(([date, list]) => ({ date, slots: list }));
}
