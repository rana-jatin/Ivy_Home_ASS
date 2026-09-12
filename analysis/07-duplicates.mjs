// Q2 - how many distinct properties do the 4100 records describe?
//
// The same flat is cross-posted across sites with everything human jittered:
// price, seller, description, posted_at, super_built_up_area and the
// coordinates all move, and apartment_name is re-cased, re-spaced, hyphenated
// or given a "Phase 1" / "Apartments" suffix. Matching on the name agrees on
// the easy majority and misses precisely the perturbed subset, so the match is
// built on what does not move: the flat's physical signature plus position.
//
// locality is NOT used for blocking. Every locality label spans the whole
// 35km x 35km city box with the same centre, so the labels carry no geography
// and blocking on them would be blocking on nothing.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../probe/lib.mjs';
import { listings } from './04-normalize.mjs';

const L = listings();
const RADIUS_M = 150;   // pair distances cliff here: 1163 below, none from 150m to 500m
const AREA_TOL = 0.02;  // carpet_area moves by at most 2% between cross-posts
const CELL = 0.0015;    // ~165m grid, so neighbours of a cell cover the radius

const metres = (a, b) => Math.hypot(
  (a.latitude_fixed - b.latitude_fixed) * 111000,
  (a.longitude_fixed - b.longitude_fixed) * 108300,
);

// The physical signature of a flat. Two cross-posts of one property agree on
// all of it; the one pair in the data that is merely close by chance does not.
const SIGNATURE = ['bedroom', 'bathroom', 'balcony', 'floor', 'total_floors', 'property_type', 'furnishing', 'facing_direction', 'covered_parking'];
const sameProperty = (a, b) =>
  SIGNATURE.every((f) => a[f] === b[f]) &&
  Math.abs(a.carpet_area_sqft - b.carpet_area_sqft) / Math.max(a.carpet_area_sqft, b.carpet_area_sqft) <= AREA_TOL &&
  metres(a, b) <= RADIUS_M;

const grid = new Map();
const cellOf = (r) => `${Math.floor(r.latitude_fixed / CELL)},${Math.floor(r.longitude_fixed / CELL)}`;
for (const r of L) {
  const k = cellOf(r);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(r);
}

const parent = new Map(L.map((r) => [r.listing_id, r.listing_id]));
const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
const union = (x, y) => { const a = find(x), b = find(y); if (a !== b) parent.set(a, b); };

const links = [];
for (const r of L) {
  const [ci, cj] = cellOf(r).split(',').map(Number);
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    for (const s of grid.get(`${ci + di},${cj + dj}`) ?? []) {
      if (s.listing_id <= r.listing_id) continue;
      if (sameProperty(r, s)) { union(r.listing_id, s.listing_id); links.push([r.listing_id, s.listing_id, Math.round(metres(r, s))]); }
    }
  }
}

const clusters = new Map();
for (const r of L) {
  const root = find(r.listing_id);
  if (!clusters.has(root)) clusters.set(root, []);
  clusters.get(root).push(r);
}
const multi = [...clusters.values()].filter((c) => c.length > 1);
const sizes = multi.reduce((a, c) => { a[c.length] = (a[c.length] ?? 0) + 1; return a; }, {});

console.log(`records                 ${L.length}`);
console.log(`linking pairs           ${links.length}`);
console.log(`distinct properties     ${clusters.size}`);
console.log(`clusters with >1 record ${multi.length}   sizes ${JSON.stringify(sizes)}`);
console.log(`duplicate records       ${L.length - clusters.size}`);
console.log(`max link distance       ${Math.max(...links.map((l) => l[2]))}m`);

// What a name-based rule would have done, and what it gets wrong.
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const nameExact = new Set(multi.filter((c) => new Set(c.map((r) => norm(r.apartment_name))).size === 1).map((c) => c[0].listing_id));
console.log(`\nclusters whose members share an identical normalised name: ${nameExact.size} of ${multi.length}`);
console.log('clusters a name match would have missed (name differs across the cluster):');
for (const c of multi.filter((c) => new Set(c.map((r) => norm(r.apartment_name))).size > 1).slice(0, 10)) {
  console.log('  ' + c.map((r) => `${r.listing_id} "${r.apartment_name}"`).join('  ==  '));
}

const evidence = multi.filter((c) => c.length === 2).slice(0, 10).flatMap((c) => c.map((r) => r.listing_id));

writeFileSync(join(ROOT, 'analysis/out-duplicates.json'), JSON.stringify({
  distinct_properties: clusters.size,
  duplicate_records: L.length - clusters.size,
  cluster_sizes: sizes,
  radius_m: RADIUS_M, area_tolerance: AREA_TOL, signature: SIGNATURE,
  evidence_ids: evidence,
  clusters: multi.map((c) => c.map((r) => r.listing_id)),
}, null, 2));
console.log('\nwrote analysis/out-duplicates.json');
