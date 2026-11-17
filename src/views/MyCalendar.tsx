import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { Icon } from '../components/Icon';
import { CalendarView, type CalBlock, type CalEvent, type CalView } from '../components/CalendarView';
import { SessionTable } from '../components/SessionTable';
import { PlaceEditor, PlaceInfo } from '../components/place';
import { ExtLink } from '../components/bits';
import { updatePrefs, useData, useMe } from '../store';
import { useTitle } from '../hooks';
import { seatInfo, ruleValidOn } from '../domain/slots';
import { addDays, toLocal, weekdayOf } from '../domain/time';
import { MODE_LABEL, RULE_MODE_LABEL, type Rule } from '../domain/types';
import { RuleForm } from './mentor/Availability';

export default function MyCalendar() {
  useTitle('Kalender');
  const me = useMe();
  const data = useData();
  const nav = useNavigate();
  const mentor = me.role === 'mentor';
  const [newRule, setNewRule] = useState<(Partial<Rule> & { weekday: number }) | null>(null);
  const view: CalView = me.prefs?.calendar_view ?? (typeof window !== 'undefined' && window.innerWidth < 700 ? 'day' : 'week');

  const mine = useMemo(() => data.sessions.filter((s) => s.status !== 'cancelled'
    && (mentor ? s.mentor_id === me.id : data.seats.some((x) => x.session_id === s.id && x.student_id === me.id))), [data, me.id, mentor]);

  const events = useMemo<CalEvent[]>(() => mine.map((s) => {
    const course = data.courses.find((c) => c.id === s.course_id);
    const topic = data.topics.find((t) => t.id === s.topic_id);
    const seats = data.seats.filter((x) => x.session_id === s.id);
    const mySeat = seats.find((x) => x.student_id === me.id);
    const names = seats.map((x) => data.profiles.find((p) => p.id === x.student_id)?.full_name.split(' ')[0] ?? 'Peserta');
    const pre = s.pretest_url || topic?.pretest_url, post = s.posttest_url || topic?.posttest_url;
    const sub = mentor ? `${MODE_LABEL[s.mode]} · ${names.join(', ') || 'kosong'}` : `${data.profiles.find((p) => p.id === s.mentor_id)?.full_name ?? 'Mentor'} · ${MODE_LABEL[s.mode]}`;
    const info = s.mode === 'group' ? seatInfo(seats.length) : null;
    return {
      id: s.id, start: s.starts_at, end: s.ends_at, to: `/sesi/${s.id}`,
      title: `${course?.code ?? ''} ${topic ? topic.title : course?.title ?? ''}`.trim(),
      sub, color: `var(--${course?.color ?? 'teal'})`,
      badge: info ? { text: info.text, tone: info.tone } : undefined,
      faded: s.status === 'done', dashed: mySeat?.payment_status === 'pending' || (mentor && !seats.some((x) => x.payment_status === 'paid')),
      detail: (
        <div className="stack sm">
          {s.status === 'done' && <span className="pill">Selesai</span>}
          {mySeat?.payment_status === 'pending' && <span className="pill warn">{mySeat.proof_path ? 'Menunggu konfirmasi bayar' : 'Belum dibayar'}</span>}
          <PlaceInfo s={s} compact />
          <div className="row wrap">
            {pre ? <ExtLink href={pre}>Pretest</ExtLink> : mentor && <span className="seat warn">Pretest belum ada</span>}
            {post ? <ExtLink href={post}>Posttest</ExtLink> : mentor && <span className="seat warn">Posttest belum ada</span>}
          </div>
          {mentor && s.status === 'scheduled' && (
            <details className="gc-edit">
              <summary className="small strong">Ubah tempat</summary>
              <PlaceEditor s={s} />
            </details>
          )}
        </div>
      ),
    };
  }), [mine, data, me.id, mentor]);

  // Jam tersedia dan libur mentor, 6 minggu ke belakang sampai 10 minggu ke depan, sesuai masa berlaku tiap pola.
  const blocks = useMemo<CalBlock[]>(() => {
    if (!mentor) return [];
    const out: CalBlock[] = [];
    const start = addDays(toLocal(Date.now()).date, -42);
    for (let i = 0; i < 112; i++) {
      const d = addDays(start, i);
      const off = data.exceptions.find((e) => e.mentor_id === me.id && d >= e.starts_on && d <= e.ends_on);
      if (off) { out.push({ date: d, from: 6 * 60, to: 24 * 60, label: `Libur${off.reason ? `: ${off.reason}` : ''}`, kind: 'off' }); continue; }
      for (const r of data.rules.filter((x) => x.mentor_id === me.id && x.active && x.weekday === weekdayOf(d) && ruleValidOn(x, d))) {
        out.push({ date: d, from: r.start_min, to: r.end_min, label: `Tersedia · ${RULE_MODE_LABEL[r.modes]}${r.modes !== 'private' ? (r.group_open ? ' · terbuka' : ' · tertutup') : ''}`, kind: 'free' });
      }
    }
    return out;
  }, [data, me.id, mentor]);

  function openSlot(date: string, min: number) {
    if (!mentor) { nav('/booking'); return; }
    const wd = weekdayOf(date);
    const inside = data.rules.some((r) => r.mentor_id === me.id && r.active && r.weekday === wd && ruleValidOn(r, date) && min >= r.start_min && min < r.end_min);
    if (inside || min + 60 > 24 * 60) return;
    setNewRule({ weekday: wd, start_min: min, end_min: min + 60, valid_from: date });
  }

  return (
    <Shell title="Kalender">
      <CalendarView
        events={events} blocks={blocks} view={view} onView={(v) => updatePrefs({ calendar_view: v })}
        onSlot={openSlot} slotHint={mentor ? 'Klik jam kosong untuk membuka jam mengajar' : 'Klik untuk booking sesi'}
        table={<SessionTable data={data} sessions={mine} who={mentor ? 'mentor' : 'student'} />}
        toolbarExtra={mentor
          ? <Link className="btn primary sm" to="/ketersediaan"><Icon name="clock" size={14} />Atur jam</Link>
          : <Link className="btn primary sm" to="/booking"><Icon name="plus" size={14} />Booking</Link>}
        sideExtra={
          <div className="gc-legend stack sm">
            <div className="tiny muted strong">Keterangan</div>
            <span className="row small"><i className="gc-key ev" />Sesi {mentor ? 'mengajar' : 'kamu'}</span>
            <span className="row small"><i className="gc-key dashed" />{mentor ? 'Belum ada yang bayar' : 'Menunggu pembayaran'}</span>
            <span className="row small"><i className="gc-key warn" />Kelas bersama sisa 1–2 kursi</span>
            <span className="row small"><i className="gc-key full" />Kelas bersama penuh</span>
            {mentor && <span className="row small"><i className="gc-key free" />Jam tersedia</span>}
            {mentor && <span className="row small"><i className="gc-key off" />Libur</span>}
            <span className="row small"><i className="gc-key faded" />Sudah selesai</span>
          </div>
        }
      />
      {newRule && <RuleForm initial={newRule} mentor={me} onClose={() => setNewRule(null)} />}
    </Shell>
  );
}
