/** Waktu WIB (UTC+7, tanpa daylight saving). Semua jam di IE.Academie ditampilkan dalam WIB. */
const OFFSET = 7 * 60;
const pad = (n: number) => String(n).padStart(2, '0');
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const DAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export interface Local { date: string; min: number; weekday: number; y: number; m: number; d: number }
export function toLocal(t: Date | string | number): Local {
  const u = new Date(t);
  const l = new Date(u.getTime() + OFFSET * 60_000);
  const y = l.getUTCFullYear(), m = l.getUTCMonth() + 1, d = l.getUTCDate();
  return { date: `${y}-${pad(m)}-${pad(d)}`, min: l.getUTCHours() * 60 + l.getUTCMinutes(), weekday: l.getUTCDay(), y, m, d };
}
export function fromLocal(date: string, min: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, min) - OFFSET * 60_000);
}
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
/** Senin dari minggu yang memuat tanggal ini. */
export function mondayOf(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}
export const hm = (min: number) => `${pad(Math.floor(min / 60))}.${pad(min % 60)}`;
export const timeOf = (t: string | Date) => hm(toLocal(t).min);
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Hari ini';
  if (date === addDays(today, 1)) return 'Besok';
  return DAYS[weekdayOf(date)];
}
export function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${DAYS[weekdayOf(date)]}, ${d} ${MONTHS[m - 1]} ${y}`;
}
export function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}
export const dayShort = (date: string) => DAYS_SHORT[weekdayOf(date)];
export const monthLabel = (date: string) => { const [y, m] = date.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
export const monthKey = (t: string | Date) => toLocal(t).date.slice(0, 7);
export function rupiah(n: number): string {
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}
/** "dalam 3 jam", "2 hari lagi" untuk batas waktu. */
export function until(t: string | Date | number, now = Date.now()): string {
  const ms = new Date(t).getTime() - now;
  if (ms <= 0) return 'sudah lewat';
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} menit lagi`;
  if (h < 48) return `${h} jam lagi`;
  return `${Math.floor(h / 24)} hari lagi`;
}
