// The fraud rule, drawn: one dot per phone number, placed by how many listings
// it posts and by its median price against the market. The flagged numbers are
// the tight cluster far to the left - half the going rate, fifteen-odd listings
// each - and the busy agents with more listings sit at the market line.

import { useMemo, useRef, useState, type PointerEvent } from 'react';
import type { ContactScore } from '../../lib/flags';

const W = 760;
const H = 300;
const M = { top: 14, right: 18, bottom: 44, left: 48 };

export default function ContactScatter({ scores, flagged }: { scores: ContactScore[]; flagged: Set<string> }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<(ContactScore & { x: number; y: number }) | null>(null);

  const geo = useMemo(() => {
    const ratios = scores.map((s) => s.ratio);
    const lo = Math.floor(Math.min(...ratios, 1) * 4) / 4;
    const hi = Math.ceil(Math.max(...ratios, 1) * 4) / 4;
    const maxN = Math.ceil(Math.max(...scores.map((s) => s.listings)) / 5) * 5;
    const x = (r: number) => M.left + ((r - lo) / (hi - lo)) * (W - M.left - M.right);
    const y = (n: number) => H - M.bottom - (n / maxN) * (H - M.top - M.bottom);
    const xTicks: number[] = [];
    for (let t = lo; t <= hi + 1e-9; t += 0.25) xTicks.push(Math.round(t * 100) / 100);
    const yTicks: number[] = [];
    for (let t = 0; t <= maxN; t += maxN > 20 ? 10 : 5) yTicks.push(t);
    // Flagged dots last, so they sit on top of the grey.
    const points = [...scores]
      .sort((a, b) => Number(flagged.has(a.contact)) - Number(flagged.has(b.contact)))
      .map((s) => ({ ...s, x: x(s.ratio), y: y(s.listings) }));
    return { x, y, xTicks, yTicks, points };
  }, [scores, flagged]);

  const flaggedPts = geo.points.filter((p) => flagged.has(p.contact));
  const label = flaggedPts.length
    ? {
        x: Math.max(...flaggedPts.map((p) => p.x)) + 12,
        y: Math.min(...flaggedPts.map((p) => p.y)) + 4,
      }
    : null;

  // Nearest point to the pointer, so nobody has to land on a 4px dot.
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    let best: (typeof geo.points)[number] | null = null;
    let bestD = 18 * 18;
    for (const p of geo.points) {
      const d = (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    setHover(best);
  };

  return (
    <div className="chart">
      <div className="legend">
        <span><i className="dot" style={{ background: 'var(--viz-flag)' }} /> flagged as lead generation</span>
        <span><i className="dot" style={{ background: 'var(--viz-context)' }} /> every other phone number</span>
      </div>
      <div className="chart-plot">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${scores.length} phone numbers by listings posted and median price against the market; ${flagged.size} flagged`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {geo.yTicks.map((t) => (
            <g key={`y${t}`}>
              <line x1={M.left} x2={W - M.right} y1={geo.y(t)} y2={geo.y(t)} className="grid" />
              <text x={M.left - 8} y={geo.y(t) + 4} textAnchor="end" className="tick">{t}</text>
            </g>
          ))}
          {geo.xTicks.map((t) => (
            <text key={`x${t}`} x={geo.x(t)} y={H - M.bottom + 18} textAnchor="middle" className="tick">
              {Math.round(t * 100)}%
            </text>
          ))}
          <line x1={geo.x(1)} x2={geo.x(1)} y1={M.top} y2={H - M.bottom} className="ref" />
          <text x={geo.x(1) - 6} y={M.top + 10} textAnchor="end" className="tick">market rate</text>
          <text x={(M.left + W - M.right) / 2} y={H - 6} textAnchor="middle" className="axis-title">
            median price per ft², against the locality-and-bedroom median
          </text>
          <text transform={`translate(12 ${(M.top + H - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" className="axis-title">
            listings on the number
          </text>

          {geo.points.map((p) => (
            <circle
              key={p.contact}
              cx={p.x}
              cy={p.y}
              r={flagged.has(p.contact) ? 5 : 4}
              className={flagged.has(p.contact) ? 'pt flag' : 'pt'}
            />
          ))}
          {hover && <circle cx={hover.x} cy={hover.y} r={8} className="pt-hover" />}
          {label && (
            <text x={label.x} y={label.y} className="direct-label">{flaggedPts.length} flagged numbers</text>
          )}
        </svg>
        {hover && (
          <div
            // pinned to the dot, but kept inside the plot at either edge
            className={`tooltip ${hover.x < W * 0.2 ? 'from-left' : hover.x > W * 0.8 ? 'from-right' : ''}`}
            style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%` }}
          >
            <strong>{hover.listings} listings · {Math.round(hover.ratio * 100)}% of market</strong>
            <span className="mono">{hover.contact}</span>
            <span className="muted">
              {flagged.has(hover.contact) ? 'flagged: lead generation' : hover.perfect ? 'all verified and live, but priced at market' : 'not flagged'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
