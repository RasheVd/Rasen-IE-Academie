import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { useData } from '../../store';
import { useTitle } from '../../hooks';
import { addDays, dayShort, fromLocal, hm, mondayOf, shortDate, toLocal } from '../../domain/time';
import { MODE_LABEL } from '../../domain/types';

type Ev = { key: string; kind: 'free' | 'held' | 'booked' | 'done'; min: number; label: string; sub: string; to?: string };

export default function MasterCalendar() {
  useTitle('Kalender induk');
  const data = useData();
  const today = toLocal(Date.now()).date;
  const [week, setWeek] = useState(mondayOf(today));
  const [course, setCourse] = useState('');
  const [mentor, setMentor] = useState('');
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const mentors = data.profiles.filter((p) => p.role === 'mentor' && p.active && (!mentor || p.id === mentor)
    && (!course || data.mentorCourses.some((m) => m.mentor_id === p.id && m.course_id === course && m.status === 'approved')));
  const first = (name: string) => name.split(' ').slice(0, 2).join(' ');

  const { cells, hours } = useMemo(() => {
    const cells = new Map<string, Ev[]>();
    const push = (date: string, ev: Ev) => { const k = `${date}|${Math.floor(ev.min / 60)}`; (cells.get(k) ?? cells.set(k, []).get(k)!).push(ev); };
    let lo = 8, hi = 21;
    const ids = new Set(mentors.map((m) => m.id));
    const sessions = data.sessions.filter((s) => s.status !== 'cancelled' && ids.has(s.mentor_id) && (!course || s.course_id === course));
    for (const s of sessions) {
      const l = toLocal(s.starts_at);
      if (l.date < week || l.date > addDays(week, 6)) continue;
      const seats = data.seats.filter((x) => x.session_id === s.id);
      const names = seats.map((x) => first(data.profiles.find((p) => p.id === x.student_id)?.full_name ?? 'Peserta').split(' ')[0]);
      const paid = seats.some((x) => x.payment_status === 'paid');
      const c = data.courses.find((x) => x.id === s.course_id);
      lo = Math.min(lo, Math.floor(l.min / 60)); hi = Math.max(hi, Math.ceil((l.min + s.duration_min) / 60));
      push(l.date, {
        key: s.id, kind: s.status === 'done' ? 'done' : paid ? 'booked' : 'held', min: l.min, to: `/sesi/${s.id}`,
        label: `${c?.code ?? ''} · ${names.join(', ') || 'kosong'}`,
        sub: `${first(data.profiles.find((p) => p.id === s.mentor_id)?.full_name ?? '')} · ${MODE_LABEL[s.mode]}${s.mode === 'group' ? ` ${seats.length}/5` : ''}${paid ? '' : ' · menunggu bayar'}`,
      });
    }
    for (const m of mentors) {
      for (const date of days) {
        if (data.exceptions.some((e) => e.mentor_id === m.id && date >= e.starts_on && date <= e.ends_on)) continue;
        const wd = toLocal(fromLocal(date, 720)).weekday;
        for (const r of data.rules.filter((x) => x.mentor_id === m.id && x.active && x.weekday === wd)) {
          for (let min = r.start_min; min + 60 <= r.end_min; min += 60) {
            const st = fromLocal(date, min).getTime();
            if (sessions.some((s) => s.mentor_id === m.id && Date.parse(s.starts_at) < st + 3_600_000 && Date.parse(s.ends_at) > st)) continue;
            lo = Math.min(lo, Math.floor(min / 60)); hi = Math.max(hi, Math.ceil((min + 60) / 60));
            push(date, { key: `${m.id}${date}${min}`, kind: 'free', min, label: first(m.full_name), sub: r.modes === 'both' ? 'Private/bersama' : r.modes === 'private' ? 'Private' : 'Bersama' });
          }
        }
      }
    }
    return { cells, hours: Array.from({ length: Math.max(1, hi - lo) }, (_, i) => lo + i) };
  }, [data, week, course, mentor]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Shell title="Kalender induk">
      <div className="page-head">
        <div><h1 className="h-page">Kalender induk</h1><p className="lead">Semua mentor dalam satu minggu. Sama dengan warna di Google Calendar mentor.</p></div>
        <div className="row wrap">
          <button className="btn icon" aria-label="Minggu sebelumnya" onClick={() => setWeek(addDays(week, -7))}><Icon name="chevL" /></button>
          <button className="btn" onClick={() => setWeek(mondayOf(today))}>Minggu ini</button>
          <button className="btn icon" aria-label="Minggu berikutnya" onClick={() => setWeek(addDays(week, 7))}><Icon name="chevR" /></button>
          <span className="strong">{shortDate(week)} – {shortDate(addDays(week, 6))}</span>
        </div>
      </div>
      <div className="row wrap between">
        <div className="row wrap">
          <select className="select sm" style={{ width: 240 }} value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Filter mata kuliah">
            <option value="">Semua mata kuliah</option>{data.courses.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
          </select>
          <select className="select sm" style={{ width: 200 }} value={mentor} onChange={(e) => setMentor(e.target.value)} aria-label="Filter mentor">
            <option value="">Semua mentor</option>{data.profiles.filter((p) => p.role === 'mentor').map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
        <div className="cal-legend"><span><i className="free" />Tersedia</span><span><i className="held" />Ditahan, menunggu bayar</span><span><i className="booked" />Terbooking</span></div>
      </div>
      <div className="cal" role="grid" aria-label="Kalender minggu ini">
        <div className="hd" />
        {days.map((d) => <div key={d} className={`hd ${d === today ? 'today' : ''}`} role="columnheader">{dayShort(d)} {Number(d.slice(8))}</div>)}
        {hours.map((h) => (
          <div key={h} style={{ display: 'contents' }} role="row">
            <div className="hr">{hm(h * 60)}</div>
            {days.map((d) => (
              <div key={d} className="cell" role="gridcell">
                {(cells.get(`${d}|${h}`) ?? []).sort((a, b) => order(a.kind) - order(b.kind)).map((ev) => {
                  const body = <><b>{ev.label}</b><br />{ev.sub}</>;
                  return ev.to ? <Link key={ev.key} to={ev.to} className={`ev ${ev.kind}`}>{body}</Link> : <div key={ev.key} className={`ev ${ev.kind}`}>{body}</div>;
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
      {mentors.length === 0 && <p className="muted small">Tidak ada mentor yang cocok dengan filter.</p>}
    </Shell>
  );
}
const order = (k: Ev['kind']) => ({ booked: 0, held: 1, done: 2, free: 3 })[k];
