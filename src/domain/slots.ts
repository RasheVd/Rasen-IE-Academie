/**
 * Slot booking dari pola ketersediaan mentor. Logika yang sama dijaga ulang di
 * database (academie__book), jadi ini hanya untuk menampilkan pilihan.
 */
import type { BookingOptions, Mode } from './types';
import { addDays, fromLocal, toLocal } from './time';

export interface Slot {
  mentor_id: string;
  starts_at: string;      // ISO UTC
  date: string;           // WIB
  min: number;            // menit WIB
  join?: { session_id: string; seats: number; topic_id: string | null }; // kelas bersama yang bisa diikuti
}

export function availableSlots(opt: BookingOptions, p: { courseId: string; mode: Mode; now: number; cutoffHours: number; horizonDays: number; mentorId?: string }): Slot[] {
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
      for (const r of rules.filter((x) => x.weekday === wd)) {
        for (let min = r.start_min; min + 60 <= r.end_min; min += 60) {
          const start = fromLocal(date, min).getTime(), end = start + 3_600_000;
          if (start < earliest || start > latest) continue;
          if (busy.some((b) => overlaps(start, end, b.s, b.e))) continue;
          const hit = taken.find((t) => overlaps(start, end, t.s, t.e));
          if (hit) {
            if (p.mode === 'group' && hit.mode === 'group' && hit.is_open && hit.course_id === p.courseId && hit.s === start && hit.seats < 5) {
              out.push({ mentor_id: m.id, starts_at: new Date(start).toISOString(), date, min, join: { session_id: hit.id, seats: hit.seats, topic_id: hit.topic_id } });
            }
            continue;
          }
          out.push({ mentor_id: m.id, starts_at: new Date(start).toISOString(), date, min });
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
