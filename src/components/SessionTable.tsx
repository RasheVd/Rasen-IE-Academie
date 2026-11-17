/**
 * Tampilan tabel (spreadsheet) untuk sesi: satu baris per sesi, bisa dicari, difilter, diurutkan,
 * dan diunduh sebagai CSV yang langsung bisa dibuka di Google Sheets atau Excel.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { seatInfo } from '../domain/slots';
import { addDays, longDate, shortDate, timeOf, toLocal } from '../domain/time';
import { GROUP_MAX, MODE_LABEL, PLACE_LABEL, type Data, type Session } from '../domain/types';

type Range = 'next30' | 'month' | 'past30' | 'all';
type Who = 'admin' | 'mentor' | 'student';

export interface SessionRow {
  s: Session; code: string; date: string; time: string; course: string; topic: string; mentor: string; mode: string;
  seats: number; seatText: string; seatTone: 'ok' | 'warn' | 'bad'; students: string; paid: number; pending: number;
  place: string; pretest: string; posttest: string; status: string;
}

export function sessionRows(data: Data, list: Session[]): SessionRow[] {
  return list.map((s) => {
    const course = data.courses.find((c) => c.id === s.course_id);
    const topic = data.topics.find((t) => t.id === s.topic_id);
    const seats = data.seats.filter((x) => x.session_id === s.id);
    const info = s.mode === 'group' ? seatInfo(seats.length) : null;
    const name = (id: string) => data.profiles.find((p) => p.id === id)?.full_name ?? '';
    const ended = Date.parse(s.ends_at) < Date.now();
    return {
      s, code: s.code, date: toLocal(s.starts_at).date, time: `${timeOf(s.starts_at)}–${timeOf(s.ends_at)}`,
      course: `${course?.code ?? ''} · ${course?.title ?? ''}`, topic: topic?.title ?? '', mentor: name(s.mentor_id), mode: MODE_LABEL[s.mode],
      seats: seats.length, seatText: info ? info.text : `${seats.length}/1`, seatTone: info ? info.tone : seats.length ? 'ok' : 'warn',
      students: seats.map((x) => name(x.student_id)).join(', '),
      paid: seats.filter((x) => x.payment_status === 'paid').length, pending: seats.filter((x) => x.payment_status === 'pending').length,
      place: s.place_kind === 'diskusi' ? PLACE_LABEL.diskusi : `${PLACE_LABEL[s.place_kind]}${s.place ? `: ${s.place}` : ''}`,
      pretest: s.pretest_url || topic?.pretest_url || '', posttest: s.posttest_url || topic?.posttest_url || '',
      status: s.status === 'cancelled' ? 'Batal' : s.status === 'done' ? 'Selesai' : ended ? 'Perlu laporan' : 'Terjadwal',
    };
  });
}

const csvCell = (v: unknown) => { const t = String(v ?? ''); return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export function downloadCsv(name: string, header: string[], rows: unknown[][]) {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function SessionTable({ data, sessions, who }: { data: Data; sessions: Session[]; who: Who }) {
  const today = toLocal(Date.now()).date;
  const [range, setRange] = useState<Range>('next30');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [desc, setDesc] = useState(false);
  const rows = useMemo(() => {
    const inRange = (d: string) => range === 'all' ? true
      : range === 'next30' ? d >= today && d <= addDays(today, 30)
      : range === 'past30' ? d < today && d >= addDays(today, -30)
      : d.slice(0, 7) === today.slice(0, 7);
    const needle = q.trim().toLowerCase();
    return sessionRows(data, sessions)
      .filter((r) => inRange(r.date) && (!status || r.status === status))
      .filter((r) => !needle || [r.code, r.course, r.topic, r.mentor, r.students, r.place].some((v) => v.toLowerCase().includes(needle)))
      .sort((a, b) => (desc ? -1 : 1) * a.s.starts_at.localeCompare(b.s.starts_at));
  }, [data, sessions, range, status, q, desc, today]);

  const showPeople = who !== 'student';
  const header = ['Kode', 'Tanggal', 'Jam (WIB)', 'Mata kuliah', 'Topik', 'Mentor', 'Jenis', 'Kursi', ...(showPeople ? ['Peserta', 'Lunas', 'Menunggu bayar'] : []), 'Tempat', 'Pretest', 'Posttest', 'Status'];
  const exportCsv = () => downloadCsv(`academie-sesi-${today}.csv`, header, rows.map((r) => [
    r.code, r.date, r.time, r.course, r.topic, r.mentor, r.mode, r.s.mode === 'group' ? `${r.seats}/${GROUP_MAX}` : `${r.seats}/1`,
    ...(showPeople ? [r.students, r.paid, r.pending] : []), r.place, r.pretest, r.posttest, r.status,
  ]));

  return (
    <div className="stack">
      <div className="row wrap between">
        <div className="row wrap">
          <div className="seg sm" role="group" aria-label="Rentang">
            {([['next30', '30 hari ke depan'], ['month', 'Bulan ini'], ['past30', '30 hari lalu'], ['all', 'Semua']] as [Range, string][]).map(([k, l]) =>
              <button key={k} aria-pressed={range === k} onClick={() => setRange(k)}>{l}</button>)}
          </div>
          <select className="select sm" style={{ width: 170 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">Semua status</option>{['Terjadwal', 'Perlu laporan', 'Selesai', 'Batal'].map((x) => <option key={x}>{x}</option>)}
          </select>
          <input className="input sm" style={{ width: 220 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode, nama, tempat" aria-label="Cari" />
        </div>
        <button className="btn sm" onClick={exportCsv} disabled={!rows.length}><Icon name="download" size={14} />Unduh CSV ({rows.length})</button>
      </div>
      <div className="sheet-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th>Kode</th>
              <th><button className="sort" onClick={() => setDesc(!desc)} aria-label="Urutkan tanggal">Tanggal <Icon name={desc ? 'arrowDown' : 'arrowUp'} size={12} /></button></th>
              <th>Jam</th><th>Mata kuliah</th><th>Topik</th>{who !== 'mentor' && <th>Mentor</th>}<th>Jenis</th><th>Kursi</th>
              {showPeople && <><th>Peserta</th><th>Bayar</th></>}
              <th>Tempat</th><th>Tes</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.s.id} className={r.status === 'Batal' ? 'off' : ''}>
                <td className="nowrap"><Link to={`/sesi/${r.s.id}`} className="strong">{r.code}</Link></td>
                <td className="nowrap">{shortDate(r.date)}<span className="tiny muted"> {longDate(r.date).split(',')[0]}</span></td>
                <td className="num nowrap">{r.time}</td>
                <td className="clip" title={r.course}>{r.course.split(' · ')[1] || r.course}</td>
                <td className="clip" title={r.topic}>{r.topic || <span className="faint">–</span>}</td>
                {who !== 'mentor' && <td>{r.mentor}</td>}
                <td className="nowrap">{r.mode}</td>
                <td><span className={`seat ${r.seatTone}`}>{r.seatTone !== 'ok' && <Icon name="alert" size={11} />}{r.seatText}</span></td>
                {showPeople && <><td className="clip" title={r.students}>{r.students || <span className="faint">–</span>}</td>
                  <td className="nowrap">{r.paid} lunas{r.pending ? <span className="seat warn" style={{ marginLeft: 4 }}>{r.pending} menunggu</span> : null}</td></>}
                <td className="clip" title={r.place}>{r.place}</td>
                <td className="nowrap">
                  {r.pretest ? <a href={r.pretest} target="_blank" rel="noreferrer">Pre</a> : <span className="seat warn">Pre –</span>}{' '}
                  {r.posttest ? <a href={r.posttest} target="_blank" rel="noreferrer">Post</a> : <span className="seat warn">Post –</span>}
                </td>
                <td className="nowrap">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted small" style={{ padding: 16 }}>Tidak ada sesi di rentang ini.</p>}
      </div>
      <p className="tiny muted">CSV bisa dibuka di Google Sheets: File, Impor, Unggah. Jam dalam WIB.</p>
    </div>
  );
}
