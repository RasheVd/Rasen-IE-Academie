/**
 * Kalender dengan cara pakai yang dikenal dari aplikasi kalender umum:
 * tampilan Hari / Minggu / Bulan, tombol Hari ini, panah, mini kalender, garis waktu sekarang,
 * popover saat acara diklik, dan pintasan keyboard (t, d, w, m, j/n, k/p, Esc).
 * Semua jam dalam WIB. Minggu dimulai hari Senin.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { useNow } from '../hooks';
import { addDays, dayShort, hm, longDate, mondayOf, monthLabel, shortDate, toLocal, weekdayOf } from '../domain/time';

export type CalView = 'day' | 'week' | 'month';
export interface CalEvent {
  id: string; start: string; end: string; title: string; sub?: string;
  color: string;            // nilai CSS, mis. 'var(--teal)'
  faded?: boolean;          // batal / selesai
  dashed?: boolean;         // menunggu bayar
  detail?: ReactNode;       // isi popover tambahan
  to?: string;              // tautan detail
}
/** Blok latar (jam tersedia, libur) per tanggal WIB. */
export interface CalBlock { date: string; from: number; to: number; label: string; kind: 'free' | 'off' }

const HOUR_PX = 48;
const FIRST_HOUR = 6, LAST_HOUR = 24;

export function CalendarView({ events, blocks = [], view, onView, onSlot, slotHint, toolbarExtra, sideExtra }: {
  events: CalEvent[]; blocks?: CalBlock[]; view: CalView; onView: (v: CalView) => void;
  onSlot?: (date: string, min: number) => void; slotHint?: string; toolbarExtra?: ReactNode; sideExtra?: ReactNode;
}) {
  const now = useNow();
  const today = toLocal(now).date;
  const [cursor, setCursor] = useState(today);
  const [open, setOpen] = useState<{ ev: CalEvent; x: number; y: number } | null>(null);

  const days = useMemo(() => {
    if (view === 'day') return [cursor];
    if (view === 'week') { const m = mondayOf(cursor); return Array.from({ length: 7 }, (_, i) => addDays(m, i)); }
    const first = cursor.slice(0, 8) + '01';
    const start = mondayOf(first);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [view, cursor]);

  const step = (dir: 1 | -1) => {
    setOpen(null);
    if (view === 'day') setCursor(addDays(cursor, dir));
    else if (view === 'week') setCursor(addDays(cursor, 7 * dir));
    else { const [y, m] = cursor.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + dir, 1)); setCursor(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`); }
  };

  // Pintasan keyboard, diabaikan saat mengetik di kolom isian.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      const k = e.key.toLowerCase();
      if (k === 't') { setCursor(today); setOpen(null); }
      else if (k === 'd') onView('day');
      else if (k === 'w') onView('week');
      else if (k === 'm') onView('month');
      else if (k === 'j' || k === 'n') step(1);
      else if (k === 'k' || k === 'p') step(-1);
      else if (k === 'escape') setOpen(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const title = view === 'month' ? monthLabel(cursor)
    : view === 'day' ? longDate(cursor)
    : (() => { const a = days[0], b = days[6]; return a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8))} – ${shortDate(b)} ${a.slice(0, 4)}` : `${shortDate(a)} – ${shortDate(b)} ${b.slice(0, 4)}`; })();

  const byDate = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const ev of events) { const d = toLocal(ev.start).date; (m.get(d) ?? m.set(d, []).get(d)!).push(ev); }
    for (const l of m.values()) l.sort((a, b) => a.start.localeCompare(b.start));
    return m;
  }, [events]);

  const openEvent = (ev: CalEvent, e: React.MouseEvent | React.KeyboardEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setOpen({ ev, x: r.right + 8, y: r.top });
  };

  return (
    <div className="gc">
      <aside className="gc-side">
        <MiniMonth value={cursor} today={today} marked={byDate} onPick={(d) => { setCursor(d); if (view === 'month') onView('day'); }} />
        {sideExtra}
        <div className="gc-keys tiny muted">Pintasan: <kbd>t</kbd> hari ini · <kbd>d</kbd> <kbd>w</kbd> <kbd>m</kbd> tampilan · <kbd>j</kbd> <kbd>k</kbd> maju/mundur</div>
      </aside>
      <div className="gc-main">
        <div className="gc-bar">
          <button className="btn sm" onClick={() => { setCursor(today); setOpen(null); }}>Hari ini</button>
          <button className="btn ghost icon sm" aria-label="Sebelumnya" onClick={() => step(-1)}><Icon name="chevL" /></button>
          <button className="btn ghost icon sm" aria-label="Berikutnya" onClick={() => step(1)}><Icon name="chevR" /></button>
          <h2 className="gc-title" aria-live="polite">{title}</h2>
          <div className="ml-auto row wrap">
            {toolbarExtra}
            <div className="seg" role="group" aria-label="Tampilan">
              {(['day', 'week', 'month'] as CalView[]).map((v) => <button key={v} aria-pressed={view === v} onClick={() => onView(v)}>{v === 'day' ? 'Hari' : v === 'week' ? 'Minggu' : 'Bulan'}</button>)}
            </div>
          </div>
        </div>
        {view === 'month'
          ? <MonthGrid days={days} cursor={cursor} today={today} byDate={byDate} onDay={(d) => { setCursor(d); onView('day'); }} onEvent={openEvent} />
          : <TimeGrid days={days} today={today} now={now} byDate={byDate} blocks={blocks} onEvent={openEvent} onSlot={onSlot} slotHint={slotHint} onDay={(d) => { setCursor(d); onView('day'); }} />}
      </div>
      {open && <Popover ev={open.ev} x={open.x} y={open.y} onClose={() => setOpen(null)} />}
    </div>
  );
}

function MiniMonth({ value, today, marked, onPick }: { value: string; today: string; marked: Map<string, CalEvent[]>; onPick: (d: string) => void }) {
  const [month, setMonth] = useState(value.slice(0, 7));
  useEffect(() => setMonth(value.slice(0, 7)), [value]);
  const start = mondayOf(month + '-01');
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const shift = (n: number) => { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`); };
  return (
    <div className="gc-mini">
      <div className="row between"><span className="strong small">{monthLabel(month + '-01')}</span>
        <span className="row" style={{ gap: 0 }}><button className="btn ghost icon sm" aria-label="Bulan sebelumnya" onClick={() => shift(-1)}><Icon name="chevL" size={14} /></button><button className="btn ghost icon sm" aria-label="Bulan berikutnya" onClick={() => shift(1)}><Icon name="chevR" size={14} /></button></span>
      </div>
      <div className="gc-mini-grid" role="grid" aria-label={`Kalender ${monthLabel(month + '-01')}`}>
        {['S', 'S', 'R', 'K', 'J', 'S', 'M'].map((d, i) => <span key={i} className="gc-mini-h" aria-hidden="true">{d}</span>)}
        {cells.map((d) => (
          <button key={d} className={`gc-mini-d ${d.slice(0, 7) !== month ? 'out' : ''} ${d === today ? 'today' : ''} ${d === value ? 'sel' : ''}`}
            onClick={() => onPick(d)} aria-label={longDate(d)} aria-current={d === today ? 'date' : undefined}>
            {Number(d.slice(8))}{marked.has(d) && <i aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Taruh acara yang bertumpuk berdampingan. */
function lanes(list: CalEvent[]) {
  const out: { ev: CalEvent; lane: number; lanes: number }[] = [];
  let group: typeof out = [], groupEnd = 0;
  const flush = () => { const n = Math.max(...group.map((g) => g.lane)) + 1; group.forEach((g) => (g.lanes = n)); out.push(...group); group = []; };
  for (const ev of list) {
    const s = Date.parse(ev.start), e = Date.parse(ev.end);
    if (group.length && s >= groupEnd) flush();
    const used = new Set(group.filter((g) => Date.parse(g.ev.end) > s).map((g) => g.lane));
    let lane = 0; while (used.has(lane)) lane++;
    group.push({ ev, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, e);
  }
  if (group.length) flush();
  return out;
}

function TimeGrid({ days, today, now, byDate, blocks, onEvent, onSlot, slotHint, onDay }: {
  days: string[]; today: string; now: number; byDate: Map<string, CalEvent[]>; blocks: CalBlock[];
  onEvent: (ev: CalEvent, e: React.MouseEvent | React.KeyboardEvent) => void; onSlot?: (date: string, min: number) => void; slotHint?: string; onDay: (d: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);
  const nowL = toLocal(now);
  useLayoutEffect(() => {
    const target = days.includes(today) ? Math.max(FIRST_HOUR, Math.floor(nowL.min / 60) - 1) : 7;
    scroller.current?.scrollTo({ top: (target - FIRST_HOUR) * HOUR_PX });
  }, [days.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const y = (min: number) => ((min - FIRST_HOUR * 60) / 60) * HOUR_PX;
  return (
    <div className="gc-time" style={{ ['--cols' as string]: days.length }}>
      <div className="gc-head">
        <div className="gc-gutter tiny muted">WIB</div>
        {days.map((d) => (
          <button key={d} className={`gc-dayhead ${d === today ? 'today' : ''}`} onClick={() => onDay(d)} aria-label={longDate(d)}>
            <span className="dw">{dayShort(d)}</span><span className="dn">{Number(d.slice(8))}</span>
          </button>
        ))}
      </div>
      <div className="gc-scroll" ref={scroller}>
        <div className="gc-body" style={{ height: hours.length * HOUR_PX }}>
          <div className="gc-gutter">{hours.map((h) => <span key={h} style={{ top: (h - FIRST_HOUR) * HOUR_PX }}>{h === FIRST_HOUR ? '' : hm(h * 60)}</span>)}</div>
          {days.map((d) => (
            <div key={d} className={`gc-col ${weekdayOf(d) === 0 || weekdayOf(d) === 6 ? 'weekend' : ''}`}
              onClick={onSlot ? (e) => { if (e.target !== e.currentTarget) return; const r = e.currentTarget.getBoundingClientRect(); const min = FIRST_HOUR * 60 + Math.floor((e.clientY - r.top) / HOUR_PX) * 60; onSlot(d, min); } : undefined}
              title={onSlot ? slotHint : undefined}>
              {blocks.filter((b) => b.date === d).map((b, i) => (
                <div key={i} className={`gc-block ${b.kind}`} style={{ top: y(b.from), height: y(b.to) - y(b.from) }} aria-hidden="true"><span>{b.label}</span></div>
              ))}
              {lanes(byDate.get(d) ?? []).map(({ ev, lane, lanes: n }) => {
                const s = toLocal(ev.start).min, e = Math.max(s + 20, toLocal(ev.end).min || 24 * 60);
                return (
                  <button key={ev.id} className={`gc-ev ${ev.faded ? 'faded' : ''} ${ev.dashed ? 'dashed' : ''}`}
                    style={{ top: y(s), height: Math.max(22, y(e) - y(s) - 2), left: `calc(${(lane / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)`, ['--ev' as string]: ev.color }}
                    onClick={(x) => onEvent(ev, x)} aria-label={`${ev.title}, ${hm(s)} sampai ${hm(e)}`}>
                    <b>{ev.title}</b><span>{hm(s)}–{hm(e)}{ev.sub ? ` · ${ev.sub}` : ''}</span>
                  </button>
                );
              })}
              {d === today && nowL.min >= FIRST_HOUR * 60 && <div className="gc-now" style={{ top: y(nowL.min) }} aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({ days, cursor, today, byDate, onDay, onEvent }: {
  days: string[]; cursor: string; today: string; byDate: Map<string, CalEvent[]>; onDay: (d: string) => void;
  onEvent: (ev: CalEvent, e: React.MouseEvent | React.KeyboardEvent) => void;
}) {
  return (
    <div className="gc-month">
      {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => <div key={d} className="gc-mh tiny muted strong">{d}</div>)}
      {days.map((d) => {
        const list = byDate.get(d) ?? [];
        return (
          <div key={d} className={`gc-mcell ${d.slice(0, 7) !== cursor.slice(0, 7) ? 'out' : ''}`}>
            <button className={`gc-mnum ${d === today ? 'today' : ''}`} onClick={() => onDay(d)} aria-label={longDate(d)}>{Number(d.slice(8))}</button>
            {list.slice(0, 3).map((ev) => (
              <button key={ev.id} className={`gc-chip ${ev.faded ? 'faded' : ''}`} style={{ ['--ev' as string]: ev.color }} onClick={(e) => onEvent(ev, e)}>
                <i aria-hidden="true" />{hm(toLocal(ev.start).min)} {ev.title}
              </button>
            ))}
            {list.length > 3 && <button className="gc-more" onClick={() => onDay(d)}>{list.length - 3} lagi</button>}
          </div>
        );
      })}
    </div>
  );
}

function Popover({ ev, x, y, onClose }: { ev: CalEvent; x: number; y: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = x, top = y;
    if (left + w > window.innerWidth - 12) left = Math.max(12, x - w - 24);
    if (top + h > window.innerHeight - 12) top = Math.max(12, window.innerHeight - h - 12);
    if (window.innerWidth < 600) { left = 12; top = Math.max(12, window.innerHeight - h - 12); }
    setPos({ left, top });
    el.querySelector<HTMLElement>('button, a')?.focus();
  }, [x, y]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
    return () => document.removeEventListener('mousedown', close);
  }, [onClose]);
  const s = toLocal(ev.start), e = toLocal(ev.end);
  return (
    <div className="gc-pop" ref={ref} role="dialog" aria-label={ev.title} style={{ left: pos.left, top: pos.top }}>
      <div className="row between"><span className="gc-swatch" style={{ background: ev.color }} /><button className="btn ghost icon sm" onClick={onClose} aria-label="Tutup"><Icon name="close" /></button></div>
      <div className="h-card">{ev.title}</div>
      <div className="small muted">{longDate(s.date)} · {hm(s.min)}–{hm(e.min)} WIB</div>
      {ev.sub && <div className="small">{ev.sub}</div>}
      {ev.detail}
      {ev.to && <Link className="btn sm primary" to={ev.to} onClick={onClose}>Buka detail</Link>}
    </div>
  );
}
