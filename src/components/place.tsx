/** Tempat sesi: online (tautan), tatap muka (lokasi), atau dibahas lewat WhatsApp dengan mentor. */
import { useState } from 'react';
import { Icon } from './Icon';
import { WaButton, useAction } from './bits';
import { setSessionPlace, useData, useMe } from '../store';
import { longDate, timeOf, toLocal } from '../domain/time';
import { PLACE_LABEL, type PlaceKind, type Session } from '../domain/types';

/** Yang dilihat peserta (dan siapa pun): tombol masuk kelas, lokasi, atau tombol WhatsApp ke mentor. */
export function PlaceInfo({ s, compact }: { s: Session; compact?: boolean }) {
  const data = useData();
  const me = useMe();
  const mentor = data.profiles.find((p) => p.id === s.mentor_id);
  if (s.place_kind === 'diskusi') {
    const text = `Halo ${mentor?.full_name.split(' ')[0] ?? 'Kak'}, saya ${me.full_name}, peserta sesi ${s.code} (${longDate(toLocal(s.starts_at).date)}, ${timeOf(s.starts_at)} WIB). Mau menyepakati tempat belajarnya.`;
    return (
      <span className="row wrap" style={{ gap: 8 }}>
        {!compact && <span className="pill warn"><Icon name="chat" size={12} />Tempat dibahas lewat WhatsApp</span>}
        {mentor?.phone && me.id !== mentor.id
          ? <WaButton phone={mentor.phone} text={text} label={compact ? 'WA mentor' : `Chat ${mentor.full_name.split(' ')[0]}`} sm />
          : !mentor?.phone && <span className="small muted">Mentor belum mengisi nomor WhatsApp. Hubungi admin.</span>}
      </span>
    );
  }
  if (s.place_kind === 'offline') {
    return <span className="pill"><Icon name="pin" size={12} />{s.place || 'Tatap muka, lokasi menyusul'}</span>;
  }
  if (/^https?:\/\//i.test(s.place)) {
    return <a className={`btn accent ${compact ? 'sm' : ''}`} href={s.place} target="_blank" rel="noreferrer"><Icon name="play" size={14} />Masuk kelas online</a>;
  }
  return <span className="small muted">Online. Tautan kelas dikirim mentor sebelum sesi.</span>;
}

/** Mentor sesi (atau admin) mengganti tempat. Peserta mendapat pemberitahuan. */
export function PlaceEditor({ s, onDone }: { s: Session; onDone?: () => void }) {
  const me = useMe();
  const { busy, run } = useAction();
  const [kind, setKind] = useState<PlaceKind>(s.place_kind);
  const [place, setPlace] = useState(s.place);
  const changed = kind !== s.place_kind || place.trim() !== s.place;
  const bad = (kind === 'online' && place.trim() && !/^https?:\/\//i.test(place.trim())) || (kind === 'offline' && !place.trim());
  return (
    <div className="stack sm">
      <div className="seg sm" role="group" aria-label="Jenis tempat">
        {(['online', 'offline', 'diskusi'] as const).map((k) => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'diskusi' ? 'Bahas lewat WA' : PLACE_LABEL[k]}</button>)}
      </div>
      {kind !== 'diskusi' && (
        <input className="input sm" value={place} onChange={(e) => setPlace(e.target.value)} aria-label={kind === 'online' ? 'Tautan kelas online' : 'Lokasi tatap muka'}
          placeholder={kind === 'online' ? (me.meeting_link || 'https://meet.google.com/…') : 'Perpustakaan ITS lantai 2'} />
      )}
      {kind === 'diskusi' && <p className="tiny muted">Peserta melihat tombol WhatsApp ke nomormu{me.phone ? ` (${me.phone})` : ''}.</p>}
      <button className="btn sm primary" style={{ justifySelf: 'start' }} disabled={!changed || !!bad || !!busy}
        onClick={() => run('p', async () => { await setSessionPlace(s.id, kind, kind === 'diskusi' ? '' : place); onDone?.(); }, 'Tempat tersimpan. Peserta diberi tahu.')}>Simpan tempat</button>
    </div>
  );
}
