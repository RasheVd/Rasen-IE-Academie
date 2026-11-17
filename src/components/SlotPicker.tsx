import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { Empty } from './ui';
import { WaButton } from './bits';
import { bookingOptions, useData } from '../store';
import { availableSlots, bookable, groupByDate, seatInfo, type Slot } from '../domain/slots';
import { dayShort, hm, longDate, rupiah } from '../domain/time';
import { GROUP_MAX, type BookingOptions, type Mode } from '../domain/types';

/** Pilih tanggal lalu jam dari slot mentor yang kompeten. Data diambil dari academie_booking_options. */
export function SlotPicker({ courseId, mode, mentorId, excludeSession, onPick, onMentors }: {
  courseId: string; mode: Mode; mentorId?: string; excludeSession?: string; onPick: (s: Slot) => void;
  onMentors?: (m: BookingOptions['mentors']) => void;
}) {
  const data = useData();
  const s = data.settings;
  const [opt, setOpt] = useState<BookingOptions | null>(null);
  const [err, setErr] = useState('');
  const [day, setDay] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setOpt(null); setErr(''); setDay(null);
    bookingOptions(courseId).then((o) => { if (live) { setOpt(o); onMentors?.(o.mentors); } }).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => {
    if (!opt) return [];
    const slots = availableSlots(opt, { courseId, mode, mentorId: mentorId || undefined, now: Date.now(), cutoffHours: s.booking_cutoff_hours, horizonDays: s.booking_horizon_days, includeTaken: !excludeSession })
      .filter((x) => !excludeSession || x.join?.session_id !== excludeSession);
    // Hari tanpa slot yang bisa dibooking tetap tampil bila ada kelas penuh, supaya peserta tahu jam itu sudah terisi.
    return groupByDate(slots);
  }, [opt, courseId, mode, mentorId, excludeSession, s]);
  const firstOpen = days.find((d) => d.slots.some(bookable));
  const current = days.find((d) => d.date === day) ?? firstOpen ?? days[0];

  if (err) return <p className="error" role="alert" style={{ color: 'var(--danger)' }}>{err}</p>;
  if (!opt) return <div className="row muted"><div className="spinner" />Mencari jam kosong…</div>;
  if (!opt.mentors.length) return (
    <Empty title="Belum ada mentor untuk mata kuliah ini" action={<WaButton phone={s.admin_whatsapp} text="Halo admin IE.Academie, belum ada mentor untuk mata kuliah saya di website." label="Kabari admin" sm />}>
      Admin sedang mencarikan mentor. Kabari admin supaya diprioritaskan.
    </Empty>
  );
  if (!firstOpen) return (
    <Empty title="Belum ada jam kosong" action={<WaButton phone={s.admin_whatsapp} text="Halo admin IE.Academie, saya tidak menemukan jam kosong untuk booking." label="Minta jadwal ke admin" sm />}>
      Semua slot {mode === 'group' ? 'kelas bersama ' : 'private '}dalam {s.booking_horizon_days} hari ke depan sudah terisi atau kurang dari {s.booking_cutoff_hours} jam lagi. Coba jenis kelas atau mentor lain.
    </Empty>
  );
  const mentorName = (id: string) => opt.mentors.find((m) => m.id === id)?.full_name ?? 'Mentor';
  const price = mode === 'private' ? s.price_private : s.price_group;
  return (
    <div className="stack">
      <div className="days" role="group" aria-label="Pilih tanggal">
        {days.map((d) => {
          const n = d.slots.filter(bookable).length;
          return (
            <button key={d.date} className={`day-btn ${n ? '' : 'none'}`} aria-pressed={current?.date === d.date} onClick={() => setDay(d.date)} aria-label={`${longDate(d.date)}, ${n} slot bisa dibooking`}>
              <span className="d">{dayShort(d.date)}</span><span className="n">{Number(d.date.slice(8))}</span><span className="c">{n ? `${n} slot` : 'penuh'}</span>
            </button>
          );
        })}
      </div>
      {current && (
        <>
          <div className="small muted">{longDate(current.date)} · jam dalam WIB</div>
          <div className="slots">
            {current.slots.map((sl) => <SlotCard key={`${sl.mentor_id}${sl.starts_at}`} sl={sl} mode={mode} price={price} mentor={mentorName(sl.mentor_id)}
              topic={sl.join?.topic_id ? data.topics.find((t) => t.id === sl.join!.topic_id)?.title : undefined} onPick={onPick} />)}
          </div>
        </>
      )}
    </div>
  );
}

/** Satu jam: harga, jenis, kursi, tempat. Jam penuh/terisi tetap tampil tetapi tidak bisa diklik. */
function SlotCard({ sl, mode, price, mentor, topic, onPick }: { sl: Slot; mode: Mode; price: number; mentor: string; topic?: string; onPick: (s: Slot) => void }) {
  const place = sl.place_kind === 'diskusi' ? 'Tempat via WA' : sl.place_kind === 'offline' ? 'Tatap muka' : 'Online';
  const time = <span className="t num">{hm(sl.min)}–{hm(sl.min + 60)}</span>;
  if (!bookable(sl)) {
    const label = sl.state === 'full' ? `PENUH ${GROUP_MAX}/${GROUP_MAX}` : sl.state === 'closed' ? 'Kelas bersama tertutup' : sl.takenMode === 'group' ? 'Dipakai kelas bersama' : 'Sudah dibooking';
    return (
      <div className={`slot ${sl.state}`} aria-disabled="true" role="note" aria-label={`${hm(sl.min)} ${label}`}>
        {time}<span className="s">{mentor}</span>
        <span className="tag">{sl.state === 'full' && <Icon name="alert" size={12} />}{label}</span>
      </div>
    );
  }
  const info = sl.join ? seatInfo(sl.join.seats) : null;
  return (
    <button className={`slot ${sl.join ? 'join' : ''} ${info && info.tone !== 'ok' ? 'warn' : ''}`} onClick={() => onPick(sl)}>
      {time}<span className="s">{mentor} · {place}</span>
      {sl.join ? (
        <span className="tag">{info!.tone !== 'ok' && <Icon name="alert" size={12} />}Gabung · {info!.text}{topic ? ` · ${topic}` : ''}</span>
      ) : (
        <span className="tag">{mode === 'private' ? `Private · ${rupiah(price)}` : `Buka kelas · ${rupiah(price)}/orang · ${sl.group_open ? 'terbuka' : 'tertutup'}`}</span>
      )}
    </button>
  );
}
