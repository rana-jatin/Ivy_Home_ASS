// Units, solved against the server's own sort order rather than guessed.
//
// The server sorts on the true stored value while serialising a mixed-unit
// view, so a sorted pull is a ground-truth ordering of the real numbers.
// Serialised values are ROUNDED, so each record constrains the true value to an
// interval, not a point; feasibility is interval arithmetic, left to right.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../probe/lib.mjs';

const load = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
const SQM = 10.7639;
const report = {};

// ---------------------------------------------------------------- areas ----
// Candidate readings of a serialised value v: it is already sqft, or it is
// round(true/10.7639) square metres, in which case true lies in a ~10.8 wide band.
function areaCandidates(v) {
  return [
    { unit: 'sqft', lo: v - 0.5, hi: v + 0.5, val: v },
    { unit: 'sqm', lo: (v - 0.5) * SQM, hi: (v + 0.5) * SQM, val: Math.round(v * SQM) },
  ];
}

function solveIntervals(records, field, idKey, candidatesOf) {
  // Greedy on the lower bound: pick the feasible candidate with the smallest
  // hi, which maximises room for everything after it. Records where only one
  // candidate is feasible are *determined*; the rest are reported as ambiguous.
  const assign = [];
  let floor = -Infinity;
  let ambiguous = 0, stuck = 0;
  for (const r of records) {
    const v = r[field];
    if (v === null || v === undefined) { assign.push({ id: r[idKey], raw: v, unit: null }); continue; }
    const feasible = candidatesOf(v).filter((c) => c.hi >= floor);
    if (!feasible.length) { stuck++; assign.push({ id: r[idKey], raw: v, unit: null, note: 'infeasible' }); continue; }
    feasible.sort((a, b) => a.lo - b.lo);
    const pick = feasible[0];
    if (feasible.length > 1) ambiguous++;
    assign.push({ id: r[idKey], raw: v, unit: pick.unit, value: pick.val, determined: feasible.length === 1 });
    floor = Math.max(floor, pick.lo);
  }
  return { assign, ambiguous, stuck };
}

{
  const recs = load('data/sorted-listings-by-carpet_area.json');
  const { assign, ambiguous, stuck } = solveIntervals(recs, 'carpet_area', 'listing_id', areaCandidates);
  const sqm = assign.filter((a) => a.unit === 'sqm');
  const sqmRaws = sqm.map((a) => a.raw);
  const sqftRaws = assign.filter((a) => a.unit === 'sqft').map((a) => a.raw);
  console.log('=== listings.carpet_area ===');
  console.log(`in square metres: ${sqm.length} / ${recs.length}  (ambiguous ${ambiguous}, infeasible ${stuck})`);
  console.log(`sqm raw range ${Math.min(...sqmRaws)}..${Math.max(...sqmRaws)}   sqft raw range ${Math.min(...sqftRaws)}..${Math.max(...sqftRaws)}`);
  // Does a plain magnitude threshold reproduce the sort-order answer?
  const GAP_LO = Math.max(...sqmRaws), GAP_HI = Math.min(...sqftRaws);
  const threshold = (GAP_LO + GAP_HI) / 2;
  const byThreshold = new Set(recs.filter((r) => r.carpet_area < threshold).map((r) => r.listing_id));
  const bySort = new Set(sqm.map((a) => a.id));
  const onlyThreshold = [...byThreshold].filter((x) => !bySort.has(x));
  const onlySort = [...bySort].filter((x) => !byThreshold.has(x));
  console.log(`clean gap ${GAP_LO} -> ${GAP_HI}; threshold ${threshold} reproduces the sort-order split exactly: ${onlyThreshold.length === 0 && onlySort.length === 0}`);
  const byWebsite = {};
  for (const r of recs) {
    byWebsite[r.website] ??= { total: 0, sqm: 0 };
    byWebsite[r.website].total++;
    if (bySort.has(r.listing_id)) byWebsite[r.website].sqm++;
  }
  console.log('by website:', JSON.stringify(byWebsite));
  report.carpet_area = { sqm_count: sqm.length, total: recs.length, threshold, gap: [GAP_LO, GAP_HI], byWebsite, sqm_ids: [...bySort] };
}

// ------------------------------------------------------- project prices ----
// The sorted raw sequence rises, drops once, then rises again: everything
// before the drop is quoted in lakh, everything after in crore. One break, so
// the split is read off the data rather than assumed.
for (const field of ['price_max', 'price_min']) {
  const recs = load(`data/sorted-projects-by-${field}.json`);
  const raw = recs.map((r) => r[field]);
  const breaks = [];
  for (let i = 1; i < raw.length; i++) if (raw[i] < raw[i - 1]) breaks.push(i);
  const split = breaks[0];
  const resolved = {};
  recs.forEach((r, i) => {
    const unit = i < split ? 'lakh' : 'crore';
    resolved[r.project_id] = { raw: r[field], unit, inr: Math.round(r[field] * (unit === 'lakh' ? 1e5 : 1e7)) };
  });
  const vals = Object.values(resolved).map((x) => x.inr);
  const monotonic = recs.every((r, i) => i === 0 || resolved[r.project_id].inr >= resolved[recs[i - 1].project_id].inr);
  console.log(`\n=== projects.${field} ===`);
  console.log(`breaks in raw sequence: ${breaks.length} at ${JSON.stringify(breaks)}  -> split at ${split}`);
  console.log(`lakh: ${split}   crore: ${recs.length - split}`);
  console.log(`resolved to INR is monotonic in the server's own order: ${monotonic}`);
  console.log(`range: ${vals[0].toLocaleString('en-IN')} -> ${vals.at(-1).toLocaleString('en-IN')}`);
  console.log('top 3:', JSON.stringify(recs.slice(-3).map((r) => ({ id: r.project_id, raw: r[field], ...resolved[r.project_id] }))));
  report[field] = { breaks, split, lakh: split, crore: recs.length - split, monotonic_after_fix: monotonic, resolved };
}

// ---------------------------------------------------------- other areas ----
for (const [file, field, idKey, label] of [
  ['data/listings.json', 'super_built_up_area', 'listing_id', 'listings.super_built_up_area'],
  ['data/rentals.json', 'carpet_area', 'listing_id', 'rentals.carpet_area'],
  ['data/rentals.json', 'super_builtup_area', 'listing_id', 'rentals.super_builtup_area'],
  ['data/projects.json', 'min_area_sqft', 'project_id', 'projects.min_area_sqft'],
  ['data/projects.json', 'max_area_sqft', 'project_id', 'projects.max_area_sqft'],
]) {
  const recs = load(file);
  const vals = recs.map((r) => r[field]).filter((v) => typeof v === 'number');
  vals.sort((a, b) => a - b);
  // a second unit shows up as a low-value cluster separated by a gap
  let biggestGap = { at: null, size: 0 };
  for (let i = 1; i < vals.length; i++) {
    const g = vals[i] - vals[i - 1];
    if (g > biggestGap.size && vals[i - 1] < 600) biggestGap = { at: [vals[i - 1], vals[i]], size: g, below: i };
  }
  console.log(`\n${label}: n=${vals.length} range ${vals[0]}..${vals.at(-1)}  largest low-end gap ${JSON.stringify(biggestGap)}`);
  report[label] = { n: vals.length, min: vals[0], max: vals.at(-1), biggestGap };
}

writeFileSync(join(ROOT, 'analysis/out-units.json'), JSON.stringify(report, null, 2));
console.log('\nwrote analysis/out-units.json');
