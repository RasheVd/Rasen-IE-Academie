/**
 * Dua grafik kecil untuk dasbor: batang per minggu dan garis nilai posttest.
 * Satu seri, satu warna (--series), garis ambang abu putus-putus, tooltip saat hover/fokus,
 * dan tabel tersembunyi untuk pembaca layar.
 */
import { useState } from 'react';

const W = 640, H = 200, PAD = { l: 34, r: 12, t: 14, b: 26 };
const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;

/** Batang dengan ujung atas membulat 4px, menempel di garis dasar. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function niceMax(v: number) {
  if (v <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / step) * step;
}

export function BarChart({ data, unit, title }: { data: { label: string; value: number; tip: string }[]; unit: string; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const ticks = [0, max / 2, max];
  const slot = iw / data.length, bw = Math.min(36, slot * 0.56);
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
            <text className="axis-text" x={PAD.l - 8} y={y(t) + 4} textAnchor="end">{Number.isInteger(t) ? t : t.toFixed(1)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = PAD.l + slot * i + slot / 2;
          const h = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * ih);
          return (
            <g key={d.label}>
              <rect className="hit" x={cx - slot / 2} y={PAD.t} width={slot} height={ih} tabIndex={0} aria-label={d.tip}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
              {h > 0 && <path className="mark" d={barPath(cx - bw / 2, PAD.t + ih - h, bw, h)} opacity={hover === null || hover === i ? 1 : 0.55} />}
              <text className="axis-text" x={cx} y={H - 8} textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: `${((PAD.l + slot * hover + slot / 2) / W) * 100}%`, top: `${(y(data[hover].value) / H) * 100}%` }}>
          {data[hover].tip}: <b>{data[hover].value} {unit}</b>
        </div>
      )}
      <table className="sr-only"><caption>{title}</caption><tbody>{data.map((d) => <tr key={d.label}><th>{d.tip}</th><td>{d.value} {unit}</td></tr>)}</tbody></table>
    </div>
  );
}

export function ScoreLine({ points, refs, title }: { points: { label: string; value: number; tip: string }[]; refs: { value: number; label: string }[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return null;
  const x = (i: number) => PAD.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => PAD.t + ih - (v / 100) * ih;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join('');
  const nearest = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    points.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
    return best;
  };
  const every = Math.ceil(points.length / 8);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}
        onMouseMove={(e) => setHover(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))} onMouseLeave={() => setHover(null)}>
        {[0, 50, 100].map((t) => (
          <g key={t}>
            <line className="grid-line" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
            <text className="axis-text" x={PAD.l - 8} y={y(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        {refs.map((r) => (
          <g key={r.value}>
            <line className="ref-line" x1={PAD.l} x2={W - PAD.r} y1={y(r.value)} y2={y(r.value)} />
            <text className="ref-text" x={W - PAD.r} y={y(r.value) - 5} textAnchor="end">{r.label}</text>
          </g>
        ))}
        {hover !== null && <line className="cross" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} />}
        <path className="line" d={d} />
        {points.map((p, i) => (
          <circle key={i} className="dot" cx={x(i)} cy={y(p.value)} r={hover === i ? 6 : 4.5} tabIndex={0} aria-label={`${p.tip}: ${p.value}`}
            onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
        ))}
        {points.map((p, i) => (i % every === 0 || i === points.length - 1) && (
          <text key={`l${i}`} className="axis-text" x={x(i)} y={H - 8} textAnchor="middle">{p.label}</text>
        ))}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(points[hover].value) / H) * 100}%` }}>
          {points[hover].tip}: <b>{points[hover].value}</b>
        </div>
      )}
      <table className="sr-only"><caption>{title}</caption><tbody>{points.map((p, i) => <tr key={i}><th>{p.tip}</th><td>{p.value}</td></tr>)}</tbody></table>
    </div>
  );
}
