import { useMemo, useState } from 'react';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { Field, Modal, confirmDialog } from '../../components/ui';
import { useAction } from '../../components/bits';
import { GoogleBanner } from '../../components/google';
import { removeException, removeRule, requestCompetency, saveException, saveRule, setCompetency, useData, useMe, useStore } from '../../store';
import { useTitle } from '../../hooks';
import { availableSlots } from '../../domain/slots';
import { hm, longDate, shortDate, toLocal } from '../../domain/time';
import { WEEKDAYS, type Data, type Profile, type Rule } from '../../domain/types';

const ORDER = [1, 2, 3, 4, 5, 6, 0];
const MODES: Record<Rule['modes'], string> = { both: 'Private & bersama', private: 'Private saja', group: 'Kelas bersama saja' };

export default function Availability() {
  useTitle('Ketersediaan');
  const me = useMe();
  const data = useData();
  return (
    <Shell title="Ketersediaan">
      <div className="page-head"><div><h1 className="h-page">Ketersediaan</h1><p className="lead">Pola mingguan berlaku terus tanpa tanggal akhir. Peserta bisa booking slot 60 menit di dalamnya, paling lambat {data.settings.booking_cutoff_hours} jam sebelumnya.</p></div></div>
      <GoogleBanner returnPath="/ketersediaan" />
      <Competencies data={data} me={me} />
      <WeeklyRules data={data} me={me} />
      <Exceptions data={data} me={me} />
    </Shell>
  );
}

export function Competencies({ data, me }: { data: Data; me: Profile }) {
  const { busy, run } = useAction();
  const [pick, setPick] = useState('');
  const mine = data.mentorCourses.filter((x) => x.mentor_id === me.id);
  const categories = [...new Set(data.courses.filter((c) => c.active).map((c) => c.category))];
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
          {categories.map((cat) => (
            <optgroup key={cat} label={cat}>
              {data.courses.filter((c) => c.active && c.category === cat && !mine.some((m) => m.course_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
            </optgroup>
          ))}
        </select>
        <button className="btn" disabled={!pick || !!busy} onClick={() => run('a', async () => { await requestCompetency(me.id, pick); setPick(''); }, 'Diajukan. Admin akan meninjau.')}>Ajukan</button>
      </div>
    </section>
  );
}

function WeeklyRules({ data, me }: { data: Data; me: Profile }) {
  const { run } = useAction();
  const [edit, setEdit] = useState<Partial<Rule> & { weekday: number } | null>(null);
  const gcal = useStore((r) => r.gcal);
  const rules = data.rules.filter((r) => r.mentor_id === me.id);
  const preview = useMemo(() => {
    const mineSessions = data.sessions.filter((s) => s.mentor_id === me.id && s.status === 'scheduled').map((s) => ({ ...s, seats: data.seats.filter((x) => x.session_id === s.id).length }));
    const opt = {
      mentors: [{ id: me.id, full_name: me.full_name, bio: '' }],
      rules: rules.filter((r) => r.active).map((r) => ({ mentor_id: r.mentor_id, weekday: r.weekday, start_min: r.start_min, end_min: r.end_min, modes: r.modes })),
      exceptions: data.exceptions.filter((e) => e.mentor_id === me.id), busy: [], sessions: mineSessions,
    };
    const base = { courseId: '', now: Date.now(), cutoffHours: data.settings.booking_cutoff_hours, horizonDays: 14 };
    const keys = new Set([...availableSlots(opt, { ...base, mode: 'private' }), ...availableSlots(opt, { ...base, mode: 'group' })].filter((s) => !s.join).map((s) => s.starts_at));
    return keys.size;
  }, [data, me, rules]);
  return (
    <section className="card">
      <div className="card-head">
        <div><div className="h-card">Pola mingguan</div><div className="sub">{preview} slot kosong dalam 14 hari ke depan{gcal?.connected ? ' · tersinkron ke Google Calendar (biru)' : ''}</div></div>
      </div>
      <div className="week-rules">
        {ORDER.map((wd) => {
          const list = rules.filter((r) => r.weekday === wd).sort((a, b) => a.start_min - b.start_min);
          return (
            <div key={wd} className="wr">
              <div className="day">{WEEKDAYS[wd]}</div>
              <div className="row wrap">
                {list.length === 0 && <span className="small faint">Tidak tersedia</span>}
                {list.map((r) => (
                  <span key={r.id} className={`rule-chip ${r.active ? '' : 'off'}`} title={MODES[r.modes]}>
                    {hm(r.start_min)}–{hm(r.end_min)} <span style={{ fontWeight: 500 }}>· {MODES[r.modes]}</span>
                    <button aria-label="Ubah" onClick={() => setEdit(r)}><Icon name="edit" size={13} /></button>
                    <button aria-label="Hapus" onClick={async () => {
                      if (await confirmDialog({ title: 'Hapus jam ini?', body: `${WEEKDAYS[wd]} ${hm(r.start_min)}–${hm(r.end_min)}. Sesi yang sudah dibooking tetap berjalan.`, confirm: 'Hapus', danger: true }))
                        run('d', () => removeRule(r.id), 'Jam dihapus.');
                    }}><Icon name="trash" size={13} /></button>
                  </span>
                ))}
              </div>
              <button className="btn sm" onClick={() => setEdit({ weekday: wd, start_min: 19 * 60, end_min: 21 * 60, modes: 'both' })}><Icon name="plus" size={14} />Jam</button>
            </div>
          );
        })}
      </div>
      {edit && <RuleForm initial={edit} me={me} onClose={() => setEdit(null)} />}
    </section>
  );
}

function RuleForm({ initial, me, onClose }: { initial: Partial<Rule> & { weekday: number }; me: Profile; onClose: () => void }) {
  const { busy, run } = useAction();
  const [f, setF] = useState({ weekday: initial.weekday, start: initial.start_min ?? 19 * 60, end: initial.end_min ?? 21 * 60, modes: initial.modes ?? 'both', active: initial.active ?? true });
  const hours = Array.from({ length: 18 }, (_, i) => (6 + i) * 60);
  const valid = f.end > f.start;
  return (
    <Modal title={initial.id ? 'Ubah jam' : 'Tambah jam'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Batal</button>
      <button className="btn primary" disabled={!valid || !!busy} onClick={() => run('s', async () => {
        await saveRule({ id: initial.id, mentor_id: me.id, weekday: f.weekday, start_min: f.start, end_min: f.end, modes: f.modes, active: f.active }); onClose();
      }, 'Jam tersimpan.')}>Simpan</button>
    </>}>
      <div className="form-grid">
        <Field label="Hari" className="full">{(id) => <select id={id} className="select" value={f.weekday} onChange={(e) => setF({ ...f, weekday: Number(e.target.value) })}>{ORDER.map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}</select>}</Field>
        <Field label="Mulai">{(id) => <select id={id} className="select" value={f.start} onChange={(e) => setF({ ...f, start: Number(e.target.value) })}>{hours.map((h) => <option key={h} value={h}>{hm(h)}</option>)}</select>}</Field>
        <Field label="Selesai">{(id) => <select id={id} className="select" value={f.end} onChange={(e) => setF({ ...f, end: Number(e.target.value) })}>{[...hours.slice(1), 24 * 60].map((h) => <option key={h} value={h}>{hm(h)}</option>)}</select>}</Field>
        <Field label="Jenis kelas yang diterima" className="full">{(id) => <select id={id} className="select" value={f.modes} onChange={(e) => setF({ ...f, modes: e.target.value as Rule['modes'] })}>{(Object.keys(MODES) as Rule['modes'][]).map((m) => <option key={m} value={m}>{MODES[m]}</option>)}</select>}</Field>
        {initial.id && <label className="check full"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Aktif (matikan untuk menutup sementara tanpa menghapus)</label>}
      </div>
      {valid ? <p className="small muted">{(f.end - f.start) / 60} slot per minggu, masing-masing 60 menit (pretest, materi, pembahasan, posttest).</p> : <p className="small" style={{ color: 'var(--danger)' }}>Jam selesai harus setelah jam mulai.</p>}
    </Modal>
  );
}

function Exceptions({ data, me }: { data: Data; me: Profile }) {
  const { busy, run } = useAction();
  const today = toLocal(Date.now()).date;
  const [f, setF] = useState({ starts_on: today, ends_on: today, reason: '' });
  const list = data.exceptions.filter((e) => e.mentor_id === me.id && e.ends_on >= today);
  return (
    <section className="card stack">
      <div><div className="h-card">Libur dan pengecualian</div><div className="sub small muted">Slot di tanggal ini disembunyikan. Sesi yang sudah dibooking tidak berubah; batalkan dari halaman sesi bila perlu.</div></div>
      {list.length > 0 && (
        <div className="list">
          {list.map((e) => (
            <div key={e.id} className="list-item">
              <Icon name="calendar" size={16} className="faint" />
              <div className="grow"><div className="t">{e.starts_on === e.ends_on ? longDate(e.starts_on) : `${shortDate(e.starts_on)} sampai ${shortDate(e.ends_on)}`}</div>{e.reason && <div className="meta">{e.reason}</div>}</div>
              <button className="btn ghost icon sm" aria-label="Hapus" onClick={() => run('d', () => removeException(e.id))}><Icon name="trash" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Field label="Dari">{(id) => <input id={id} className="input" type="date" min={today} value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value, ends_on: e.target.value > f.ends_on ? e.target.value : f.ends_on })} />}</Field>
        <Field label="Sampai">{(id) => <input id={id} className="input" type="date" min={f.starts_on} value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} />}</Field>
        <Field label="Keterangan">{(id) => <input id={id} className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="UAS, pulang kampung" />}</Field>
      </div>
      <button className="btn" style={{ justifySelf: 'start' }} disabled={!f.starts_on || f.ends_on < f.starts_on || !!busy} onClick={() => run('a', async () => { await saveException({ mentor_id: me.id, ...f }); setF({ starts_on: today, ends_on: today, reason: '' }); }, 'Libur tersimpan.')}><Icon name="plus" size={14} />Tambah libur</button>
    </section>
  );
}
