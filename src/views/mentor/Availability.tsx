import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { Field, Modal, confirmDialog } from '../../components/ui';
import { useAction } from '../../components/bits';
import { GoogleBanner } from '../../components/google';
import { removeException, removeRule, requestCompetency, saveException, saveRule, setCompetency, useData, useMe, useStore } from '../../store';
import { useTitle } from '../../hooks';
import { availableSlots } from '../../domain/slots';
import { hm, longDate, rupiah, shortDate, toLocal, weekdayOf } from '../../domain/time';
import { GROUP_MAX, PLACE_LABEL, RULE_MODE_LABEL, WEEKDAYS, groupCourses, type Data, type PlaceKind, type Profile, type Rule } from '../../domain/types';

const ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Jam tersedia adalah hak mentor. Admin membuka halaman ini untuk melihat jam mentor mana pun, tanpa tombol ubah. */
export default function Availability() {
  const me = useMe();
  const data = useData();
  const admin = me.role === 'admin';
  useTitle(admin ? 'Jam mentor' : 'Ketersediaan');
  const [params, setParams] = useSearchParams();
  const mentors = data.profiles.filter((p) => p.role === 'mentor' && p.active);
  const target = admin ? mentors.find((m) => m.id === params.get('mentor')) ?? mentors[0] : me;
  return (
    <Shell title={admin ? 'Jam mentor' : 'Ketersediaan'}>
      <div className="page-head">
        <div>
          <h1 className="h-page">{admin ? 'Jam mentor' : 'Ketersediaan'}</h1>
          <p className="lead">{admin
            ? 'Mentor mengatur jamnya sendiri. Di sini kamu melihat jam, jenis kelas, tempat, dan masa berlakunya.'
            : `Kamu menentukan jam, jenis kelas, tempat, dan sampai kapan jadwal berlaku. Peserta booking slot 60 menit paling lambat ${data.settings.booking_cutoff_hours} jam sebelumnya.`}</p>
        </div>
        {admin && mentors.length > 0 && (
          <select className="select" style={{ maxWidth: 280 }} value={target?.id ?? ''} onChange={(e) => setParams({ mentor: e.target.value })} aria-label="Pilih mentor">
            {mentors.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        )}
      </div>
      {!admin && <GoogleBanner returnPath="/ketersediaan" />}
      {!admin && <Competencies data={data} me={me} />}
      {target ? (
        <>
          <WeeklyRules data={data} mentor={target} readOnly={admin} />
          <Exceptions data={data} mentor={target} readOnly={admin} />
        </>
      ) : <div className="card"><p className="muted">Belum ada mentor aktif.</p></div>}
    </Shell>
  );
}

export function Competencies({ data, me }: { data: Data; me: Profile }) {
  const { busy, run } = useAction();
  const [pick, setPick] = useState('');
  const mine = data.mentorCourses.filter((x) => x.mentor_id === me.id);
  return (
    <section className="card stack" id="kompetensi">
      <div className="card-head" style={{ marginBottom: 0 }}><div><div className="h-card">Mata kuliah yang kamu ajar</div><div className="sub">Pilih dari katalog. Peserta melihatmu setelah admin menyetujui.</div></div></div>
      <div className="row wrap">
        {mine.length === 0 && <span className="small muted">Belum ada.</span>}
        {mine.map((x) => {
          const c = data.courses.find((y) => y.id === x.course_id);
          return (
            <span key={x.course_id} className="chip" style={{ ['--c' as string]: `var(--${c?.color ?? 'teal'})` }}>
              {c?.code} · {c?.title}
              <span className={`pill ${x.status === 'approved' ? 'ok' : 'warn'}`} style={{ marginLeft: 4 }}>{x.status === 'approved' ? 'Disetujui' : 'Menunggu'}</span>
              {x.status === 'pending' && <button className="btn ghost icon sm" style={{ width: 22, minHeight: 22 }} aria-label={`Tarik ${c?.title}`} onClick={() => run('w', () => setCompetency(me.id, x.course_id, null))}><Icon name="close" size={12} /></button>}
            </span>
          );
        })}
      </div>
      <div className="row wrap">
        <select className="select" style={{ maxWidth: 380 }} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Pilih mata kuliah">
          <option value="">Tambah mata kuliah…</option>
          {groupCourses(data.courses.filter((c) => c.active && !mine.some((m) => m.course_id === c.id))).map(([g, list]) => (
            <optgroup key={g} label={g}>{list.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</optgroup>
          ))}
        </select>
        <button className="btn" disabled={!pick || !!busy} onClick={() => run('a', async () => { await requestCompetency(me.id, pick); setPick(''); }, 'Diajukan. Admin akan meninjau.')}>Ajukan</button>
      </div>
    </section>
  );
}

/** Ringkasan satu pola untuk chip dan tabel: jenis, status kelas bersama, tempat, masa berlaku. */
export function ruleSummary(r: Pick<Rule, 'modes' | 'group_open' | 'place_kind' | 'place' | 'valid_from' | 'valid_until'>, today: string) {
  const parts = [RULE_MODE_LABEL[r.modes]];
  if (r.modes !== 'private') parts.push(r.group_open ? 'bersama terbuka' : 'bersama tertutup');
  parts.push(r.place_kind === 'diskusi' ? 'tempat via WA' : r.place_kind === 'offline' ? (r.place || 'tatap muka') : 'online');
  if (r.valid_until && r.valid_until === r.valid_from) parts.push(`hanya ${shortDate(r.valid_from)}`);
  else {
    if (r.valid_from > today) parts.push(`mulai ${shortDate(r.valid_from)}`);
    if (r.valid_until) parts.push(r.valid_until < today ? `berakhir ${shortDate(r.valid_until)}` : `s.d. ${shortDate(r.valid_until)}`);
  }
  return parts.join(' · ');
}

function WeeklyRules({ data, mentor, readOnly }: { data: Data; mentor: Profile; readOnly: boolean }) {
  const { run } = useAction();
  const [edit, setEdit] = useState<Partial<Rule> & { weekday: number } | null>(null);
  const gcal = useStore((r) => r.gcal);
  const today = toLocal(Date.now()).date;
  const rules = data.rules.filter((r) => r.mentor_id === mentor.id);
  const preview = useMemo(() => {
    const mineSessions = data.sessions.filter((s) => s.mentor_id === mentor.id && s.status === 'scheduled').map((s) => ({ ...s, seats: data.seats.filter((x) => x.session_id === s.id).length }));
    const opt = {
      mentors: [{ id: mentor.id, full_name: mentor.full_name, bio: '' }],
      rules: rules.filter((r) => r.active),
      exceptions: data.exceptions.filter((e) => e.mentor_id === mentor.id), busy: [], sessions: mineSessions,
    };
    const base = { courseId: '', now: Date.now(), cutoffHours: data.settings.booking_cutoff_hours, horizonDays: 14 };
    return new Set([...availableSlots(opt, { ...base, mode: 'private' }), ...availableSlots(opt, { ...base, mode: 'group' })].filter((s) => !s.join).map((s) => s.starts_at)).size;
  }, [data, mentor, rules]);
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="h-card">{readOnly ? `Jam ${mentor.full_name}` : 'Jam mengajar'}</div>
          <div className="sub">{preview} slot kosong dalam 14 hari ke depan{!readOnly && gcal?.connected ? ' · tersinkron ke Google Calendar (biru)' : ''}</div>
        </div>
        {readOnly && <Link className="btn sm" to={`/orang/${mentor.id}`}>Profil mentor</Link>}
      </div>
      <div className="week-rules">
        {ORDER.map((wd) => {
          const list = rules.filter((r) => r.weekday === wd).sort((a, b) => a.start_min - b.start_min || a.valid_from.localeCompare(b.valid_from));
          return (
            <div key={wd} className="wr">
              <div className="day">{WEEKDAYS[wd]}</div>
              <div className="row wrap">
                {list.length === 0 && <span className="small faint">Tidak tersedia</span>}
                {list.map((r) => {
                  const ended = !!r.valid_until && r.valid_until < today;
                  return (
                    <span key={r.id} className={`rule-chip ${r.active && !ended ? '' : 'off'}`}>
                      <b className="num">{hm(r.start_min)}–{hm(r.end_min)}</b> <span style={{ fontWeight: 500 }}>· {ruleSummary(r, today)}{r.active ? '' : ' · nonaktif'}</span>
                      {!readOnly && <>
                        <button aria-label={`Ubah ${WEEKDAYS[wd]} ${hm(r.start_min)}`} onClick={() => setEdit(r)}><Icon name="edit" size={13} /></button>
                        <button aria-label={`Hapus ${WEEKDAYS[wd]} ${hm(r.start_min)}`} onClick={async () => {
                          if (await confirmDialog({ title: 'Hapus jam ini?', body: `${WEEKDAYS[wd]} ${hm(r.start_min)}–${hm(r.end_min)}. Sesi yang sudah dibooking tetap berjalan.`, confirm: 'Hapus', danger: true }))
                            run('d', () => removeRule(r.id), 'Jam dihapus.');
                        }}><Icon name="trash" size={13} /></button>
                      </>}
                    </span>
                  );
                })}
              </div>
              {!readOnly && <button className="btn sm" onClick={() => setEdit({ weekday: wd, start_min: 19 * 60, end_min: 21 * 60 })}><Icon name="plus" size={14} />Jam</button>}
            </div>
          );
        })}
      </div>
      {edit && <RuleForm initial={edit} mentor={mentor} onClose={() => setEdit(null)} />}
    </section>
  );
}

/** Form satu pola jam: hari atau tanggal, jam, jenis kelas, status kelas bersama, tempat, masa berlaku. Dipakai juga dari kalender. */
export function RuleForm({ initial, mentor, onClose }: { initial: Partial<Rule> & { weekday: number }; mentor: Profile; onClose: () => void }) {
  const { busy, run } = useAction();
  const s = useStore((r) => r.data.settings);
  const today = toLocal(Date.now()).date;
  const once = !!initial.valid_until && initial.valid_until === initial.valid_from;
  const [f, setF] = useState({
    repeat: once ? 'once' as const : 'weekly' as const,
    weekday: initial.weekday, start: initial.start_min ?? 19 * 60, end: initial.end_min ?? 21 * 60,
    modes: initial.modes ?? ('' as Rule['modes'] | ''), group_open: initial.group_open ?? true,
    place_kind: initial.place_kind ?? 'online' as PlaceKind, place: initial.place ?? '',
    from: initial.valid_from ?? today, until: initial.valid_until ?? '', active: initial.active ?? true,
  });
  const hours = Array.from({ length: 18 }, (_, i) => (6 + i) * 60);
  const weekday = f.repeat === 'once' ? weekdayOf(f.from) : f.weekday;
  const problems = [
    f.end <= f.start && 'Jam selesai harus setelah jam mulai.',
    !f.modes && 'Pilih jenis kelas.',
    f.place_kind === 'offline' && !f.place.trim() && 'Isi lokasi tatap muka.',
    f.place_kind === 'online' && f.place.trim() && !/^https?:\/\//i.test(f.place.trim()) && 'Tautan online harus diawali https://',
    f.repeat === 'weekly' && f.until && f.until < f.from && 'Tanggal "sampai" harus setelah tanggal mulai.',
  ].filter(Boolean) as string[];
  const slots = Math.max(0, (f.end - f.start) / 60);
  async function save() {
    await saveRule({
      id: initial.id, mentor_id: mentor.id, weekday, start_min: f.start, end_min: f.end, modes: f.modes as Rule['modes'], active: f.active,
      group_open: f.group_open, place_kind: f.place_kind, place: f.place,
      valid_from: f.from, valid_until: f.repeat === 'once' ? f.from : f.until || null,
    });
    onClose();
  }
  return (
    <Modal wide title={initial.id ? 'Ubah jam mengajar' : 'Buka jam mengajar'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Batal</button>
      <button className="btn primary" disabled={problems.length > 0 || !!busy} onClick={() => run('s', save, 'Jam tersimpan.')}>Simpan</button>
    </>}>
      <div className="stack">
        <div className="seg" role="group" aria-label="Pola jadwal">
          <button aria-pressed={f.repeat === 'weekly'} onClick={() => setF({ ...f, repeat: 'weekly' })}>Tiap minggu</button>
          <button aria-pressed={f.repeat === 'once'} onClick={() => setF({ ...f, repeat: 'once' })}>Sekali, satu tanggal</button>
        </div>
        <div className="form-grid">
          {f.repeat === 'weekly' ? (
            <Field label="Hari" className="full">{(id) => <select id={id} className="select" value={f.weekday} onChange={(e) => setF({ ...f, weekday: Number(e.target.value) })}>{ORDER.map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}</select>}</Field>
          ) : (
            <Field label="Tanggal" className="full" hint={longDate(f.from)}>{(id) => <input id={id} className="input" type="date" min={today} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value || today })} />}</Field>
          )}
          <Field label="Mulai">{(id) => <select id={id} className="select" value={f.start} onChange={(e) => setF({ ...f, start: Number(e.target.value) })}>{hours.map((h) => <option key={h} value={h}>{hm(h)}</option>)}</select>}</Field>
          <Field label="Selesai">{(id) => <select id={id} className="select" value={f.end} onChange={(e) => setF({ ...f, end: Number(e.target.value) })}>{[...hours.slice(1), 24 * 60].map((h) => <option key={h} value={h}>{hm(h)}</option>)}</select>}</Field>
          {f.repeat === 'weekly' && <>
            <Field label="Berlaku mulai">{(id) => <input id={id} className="input" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value || today })} />}</Field>
            <Field label="Sampai" hint={f.until ? `Terakhir ${longDate(f.until)}` : 'Kosongkan bila tanpa batas akhir'}>
              {(id) => <input id={id} className="input" type="date" min={f.from} value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} />}
            </Field>
          </>}
        </div>

        <div className="stack sm">
          <div className="strong small">Jenis kelas di jam ini</div>
          <div className="choice-grid">
            {(['private', 'group', 'both'] as const).map((m) => (
              <button key={m} type="button" className="choice" aria-pressed={f.modes === m} onClick={() => setF({ ...f, modes: m })}>
                <span className="t">{RULE_MODE_LABEL[m]}</span>
                <span className="s">{m === 'private' ? `${rupiah(s.price_private)} · 1 peserta` : m === 'group' ? `${rupiah(s.price_group)} per orang · maks ${GROUP_MAX}` : `Peserta memilih: ${rupiah(s.price_private)} atau ${rupiah(s.price_group)}/orang`}</span>
              </button>
            ))}
          </div>
        </div>

        {f.modes && f.modes !== 'private' && (
          <div className="stack sm">
            <div className="strong small">Kelas bersama yang dibuka di jam ini</div>
            <div className="choice-grid">
              <button type="button" className="choice" aria-pressed={f.group_open} onClick={() => setF({ ...f, group_open: true })}>
                <span className="t">Terbuka</span><span className="s">Peserta lain di mata kuliah yang sama bisa ikut sampai {GROUP_MAX} orang</span>
              </button>
              <button type="button" className="choice" aria-pressed={!f.group_open} onClick={() => setF({ ...f, group_open: false })}>
                <span className="t">Tertutup</span><span className="s">Hanya pembuka kelas. Teman ditambahkan admin.</span>
              </button>
            </div>
          </div>
        )}

        <div className="stack sm">
          <div className="strong small">Tempat</div>
          <div className="seg" role="group" aria-label="Jenis tempat">
            {(['online', 'offline', 'diskusi'] as const).map((k) => <button key={k} aria-pressed={f.place_kind === k} onClick={() => setF({ ...f, place_kind: k })}>{k === 'diskusi' ? 'Bahas lewat WA' : PLACE_LABEL[k]}</button>)}
          </div>
          {f.place_kind === 'online' && (
            <Field label="Tautan kelas online" hint={mentor.meeting_link ? `Kosongkan untuk memakai tautan di Akun: ${mentor.meeting_link}` : 'Google Meet atau Zoom. Bisa diisi nanti per sesi.'}>
              {(id) => <input id={id} className="input" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} placeholder="https://meet.google.com/…" />}
            </Field>
          )}
          {f.place_kind === 'offline' && (
            <Field label="Lokasi tatap muka">{(id) => <input id={id} className="input" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} placeholder="Perpustakaan ITS lantai 2" />}</Field>
          )}
          {f.place_kind === 'diskusi' && (
            <p className="small muted">Peserta melihat tombol WhatsApp ke nomormu {mentor.phone ? <b>{mentor.phone}</b> : <b style={{ color: 'var(--danger)' }}>(nomor belum diisi di Akun)</b>} untuk menyepakati tempat. Ubah tempat per sesi kapan saja dari kalender.</p>
          )}
        </div>

        {initial.id && <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Aktif (matikan untuk menutup sementara tanpa menghapus)</label>}
        {problems.length ? <p className="small" style={{ color: 'var(--danger)' }}>{problems[0]}</p>
          : <p className="small muted">{f.repeat === 'once' ? `${slots} slot pada ${longDate(f.from)}` : `${slots} slot tiap ${WEEKDAYS[weekday]}${f.until ? ` sampai ${longDate(f.until)}` : ', tanpa batas akhir'}`}. Satu slot 60 menit: pretest, materi, pembahasan, posttest.</p>}
      </div>
    </Modal>
  );
}

function Exceptions({ data, mentor, readOnly }: { data: Data; mentor: Profile; readOnly: boolean }) {
  const { busy, run } = useAction();
  const today = toLocal(Date.now()).date;
  const [f, setF] = useState({ starts_on: today, ends_on: today, reason: '' });
  const list = data.exceptions.filter((e) => e.mentor_id === mentor.id && e.ends_on >= today);
  return (
    <section className="card stack">
      <div><div className="h-card">Libur dan pengecualian</div><div className="sub small muted">Slot di tanggal ini disembunyikan. Sesi yang sudah dibooking tidak berubah; batalkan dari halaman sesi bila perlu.</div></div>
      {list.length === 0 && readOnly && <p className="small muted">Tidak ada libur ke depan.</p>}
      {list.length > 0 && (
        <div className="list">
          {list.map((e) => (
            <div key={e.id} className="list-item">
              <Icon name="calendar" size={16} className="faint" />
              <div className="grow"><div className="t">{e.starts_on === e.ends_on ? longDate(e.starts_on) : `${shortDate(e.starts_on)} sampai ${shortDate(e.ends_on)}`}</div>{e.reason && <div className="meta">{e.reason}</div>}</div>
              {!readOnly && <button className="btn ghost icon sm" aria-label="Hapus" onClick={() => run('d', () => removeException(e.id))}><Icon name="trash" /></button>}
            </div>
          ))}
        </div>
      )}
      {!readOnly && <>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Field label="Dari">{(id) => <input id={id} className="input" type="date" min={today} value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value, ends_on: e.target.value > f.ends_on ? e.target.value : f.ends_on })} />}</Field>
          <Field label="Sampai">{(id) => <input id={id} className="input" type="date" min={f.starts_on} value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} />}</Field>
          <Field label="Keterangan">{(id) => <input id={id} className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="UAS, pulang kampung" />}</Field>
        </div>
        <button className="btn" style={{ justifySelf: 'start' }} disabled={!f.starts_on || f.ends_on < f.starts_on || !!busy} onClick={() => run('a', async () => { await saveException({ mentor_id: mentor.id, ...f }); setF({ starts_on: today, ends_on: today, reason: '' }); }, 'Libur tersimpan.')}><Icon name="plus" size={14} />Tambah libur</button>
      </>}
    </section>
  );
}
