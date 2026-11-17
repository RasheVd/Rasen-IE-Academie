/**
 * Pusat data admin: cek kesehatan dan integrasi, lihat dan betulkan data, riwayat perubahan
 * yang bisa dikembalikan, log galat dari browser pengguna, dan cadangan unduhan.
 * Jam dan libur mentor hanya bisa dilihat (hak mentor); perubahan yang rusak tetap bisa dikembalikan dari riwayat.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Shell } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { Field, Modal, confirmDialog } from '../../components/ui';
import { useAction } from '../../components/bits';
import { downloadCsv } from '../../components/SessionTable';
import {
  adminDelete, adminUpdate, auditLog, errorLog, healthCheck, integrations, resolveErrors, restoreAudit, useData, useStore,
  type AuditRow, type ErrorRow, type HealthIssue, type Integrations,
} from '../../store';
import { useTitle } from '../../hooks';
import { fromLocal, hm, longDate, shortDate, timeOf, toLocal } from '../../domain/time';
import { WEEKDAYS, type Data } from '../../domain/types';
import { BOOL_OPTIONS, SPECS, TABLE_LABEL, type Col, type Spec } from './dataSpec';

type Tab = 'sehat' | 'data' | 'riwayat' | 'galat' | 'cadangan';
const TABS: [Tab, string][] = [['sehat', 'Kesehatan & integrasi'], ['data', 'Data'], ['riwayat', 'Riwayat perubahan'], ['galat', 'Log galat'], ['cadangan', 'Cadangan']];

export default function DataCenter() {
  useTitle('Pusat data');
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find(([k]) => k === params.get('tab'))?.[0] ?? 'sehat') as Tab;
  return (
    <Shell title="Pusat data">
      <div className="page-head"><div><h1 className="h-page">Pusat data</h1><p className="lead">Lihat semua data, temukan yang salah, betulkan, dan kembalikan perubahan. Setiap ubahan tercatat dengan nama pengubahnya.</p></div></div>
      <div className="seg" role="tablist" aria-label="Bagian pusat data">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setParams({ tab: k })}>{l}</button>)}
      </div>
      {tab === 'sehat' && <Health />}
      {tab === 'data' && <Tables />}
      {tab === 'riwayat' && <History />}
      {tab === 'galat' && <Errors />}
      {tab === 'cadangan' && <Backup />}
    </Shell>
  );
}

/* ── Kesehatan dan integrasi ─────────────────────────────── */
function Health() {
  const [issues, setIssues] = useState<HealthIssue[] | null>(null);
  const [integ, setInteg] = useState<Integrations | null>(null);
  const [err, setErr] = useState('');
  const [at, setAt] = useState(0);
  const gcal = useStore((r) => r.gcal);
  const load = useCallback(() => {
    setErr('');
    Promise.all([healthCheck(), integrations()]).then(([h, i]) => { setIssues(h); setInteg(i); setAt(Date.now()); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);
  const order = { bad: 0, warn: 1, info: 2 } as const;
  return (
    <div className="stack">
      <div className="row between wrap">
        <div className="small muted">{at ? `Diperiksa ${timeOf(new Date(at))} WIB` : 'Memeriksa…'}</div>
        <button className="btn sm" onClick={load}><Icon name="refresh" size={14} />Periksa ulang</button>
      </div>
      {err && <p className="error" role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}
      {issues && issues.length === 0 && <div className="card row"><Icon name="check" size={20} /><div><div className="h-card">Tidak ada masalah ditemukan</div><div className="small muted">15 pemeriksaan: kapasitas kursi, pembayaran, laporan, jadwal bertumpuk, kredit, link tes, tempat, Google Calendar, jadwal otomatis, galat browser.</div></div></div>}
      {issues?.slice().sort((a, b) => order[a.level] - order[b.level]).map((i) => (
        <div key={i.key} className={`issue ${i.level}`}>
          <div className="row between wrap">
            <div className="row"><Icon name={i.level === 'info' ? 'info' : 'alert'} size={18} /><b>{i.title}</b><span className="pill">{i.count}</span></div>
            {i.key === 'client' && <Link className="btn sm" to="/data?tab=galat">Buka log galat</Link>}
          </div>
          <p className="small">{i.detail}</p>
          {i.items.length > 0 && <div className="row wrap">{i.items.slice(0, 12).map((x, k) => <Link key={k} className="chip" to={x.link}>{x.label}</Link>)}{i.items.length > 12 && <span className="small muted">+{i.items.length - 12} lagi</span>}</div>}
        </div>
      ))}

      {integ && (
        <div className="grid g2">
          <section className="card stack">
            <div className="h-card">Google Calendar</div>
            <div className="small">{!gcal ? 'Memeriksa kunci Google…' : gcal.configured ? 'Kunci Google terpasang di server.' : <span style={{ color: 'var(--danger)' }}>Kunci Google belum terpasang di server.</span>}</div>
            <div className="list">
              {integ.google.map((g) => (
                <div key={g.name + g.role} className="list-item">
                  <div className="grow"><div className="t">{g.name} <span className="tiny muted">{g.role}</span></div><div className="meta">{g.email ?? 'email tidak terbaca'} · sejak {shortDate(toLocal(g.connected_at).date)}{g.calendar ? '' : ' · kalender belum dibuat'}</div></div>
                  {g.last_error ? <span className="pill bad" title={g.last_error}>Galat</span> : <span className="pill ok">Tersambung</span>}
                </div>
              ))}
              {integ.google.length === 0 && <p className="small muted">Belum ada akun yang menyambungkan Google.</p>}
            </div>
            {integ.mentors_without_google.length > 0 && <p className="small">Mentor belum tersambung: <b>{integ.mentors_without_google.join(', ')}</b>. Sesi mereka tetap masuk kalender admin.</p>}
            <div className="small muted">Antrean sinkron: {integ.sync_pending} sesi · galat: {integ.sync_errors} · terakhir {integ.last_sync ? `${shortDate(toLocal(integ.last_sync).date)} ${timeOf(integ.last_sync)} WIB` : 'belum pernah'}</div>
          </section>
          <section className="card stack">
            <div className="h-card">Jadwal otomatis</div>
            <div className="list">
              {integ.jobs.map((j) => (
                <div key={j.name} className="list-item">
                  <div className="grow"><div className="t">{JOB_LABEL[j.name] ?? j.name}</div><div className="meta">{j.schedule} · terakhir {j.last_run ? `${shortDate(toLocal(j.last_run).date)} ${timeOf(j.last_run)}` : 'belum jalan'}{j.failed_24h ? ` · ${j.failed_24h} gagal (24 jam)` : ''}</div></div>
                  <span className={`pill ${!j.active ? 'warn' : j.last_status === 'failed' ? 'bad' : 'ok'}`} title={j.last_message}>{!j.active ? 'Mati' : j.last_status === 'failed' ? 'Gagal' : 'Berjalan'}</span>
                </div>
              ))}
            </div>
            <div className="small muted">Riwayat perubahan: {integ.audit_rows} catatan · galat terbuka: {integ.errors_open}</div>
          </section>
        </div>
      )}
    </div>
  );
}
const JOB_LABEL: Record<string, string> = {
  'academie-expire-holds': 'Lepas slot yang tidak dibayar (tiap 10 menit)',
  'academie-gcal': 'Sinkron Google Calendar (tiap 15 menit)',
  'academie-retention': 'Bersihkan riwayat lama (mingguan)',
};

/* ── Label baris ─────────────────────────────────────────── */
function refLabel(data: Data, ref: Col['ref'], id: unknown): string {
  if (id == null || id === '') return '–';
  const v = String(id);
  if (ref === 'profile') return data.profiles.find((p) => p.id === v)?.full_name ?? v.slice(0, 8);
  if (ref === 'course') { const c = data.courses.find((x) => x.id === v); return c ? `${c.code} · ${c.title}` : v.slice(0, 8); }
  if (ref === 'topic') return data.topics.find((t) => t.id === v)?.title ?? v.slice(0, 8);
  if (ref === 'session') return data.sessions.find((s) => s.id === v)?.code ?? v.slice(0, 8);
  return v;
}
function rowTitle(spec: Spec, r: Record<string, any>, data: Data): string {
  const name = (id: string) => refLabel(data, 'profile', id);
  switch (spec.table) {
    case 'sessions': return `${r.code} · ${shortDate(toLocal(r.starts_at).date)} ${timeOf(r.starts_at)}`;
    case 'session_students': return `${refLabel(data, 'session', r.session_id)} · ${name(r.student_id)}`;
    case 'profiles': return `${r.full_name} · ${r.role}`;
    case 'enrollments': return `${name(r.student_id)} · ${refLabel(data, 'course', r.course_id)}`;
    case 'mentor_courses': return `${name(r.mentor_id)} · ${refLabel(data, 'course', r.course_id)}`;
    case 'courses': return `${r.code} · ${r.title}`;
    case 'topics': return `${refLabel(data, 'course', r.course_id).split(' · ')[0]} · ${r.title}`;
    case 'credits': return `${name(r.student_id)} · ${r.reason || 'kredit'}${r.used_session ? ' (terpakai)' : ''}`;
    case 'payouts': return `${name(r.mentor_id)} · ${r.month}`;
    case 'availability_rules': return `${name(r.mentor_id)} · ${WEEKDAYS[r.weekday]} ${hm(r.start_min)}–${hm(r.end_min)}`;
    case 'availability_exceptions': return `${name(r.mentor_id)} · ${r.starts_on} s.d. ${r.ends_on}`;
    default: return r.title ?? r.name ?? r.id;
  }
}
const keyOf = (spec: Spec, r: Record<string, any>) => Object.fromEntries(spec.key.map((k) => [k, r[k]]));
const rowIdOf = (spec: Spec, r: Record<string, any>) => spec.key.map((k) => r[k]).join(':');

/* ── Data ────────────────────────────────────────────────── */
function Tables() {
  const data = useData();
  const [params, setParams] = useSearchParams();
  const spec = SPECS.find((s) => s.table === params.get('t')) ?? SPECS[0];
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(50);
  const [open, setOpen] = useState<Record<string, any> | null>(null);
  const rows = useMemo(() => {
    const list = (data[spec.data] as unknown as Record<string, any>[]) ?? [];
    const needle = q.trim().toLowerCase();
    const titled = list.map((r) => ({ r, t: rowTitle(spec, r, data) }));
    const hit = needle ? titled.filter(({ r, t }) => t.toLowerCase().includes(needle) || Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(needle))) : titled;
    return spec.table === 'sessions' ? hit.sort((a, b) => b.r.starts_at.localeCompare(a.r.starts_at)) : hit;
  }, [data, spec, q]);
  const show = spec.cols.filter((c) => c.type !== 'long').slice(0, 5);
  return (
    <div className="stack">
      <div className="row wrap">
        <select className="select" style={{ maxWidth: 260 }} value={spec.table} onChange={(e) => { setParams({ tab: 'data', t: e.target.value }); setLimit(50); }} aria-label="Pilih tabel">
          {SPECS.map((s) => <option key={s.table} value={s.table}>{s.label} ({(data[s.data] as unknown[]).length})</option>)}
        </select>
        <input className="input" style={{ maxWidth: 260 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari di tabel ini" aria-label="Cari" />
        <button className="btn sm" onClick={() => downloadCsv(`academie-${spec.table}.csv`, ['id', ...spec.cols.map((c) => c.label)], rows.map(({ r }) => [rowIdOf(spec, r), ...spec.cols.map((c) => fmt(data, c, r[c.k]))]))}><Icon name="download" size={14} />CSV</button>
      </div>
      {spec.note && <p className="small muted">{spec.note}</p>}
      <div className="sheet-wrap">
        <table className="sheet">
          <thead><tr><th>Baris</th>{show.map((c) => <th key={c.k}>{c.label}</th>)}<th /></tr></thead>
          <tbody>
            {rows.slice(0, limit).map(({ r, t }) => (
              <tr key={rowIdOf(spec, r)}>
                <td className="strong clip" title={t}>{t}</td>
                {show.map((c) => <td key={c.k} className="clip">{fmt(data, c, r[c.k])}</td>)}
                <td><button className="btn sm" onClick={() => setOpen(r)}>{spec.readonly ? 'Lihat' : 'Buka'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted small" style={{ padding: 16 }}>Tidak ada baris.</p>}
      </div>
      {rows.length > limit && <button className="btn" style={{ justifySelf: 'start' }} onClick={() => setLimit(limit + 100)}>Tampilkan lebih banyak ({rows.length - limit} lagi)</button>}
      {open && <RowEditor spec={spec} row={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function fmt(data: Data, c: Col, v: unknown): string {
  if (v == null || v === '') return '–';
  if (c.type === 'ref') return refLabel(data, c.ref, v);
  if (c.type === 'bool') return v ? 'Ya' : 'Tidak';
  if (c.type === 'datetime') { const l = toLocal(String(v)); return `${l.date} ${hm(l.min)}`; }
  if (c.type === 'time') return String(v).slice(0, 5);
  if (c.type === 'select') return c.options?.find(([k]) => k === String(v))?.[1] ?? String(v);
  return String(v);
}
/** Nilai baris ke isian form, dan sebaliknya. */
function toInput(c: Col, v: unknown): string {
  if (v == null) return '';
  if (c.type === 'datetime') { const l = toLocal(String(v)); return `${l.date}T${hm(l.min).replace('.', ':')}`; }
  if (c.type === 'time') return String(v).slice(0, 5);
  return String(v);
}
function fromInput(c: Col, v: string): unknown {
  if (v === '' && (c.nullable || ['int', 'num', 'date', 'datetime', 'ref'].includes(c.type))) return c.nullable ? null : undefined;
  if (c.type === 'bool') return v === 'true';
  if (c.type === 'int') return Math.round(Number(v));
  if (c.type === 'num') return Number(v);
  if (c.type === 'datetime') { const [d, t] = v.split('T'); const [h, m] = t.split(':').map(Number); return fromLocal(d, h * 60 + m).toISOString(); }
  return v;
}

function RowEditor({ spec, row, onClose }: { spec: Spec; row: Record<string, any>; onClose: () => void }) {
  const data = useData();
  const { busy, run } = useAction();
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(spec.cols.map((c) => [c.k, toInput(c, row[c.k])])));
  const patch: Record<string, unknown> = {};
  for (const c of spec.cols) {
    if (c.readonly || spec.readonly) continue;
    if (f[c.k] !== toInput(c, row[c.k])) { const v = fromInput(c, f[c.k]); if (v !== undefined) patch[c.k] = v; }
  }
  const bad = Object.entries(patch).some(([k, v]) => { const c = spec.cols.find((x) => x.k === k)!; return (c.type === 'int' || c.type === 'num') && v != null && Number.isNaN(v); });
  const options = (c: Col): [string, string][] => {
    if (c.type === 'bool') return BOOL_OPTIONS;
    if (c.type === 'select') return c.options ?? [];
    if (c.ref === 'profile') return data.profiles.map((p) => [p.id, `${p.full_name} (${p.role})`]);
    if (c.ref === 'course') return data.courses.map((x) => [x.id, `${x.code} · ${x.title}`]);
    if (c.ref === 'topic') return data.topics.filter((t) => !row.course_id || t.course_id === (f.course_id || row.course_id)).map((t) => [t.id, t.title]);
    if (c.ref === 'session') return data.sessions.slice(-300).map((s) => [s.id, `${s.code} · ${longDate(toLocal(s.starts_at).date)}`]);
    return [];
  };
  return (
    <Modal wide title={rowTitle(spec, row, data)} onClose={onClose} footer={<>
      {!spec.readonly && <button className="btn danger" style={{ marginRight: 'auto' }} disabled={!!busy} onClick={async () => {
        if (await confirmDialog({ title: `Hapus baris ${spec.label.toLowerCase()} ini?`, body: 'Bisa dikembalikan dari Riwayat perubahan. Data terkait (misalnya kursi di sesi yang dihapus) ikut terhapus.', confirm: 'Hapus', danger: true }))
          run('d', async () => { await adminDelete(spec.table, keyOf(spec, row)); onClose(); }, 'Baris dihapus. Bisa dikembalikan dari Riwayat.');
      }}><Icon name="trash" size={14} />Hapus</button>}
      <button className="btn" onClick={onClose}>{spec.readonly ? 'Tutup' : 'Batal'}</button>
      {!spec.readonly && <button className="btn primary" disabled={!Object.keys(patch).length || bad || !!busy} onClick={() => run('s', async () => { await adminUpdate(spec.table, keyOf(spec, row), patch); onClose(); }, 'Tersimpan dan tercatat di riwayat.')}>Simpan {Object.keys(patch).length ? `(${Object.keys(patch).length} kolom)` : ''}</button>}
    </>}>
      {spec.note && <p className="small muted">{spec.note}</p>}
      <div className="form-grid">
        {spec.cols.map((c) => {
          const ro = c.readonly || spec.readonly;
          const set = (v: string) => setF({ ...f, [c.k]: v });
          return (
            <Field key={c.k} label={c.label} className={c.type === 'long' ? 'full' : ''}>{(id) => {
              if (ro) return <div id={id} className="input ro">{fmt(data, c, row[c.k])}</div>;
              if (c.type === 'long') return <textarea id={id} className="textarea" value={f[c.k]} onChange={(e) => set(e.target.value)} />;
              if (['bool', 'select', 'ref'].includes(c.type)) return (
                <select id={id} className="select" value={f[c.k]} onChange={(e) => set(e.target.value)}>
                  {(c.nullable || f[c.k] === '') && <option value="">(kosong)</option>}
                  {options(c).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              );
              const type = c.type === 'date' ? 'date' : c.type === 'datetime' ? 'datetime-local' : c.type === 'time' ? 'time' : c.type === 'int' || c.type === 'num' ? 'number' : 'text';
              return <input id={id} className="input" type={type} value={f[c.k]} onChange={(e) => set(e.target.value)} />;
            }}</Field>
          );
        })}
      </div>
      <RowHistory table={`academie_${spec.table}`} rowId={rowIdOf(spec, row)} />
    </Modal>
  );
}

function RowHistory({ table, rowId }: { table: string; rowId: string }) {
  const [list, setList] = useState<AuditRow[] | null>(null);
  useEffect(() => { auditLog({ table, rowId, limit: 8 }).then(setList).catch(() => setList([])); }, [table, rowId]);
  if (!list?.length) return null;
  return (
    <details className="stack sm" style={{ marginTop: 14 }}>
      <summary className="small strong">Riwayat baris ini ({list.length})</summary>
      <AuditList rows={list} onChange={() => auditLog({ table, rowId, limit: 8 }).then(setList)} />
    </details>
  );
}

/* ── Riwayat perubahan ───────────────────────────────────── */
function History() {
  const [table, setTable] = useState('');
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [more, setMore] = useState(true);
  const [err, setErr] = useState('');
  const load = useCallback((before?: number) => {
    auditLog({ table: table || undefined, before, limit: 60 }).then((r) => { setRows((old) => (before ? [...(old ?? []), ...r] : r)); setMore(r.length === 60); }).catch((e) => setErr(e.message));
  }, [table]);
  useEffect(() => { setRows(null); load(); }, [load]);
  return (
    <div className="stack">
      <div className="row wrap between">
        <select className="select" style={{ maxWidth: 260 }} value={table} onChange={(e) => setTable(e.target.value)} aria-label="Filter tabel">
          <option value="">Semua tabel</option>
          {Object.entries(TABLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className="small muted">Disimpan 180 hari. "Kembalikan" membatalkan satu perubahan dan ikut tercatat.</span>
      </div>
      {err && <p className="error" style={{ color: 'var(--danger)' }}>{err}</p>}
      {!rows ? <div className="row muted"><div className="spinner" />Memuat…</div> : rows.length === 0 ? <p className="muted">Belum ada perubahan tercatat.</p> : <AuditList rows={rows} onChange={() => load()} />}
      {rows && more && rows.length > 0 && <button className="btn" style={{ justifySelf: 'start' }} onClick={() => load(rows[rows.length - 1].id)}>Muat lebih lama</button>}
    </div>
  );
}

const OP_LABEL = { INSERT: 'Dibuat', UPDATE: 'Diubah', DELETE: 'Dihapus' } as const;
const short = (v: unknown) => { const t = v == null ? '–' : typeof v === 'object' ? JSON.stringify(v) : String(v); return t.length > 60 ? t.slice(0, 57) + '…' : t; };

function AuditList({ rows, onChange }: { rows: AuditRow[]; onChange: () => void }) {
  const data = useData();
  const { busy, run } = useAction();
  const who = (id: string | null) => (id ? data.profiles.find((p) => p.id === id)?.full_name ?? 'Akun terhapus' : 'Sistem / jadwal otomatis');
  const label = (a: AuditRow) => {
    const r = (a.new ?? a.old ?? {}) as Record<string, any>;
    const spec = SPECS.find((s) => `academie_${s.table}` === a.tbl);
    try { return spec ? rowTitle(spec, r, data) : a.tbl === 'academie_settings' ? 'Aturan bisnis' : a.row_id; } catch { return a.row_id; }
  };
  return (
    <div className="list">
      {rows.map((a) => {
        const changed = a.op === 'UPDATE' && a.old && a.new
          ? Object.keys(a.new).filter((k) => !k.startsWith('gcal_') && k !== 'prefs' && JSON.stringify(a.new![k]) !== JSON.stringify(a.old![k])) : [];
        return (
          <div key={a.id} className={`list-item audit ${a.restored_at ? 'restored' : ''}`}>
            <span className={`pill ${a.op === 'DELETE' ? 'bad' : a.op === 'INSERT' ? 'ok' : ''}`}>{OP_LABEL[a.op]}</span>
            <div className="grow">
              <div className="t">{TABLE_LABEL[a.tbl] ?? a.tbl} · {label(a)}</div>
              <div className="meta">{shortDate(toLocal(a.at).date)} {timeOf(a.at)} WIB · {who(a.actor)}{a.restored_at ? ' · sudah dikembalikan' : ''}</div>
              {changed.length > 0 && <div className="diff">{changed.slice(0, 6).map((k) => <span key={k}><b>{k}</b>: {short(a.old![k])} → {short(a.new![k])}</span>)}</div>}
            </div>
            {!a.restored_at && (
              <button className="btn sm" disabled={!!busy} onClick={async () => {
                const body = a.op === 'INSERT' ? 'Baris yang dibuat ini akan dihapus.' : a.op === 'DELETE' ? 'Baris yang dihapus ini akan dikembalikan.' : 'Kolom yang berubah dikembalikan ke nilai sebelumnya.';
                if (await confirmDialog({ title: 'Kembalikan perubahan ini?', body, confirm: 'Kembalikan' }))
                  run(`r${a.id}`, async () => { await restoreAudit(a.id); onChange(); }, 'Perubahan dikembalikan.');
              }}><Icon name="refresh" size={13} />Kembalikan</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Log galat ───────────────────────────────────────────── */
function Errors() {
  const data = useData();
  const { busy, run } = useAction();
  const [rows, setRows] = useState<ErrorRow[] | null>(null);
  const [all, setAll] = useState(false);
  const load = useCallback(() => { errorLog(150).then(setRows).catch(() => setRows([])); }, []);
  useEffect(load, [load]);
  const list = (rows ?? []).filter((r) => all || !r.resolved_at);
  return (
    <div className="stack">
      <div className="row wrap between">
        <label className="check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />Tampilkan yang sudah beres</label>
        <button className="btn sm" disabled={!list.some((r) => !r.resolved_at) || !!busy} onClick={() => run('all', async () => { await resolveErrors(list.filter((r) => !r.resolved_at).map((r) => r.id)); load(); }, 'Ditandai beres.')}>Tandai semua beres</button>
      </div>
      <p className="small muted">Galat yang muncul di browser pengguna (halaman gagal tampil, tombol gagal) tercatat otomatis di sini beserta halaman dan perangkatnya. Pesan seperti "slot sudah terisi" tidak dicatat karena itu aturan, bukan galat.</p>
      {!rows ? <div className="row muted"><div className="spinner" />Memuat…</div> : list.length === 0 ? <p className="muted">Tidak ada galat terbuka.</p> : (
        <div className="list">
          {list.map((r) => (
            <details key={r.id} className={`list-item err ${r.resolved_at ? 'restored' : ''}`}>
              <summary>
                <b>{r.message}</b>
                <span className="meta">{shortDate(toLocal(r.created_at).date)} {timeOf(r.created_at)} · {r.profile_id ? data.profiles.find((p) => p.id === r.profile_id)?.full_name ?? 'akun' : 'tanpa akun'} · {r.path}</span>
              </summary>
              <pre className="err-detail">{r.detail || '(tanpa detail)'}{'\n\n'}{r.user_agent}</pre>
              {!r.resolved_at && <button className="btn sm" onClick={() => run(`e${r.id}`, async () => { await resolveErrors([r.id]); load(); })}>Tandai beres</button>}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Cadangan ────────────────────────────────────────────── */
function Backup() {
  const data = useData();
  const today = toLocal(Date.now()).date;
  const json = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ exported_at: new Date().toISOString(), data }, null, 1)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `academie-cadangan-${today}.json` });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  return (
    <div className="stack">
      <section className="card stack">
        <div className="h-card">Cadangan lengkap</div>
        <p className="small">Satu file berisi semua data yang kamu lihat: orang, mata kuliah, topik, jam mentor, sesi, kursi, pembayaran, nilai, kredit, materi, transfer hak mentor, dan aturan bisnis. Bukti transfer (gambar) tidak ikut.</p>
        <p className="small muted">Simpan file ini di Google Drive tiap minggu. Bila data rusak, buka Riwayat perubahan dulu: kebanyakan kesalahan bisa dikembalikan di sana tanpa file cadangan.</p>
        <button className="btn primary" style={{ justifySelf: 'start' }} onClick={json}><Icon name="download" size={14} />Unduh cadangan ({longDate(today)})</button>
      </section>
      <section className="card stack">
        <div className="h-card">Per tabel (CSV untuk Google Sheets)</div>
        <div className="row wrap">
          {SPECS.map((s) => (
            <button key={s.table} className="btn sm" onClick={() => {
              const list = data[s.data] as unknown as Record<string, any>[];
              downloadCsv(`academie-${s.table}-${today}.csv`, ['id', ...s.cols.map((c) => c.label)], list.map((r) => [rowIdOf(s, r), ...s.cols.map((c) => fmt(data, c, r[c.k]))]));
            }}><Icon name="download" size={13} />{s.label}</button>
          ))}
        </div>
      </section>
    </div>
  );
}
