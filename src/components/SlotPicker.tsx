import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { Empty } from './ui';
import { WaButton } from './bits';
import { bookingOptions, useData } from '../store';
import { availableSlots, groupByDate, type Slot } from '../domain/slots';
import { dayShort, hm, longDate } from '../domain/time';
import type { BookingOptions, Mode } from '../domain/types';

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
    const slots = availableSlots(opt, { courseId, mode, mentorId: mentorId || undefined, now: Date.now(), cutoffHours: s.booking_cutoff_hours, horizonDays: s.booking_horizon_days })
      .filter((x) => !excludeSession || x.join?.session_id !== excludeSession);
    return groupByDate(slots);
  }, [opt, courseId, mode, mentorId, excludeSession, s]);
  const current = days.find((d) => d.date === day) ?? days[0];

  if (err) return <p className="error" role="alert" style={{ color: 'var(--danger)' }}>{err}</p>;
  if (!opt) return <div className="row muted"><div className="spinner" />Mencari jam kosong…</div>;
  if (!opt.mentors.length) return (
    <Empty title="Belum ada mentor untuk mata kuliah ini" action={<WaButton phone={s.admin_whatsapp} text="Halo admin IE.Academie, belum ada mentor untuk mata kuliah saya di website." label="Kabari admin" sm />}>
      Admin sedang mencarikan mentor. Kabari admin supaya diprioritaskan.
    </Empty>
  );
  if (!days.length) return (
    <Empty title="Belum ada jam kosong" action={<WaButton phone={s.admin_whatsapp} text="Halo admin IE.Academie, saya tidak menemukan jam kosong untuk booking." label="Minta jadwal ke admin" sm />}>
      Semua slot {mode === 'group' ? 'kelas bersama ' : ''}dalam {s.booking_horizon_days} hari ke depan sudah terisi atau kurang dari {s.booking_cutoff_hours} jam lagi. Coba jenis kelas atau mentor lain.
    </Empty>
  );
  const mentorName = (id: string) => opt.mentors.find((m) => m.id === id)?.full_name ?? 'Mentor';
  return (
    <div className="stack">
      <div className="days" role="group" aria-label="Pilih tanggal">
        {days.map((d) => (
          <button key={d.date} className="day-btn" aria-pressed={current?.date === d.date} onClick={() => setDay(d.date)} aria-label={`${longDate(d.date)}, ${d.slots.length} slot`}>
            <span className="d">{dayShort(d.date)}</span><span className="n">{Number(d.date.slice(8))}</span><span className="c">{d.slots.length} slot</span>
          </button>
        ))}
      </div>
      {current && (
        <>
          <div className="small muted">{longDate(current.date)} · jam dalam WIB</div>
          <div className="slots">
            {current.slots.map((sl) => (
              <button key={`${sl.mentor_id}${sl.starts_at}`} className={`slot ${sl.join ? 'join' : ''}`} onClick={() => onPick(sl)}>
                <span className="t num">{hm(sl.min)}–{hm(sl.min + 60)}</span>
                <span className="s">{mentorName(sl.mentor_id)}</span>
                {sl.join && (
                  <span className="s row" style={{ gap: 4 }}><Icon name="users" size={13} />Gabung kelas · {sl.join.seats}/5{sl.join.topic_id ? ` · ${data.topics.find((t) => t.id === sl.join!.topic_id)?.title ?? ''}` : ''}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
