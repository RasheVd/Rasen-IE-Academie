/** Hak mentor per bulan (MoU Pasal 4): dihitung dari sesi berstatus Selesai, termasuk peserta yang tidak hadir. */
import type { Data, Session } from './types';
import { monthKey } from './time';

export interface MonthEarning { mentorId: string; month: string; sessions: Session[]; privateCount: number; groupCount: number; amount: number; paid: number }

export function earnings(data: Data, mentorId?: string): MonthEarning[] {
  const map = new Map<string, MonthEarning>();
  for (const s of data.sessions) {
    if (s.status !== 'done' || (mentorId && s.mentor_id !== mentorId)) continue;
    const month = monthKey(s.starts_at);
    const key = `${s.mentor_id}|${month}`;
    const e = map.get(key) ?? { mentorId: s.mentor_id, month, sessions: [], privateCount: 0, groupCount: 0, amount: 0, paid: 0 };
    e.sessions.push(s);
    if (s.mode === 'private') { e.privateCount++; e.amount += data.settings.mentor_share_private; }
    else { e.groupCount++; e.amount += data.settings.mentor_share_group; }
    map.set(key, e);
  }
  for (const p of data.payouts) {
    const key = `${p.mentor_id}|${p.month.slice(0, 7)}`;
    const e = map.get(key);
    if (e) e.paid += p.amount;
  }
  return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
}
