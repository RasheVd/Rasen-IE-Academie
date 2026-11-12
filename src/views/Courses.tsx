import { useState } from 'react';
import { GainBar, GainLegend } from '../components/bits';
import { CourseDialog } from '../components/dialogs';
import { Empty, colorVar } from '../components/ui';
import { courseOverview } from '../domain/progress';
import type { Course } from '../domain/types';
import { useTitle } from '../hooks';
import { useData } from '../store';

export default function Courses() {
  const data = useData();
  useTitle('Mata kuliah');
  const [edit, setEdit] = useState<Course | 'new' | null>(null);
  return (
    <>
      <header className="page-head">
        <div><div className="eyebrow"><span className="mono">{data.courses.length} mata kuliah</span><GainLegend /></div><h1 className="page-title">Mata kuliah</h1></div>
        <div className="actions"><button className="btn primary" onClick={() => setEdit('new')}>Tambah mata kuliah</button></div>
      </header>
      {data.courses.length === 0 ? <Empty title="Belum ada mata kuliah" action={<button className="btn primary" onClick={() => setEdit('new')}>Tambah mata kuliah</button>}>Mata kuliah adalah wadah sesi, materi, dan progres. Mulai dari mata kuliah yang paling banyak diminta.</Empty> : (
        <div className="cards stagger">
          {data.courses.map((c) => {
            const o = courseOverview(data, c.id);
            return (
              <button key={c.id} className="pcard" style={{ ...colorVar(c.color), textAlign: 'left', cursor: 'pointer' }} onClick={() => setEdit(c)} aria-label={`Ubah ${c.code}`}>
                <div className="row between"><span className="code">{c.code}</span>{!c.active && <span className="tag plain">Nonaktif</span>}</div>
                <div className="t">{c.title}</div>
                {c.description && <p className="small muted">{c.description}</p>}
                <GainBar pre={o.avgPre} post={o.avgPost} />
                <div className="meta">
                  <div><b>{o.students}</b><span>Peserta aktif</span></div>
                  <div><b>{o.sessionsDone}</b><span>Sesi selesai</span></div>
                  <div><b>{data.materials.filter((m) => m.course_id === c.id).length}</b><span>Materi</span></div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {edit && <CourseDialog course={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}
