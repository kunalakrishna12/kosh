import { useId, useMemo, useRef, useState, type ReactNode } from 'react';

/* Hand-rolled SVG charts: no chart library, so the bundle stays small and every pixel is ours. */

export interface Series {
  name: string;
  color: string;
  /** `null` leaves a gap (e.g. no forecast for past months). */
  values: (number | null)[];
  /** Draw as a dashed line without fill. */
  dashed?: boolean;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** Monotone cubic path so curves never overshoot the data. */
function smooth(pts: [number, number][]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  const n = pts.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      t[i] = (3 * a * m[i]) / h;
      t[i + 1] = (3 * b * m[i]) / h;
    }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + h * t[i]} ${pts[i + 1][0] - h},${pts[i + 1][1] - h * t[i + 1]} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

export function AreaChart({
  labels,
  series,
  format,
  height = 240,
  tipTitle,
}: {
  labels: string[];
  series: Series[];
  format: (v: number) => string;
  height?: number;
  tipTitle?: (i: number) => string;
}) {
  const uid = useId().replace(/:/g, '');
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 800;
  const H = height;
  const pad = { l: 8, r: 8, t: 12, b: 26 };
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const max = niceMax(Math.max(1, ...all));
  const lowest = Math.min(0, ...all);
  const lo = lowest < 0 ? -niceMax(-lowest) : 0;
  const n = labels.length;
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (v: number) => pad.t + (1 - (v - lo) / (max - lo)) * (H - pad.t - pad.b);
  const ticks = lo < 0 ? [lo, 0, max / 2, max] : [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const rel = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((rel - pad.l) / (W - pad.l - pad.r)) * (n - 1)))));
  };

  return (
    <div className="chart" ref={ref} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H }} role="img" aria-label={series.map((s) => s.name).join(' and ') + ' by month'}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`${uid}-g${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: s.color, stopOpacity: 0.28 }} />
              <stop offset="1" style={{ stopColor: s.color, stopOpacity: 0 }} />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t, i) => (
          <line key={i} className="gridline" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} strokeDasharray={i === 0 ? '' : '2 4'} vectorEffect="non-scaling-stroke" />
        ))}
        {series.map((s, i) => {
          const idx = s.values.flatMap((v, j) => (v === null ? [] : [j]));
          if (!idx.length) return null;
          const pts = idx.map((j) => [x(j), y(s.values[j]!)] as [number, number]);
          const line = smooth(pts);
          const first = idx[0];
          const last = idx[idx.length - 1];
          return (
            <g key={i}>
              {!s.dashed && <path d={`${line} L${x(last)},${y(Math.max(lo, 0))} L${x(first)},${y(Math.max(lo, 0))} Z`} fill={`url(#${uid}-g${i})`} />}
              <path d={line} fill="none" style={{ stroke: s.color }} strokeWidth={2} strokeDasharray={s.dashed ? '5 5' : undefined} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            </g>
          );
        })}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} style={{ stroke: 'var(--line-2)' }} vectorEffect="non-scaling-stroke" />}
      </svg>
      {/* Labels and dots in HTML so they don't stretch with the SVG. */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {labels.map((l, i) =>
          n > 8 && i % 2 === 1 && i !== n - 1 ? null : (
            <span key={i} className="axis" style={{ position: 'absolute', left: `${(x(i) / W) * 100}%`, bottom: 2, transform: 'translateX(-50%)', fontSize: 11, color: 'var(--text-3)' }}>
              {l}
            </span>
          ),
        )}
        {hover !== null &&
          series.map((s, i) =>
            s.values[hover] === null ? null : (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: `${(x(hover) / W) * 100}%`,
                top: y(s.values[hover]!),
                width: 9,
                height: 9,
                marginLeft: -4.5,
                marginTop: -4.5,
                borderRadius: '50%',
                background: s.color,
                boxShadow: '0 0 0 3px var(--surface)',
              }}
            />
          ))}
        {hover !== null && (
          <div className="tip" style={{ left: `${(x(hover) / W) * 100}%`, top: Math.min(...series.map((s) => (s.values[hover] === null ? H : y(s.values[hover]!)))) }}>
            <div className="tip-h">{tipTitle ? tipTitle(hover) : labels[hover]}</div>
            {series.map((s, i) =>
              s.values[hover] === null ? null : (
                <div key={i} className="tip-r">
                  <span>
                    <i className="swatch" style={{ background: s.color }} />
                    {s.name}
                  </span>
                  <b className="num">{format(s.values[hover]!)}</b>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Bars({
  labels,
  series,
  format,
  height = 220,
}: {
  labels: string[];
  series: { name: string; color: string; values: number[] }[];
  format: (v: number) => string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const H = height - 24;
  return (
    <div className="chart" style={{ height }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2%', height: H, borderBottom: '1px solid var(--line)' }}>
        {labels.map((l, i) => (
          <div
            key={l + i}
            style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3, height: '100%', position: 'relative', cursor: 'default' }}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            {series.map((s, j) => (
              <div
                key={j}
                style={{
                  width: `${Math.min(14, 70 / series.length)}px`,
                  maxWidth: '45%',
                  height: `${(s.values[i] / max) * 100}%`,
                  minHeight: s.values[i] > 0 ? 2 : 0,
                  background: s.color,
                  borderRadius: '4px 4px 1px 1px',
                  opacity: hover === null || hover === i ? 1 : 0.35,
                  transition: 'opacity .15s, height .6s var(--ease)',
                }}
              />
            ))}
            {hover === i && (
              <div className="tip" style={{ left: '50%', top: `${(1 - Math.max(...series.map((s) => s.values[i])) / max) * 100}%` }}>
                <div className="tip-h">{l}</div>
                {series.map((s, j) => (
                  <div key={j} className="tip-r">
                    <span>
                      <i className="swatch" style={{ background: s.color }} />
                      {s.name}
                    </span>
                    <b className="num">{format(s.values[i])}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '2%', marginTop: 6 }}>
        {labels.map((l, i) => (
          <span key={l + i} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--text-3)' }}>
            {labels.length > 8 && i % 2 === 1 && i !== labels.length - 1 ? '' : l}
          </span>
        ))}
      </div>
    </div>
  );
}

export const CATEGORY_COLORS = ['#f0c36a', '#9b8cff', '#3fd9c1', '#ff7a8a', '#7cb4ff', '#a3e635', '#f472b6', '#fb923c', '#94a3b8'];

export function Donut({
  slices,
  size = 160,
  thickness = 18,
  center,
}: {
  slices: { value: number; color: string; label: string }[];
  size?: number;
  thickness?: number;
  center?: ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 2.5 : 0;
  const arcs = useMemo(() => {
    let acc = 0;
    return slices.map((s) => {
      const len = total ? (s.value / total) * c : 0;
      const a = { offset: acc, len };
      acc += len;
      return a;
    });
  }, [slices, total, c]);
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} role="img" aria-label="Breakdown">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: 'var(--surface-3)' }} strokeWidth={thickness} />
        {slices.map((s, i) => (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={hover === i ? thickness + 4 : thickness}
            strokeDasharray={`${Math.max(0, arcs[i].len - gap)} ${c}`}
            strokeDashoffset={-arcs[i].offset}
            style={{ stroke: s.color, transition: 'stroke-width .15s', opacity: hover === null || hover === i ? 1 : 0.4 }}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          />
        ))}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', pointerEvents: 'none' }}>
        {hover !== null ? (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{slices[hover].label}</div>
            <div className="num" style={{ fontWeight: 650, fontSize: 18 }}>
              {Math.round((slices[hover].value / total) * 100)}%
            </div>
          </div>
        ) : (
          center
        )}
      </div>
    </div>
  );
}

export function Ring({ value, size = 120, color, children }: { value: number; size?: number; color: string; children?: ReactNode }) {
  const t = 10;
  const r = (size - t) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: 'var(--surface-3)' }} strokeWidth={t} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={t}
          strokeLinecap="round"
          strokeDasharray={`${c * Math.max(0.001, Math.min(1, value))} ${c}`}
          style={{ stroke: color, transition: 'stroke-dasharray .8s var(--ease)', filter: `drop-shadow(0 0 8px color-mix(in srgb, ${color} 40%, transparent))` }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}

export function Sparkline({ values, color, height = 36 }: { values: number[]; color: string; height?: number }) {
  const uid = useId().replace(/:/g, '');
  const W = 120;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const pts = values.map((v, i) => [(i * W) / Math.max(1, values.length - 1), height - 2 - ((v - min) / (max - min || 1)) * (height - 4)] as [number, number]);
  const d = smooth(pts);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }} aria-hidden>
      <defs>
        <linearGradient id={`${uid}-s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: color, stopOpacity: 0.25 }} />
          <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${height} L0,${height} Z`} fill={`url(#${uid}-s)`} />
      <path d={d} fill="none" style={{ stroke: color }} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
