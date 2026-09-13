// "Locality is a label, not a place", drawn. One small map per locality: its
// own listings in the accent, every other listing in the city as grey context,
// all ten on the same frame. If locality were geography, each accent cloud
// would sit in its own corner. Each fills the whole frame instead.
//
// Canvas, not SVG: that is 41,000 points across ten panels.

import { useEffect, useMemo, useRef } from 'react';
import type { FixedListing } from '../../lib/corrections';

// Same flat-earth conversion the duplicate matcher uses; Chennai is at 13°N.
export const KM_PER_DEG_LAT = 111;
export const KM_PER_DEG_LON = 108.3;

type Bounds = { minLat: number; maxLat: number; minLon: number; maxLon: number };

function boundsOf(rs: FixedListing[]): Bounds {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const r of rs) {
    minLat = Math.min(minLat, r.latitude_fixed);
    maxLat = Math.max(maxLat, r.latitude_fixed);
    minLon = Math.min(minLon, r.longitude_fixed);
    maxLon = Math.max(maxLon, r.longitude_fixed);
  }
  return { minLat, maxLat, minLon, maxLon };
}

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function Panel({ locality, mine, others, frame, ratio }: {
  locality: string;
  mine: FixedListing[];
  others: FixedListing[];
  frame: Bounds;
  /** height over width, from the frame's extent in km */
  ratio: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const b = boundsOf(mine);
  const ew = (b.maxLon - b.minLon) * KM_PER_DEG_LON;
  const ns = (b.maxLat - b.minLat) * KM_PER_DEG_LAT;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = w * ratio;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const pad = 4;
      const x = (lon: number) => pad + ((lon - frame.minLon) / (frame.maxLon - frame.minLon)) * (w - 2 * pad);
      const y = (lat: number) => pad + ((frame.maxLat - lat) / (frame.maxLat - frame.minLat)) * (h - 2 * pad);

      ctx.globalAlpha = 0.28;
      ctx.fillStyle = cssVar('--viz-context') || '#7d8794';
      for (const r of others) ctx.fillRect(x(r.longitude_fixed) - 0.75, y(r.latitude_fixed) - 0.75, 1.5, 1.5);

      ctx.globalAlpha = 1;
      ctx.fillStyle = cssVar('--viz-accent') || '#2a78d6';
      for (const r of mine) {
        ctx.beginPath();
        ctx.arc(x(r.longitude_fixed), y(r.latitude_fixed), 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [mine, others, frame, ratio]);

  return (
    <figure className="multiple">
      <canvas
        ref={ref}
        role="img"
        aria-label={`${locality}: ${mine.length} listings spread ${ew.toFixed(1)} km east to west and ${ns.toFixed(1)} km north to south`}
        style={{ aspectRatio: `${1 / ratio}` }}
      />
      <figcaption>
        <strong>{locality}</strong>
        <span className="muted">{mine.length} listings · {ew.toFixed(0)} × {ns.toFixed(0)} km</span>
      </figcaption>
    </figure>
  );
}

export default function LocalityMultiples({ listings }: { listings: FixedListing[] }) {
  const { frame, ratio, groups } = useMemo(() => {
    const frame = boundsOf(listings);
    const ratio = ((frame.maxLat - frame.minLat) * KM_PER_DEG_LAT) / ((frame.maxLon - frame.minLon) * KM_PER_DEG_LON);
    const names = [...new Set(listings.map((r) => r.locality))].sort();
    const groups = names.map((locality) => ({
      locality,
      mine: listings.filter((r) => r.locality === locality),
      others: listings.filter((r) => r.locality !== locality),
    }));
    return { frame, ratio, groups };
  }, [listings]);

  return (
    <div>
      <div className="legend" aria-hidden="true">
        <span><i className="dot" style={{ background: 'var(--viz-accent)' }} /> listings in that locality</span>
        <span><i className="dot" style={{ background: 'var(--viz-context)' }} /> every other listing</span>
      </div>
      <div className="multiples">
        {groups.map((g) => (
          <Panel key={g.locality} locality={g.locality} mine={g.mine} others={g.others} frame={frame} ratio={ratio} />
        ))}
      </div>
    </div>
  );
}
