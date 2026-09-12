// Q4 - listing records that describe something that CANNOT exist.
// Deliberately conservative: each rule is a physical or arithmetic
// impossibility, not a value that merely looks unusual. Rules that only found
// "odd" records are listed at the bottom as rejected, and stay rejected.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../probe/lib.mjs';
import { listings, REFERENCE } from './04-normalize.mjs';

const L = listings();
const hits = new Map(); // id -> [reasons]
const add = (r, reason) => {
  if (!hits.has(r.listing_id)) hits.set(r.listing_id, []);
  hits.get(r.listing_id).push(reason);
};

const rules = [
  ['price <= 0', (r) => r.price <= 0],
  ['carpet_area > super_built_up_area', (r) => r.carpet_area_sqft > r.super_built_up_area_sqft],
  ['floor > total_floors', (r) => r.floor > r.total_floors],
  ['coordinates outside the city: lat/lon transposed', (r) => r.coords_swapped],
  ['posted_at is in the future', (r) => new Date(r.posted_at) > new Date('2026-09-12T12:00:00Z')],
  ['zero bedrooms and zero bathrooms on a built property', (r) => r.bedroom === 0 && r.bathroom === 0 && r.property_type !== 'plot'],
  ['sale price is ~1/1000 of any possible price', (r) => r.price > 0 && r.price / r.carpet_area_sqft < 100],
  ['carpet_area <= 0', (r) => r.carpet_area <= 0],
  ['bathroom > bedroom + 2 with bedroom > 0', (r) => r.bedroom > 0 && r.bathroom > r.bedroom + 2],
  ['negative counts', (r) => [r.bedroom, r.bathroom, r.balcony, r.covered_parking, r.floor, r.total_floors].some((v) => v < 0)],
];

for (const [name, pred] of rules) {
  const m = L.filter(pred);
  console.log(`${String(m.length).padStart(4)}  ${name}`);
  for (const r of m) add(r, name);
}

console.log('\n--- rules that fired, in detail ---');
const byReason = {};
for (const [id, reasons] of hits) for (const x of reasons) (byReason[x] ??= []).push(id);
for (const [reason, ids] of Object.entries(byReason)) {
  console.log(`\n${reason}  (${ids.length})`);
  for (const id of ids.slice(0, 12)) {
    const r = L.find((x) => x.listing_id === id);
    console.log(`   ${id}  ${r.website.padEnd(11)} price=${String(r.price).padStart(10)} carpet=${String(r.carpet_area).padStart(5)}->${String(r.carpet_area_sqft).padStart(5)} super=${String(r.super_built_up_area).padStart(5)}->${String(r.super_built_up_area_sqft).padStart(5)} floor=${r.floor}/${r.total_floors} live=${r.is_live} posted=${r.posted_at}`);
  }
}

const ids = [...hits.keys()].sort();
console.log(`\n=== ${ids.length} distinct corrupt listing_ids ===`);
console.log(JSON.stringify(ids));
console.log('overlap between rules:', [...hits.values()].filter((v) => v.length > 1).length, 'records hit by more than one rule');

// ---- checks considered and NOT used, with why ----
console.log('\n--- rejected as "unusual, not impossible" ---');
const rejected = [
  ['bedroom == 0', L.filter((r) => r.bedroom === 0).length, 'all are property_type=plot or studio-like; a plot legitimately has no bedroom'],
  ['total_floors == 0', L.filter((r) => r.total_floors === 0).length, 'plots and independent houses; 0 is a plausible encoding of "not a tower"'],
  ['floor == 0', L.filter((r) => r.floor === 0).length, 'ground floor'],
  ['maintenance == 0', 0, 'n/a on listings'],
  ['price far below locality median', null, 'covered under Q9 fraud, not impossibility'],
];
for (const [name, n, why] of rejected) console.log(`   ${name}: ${n ?? '-'} - ${why}`);
console.log('\nbedroom==0 property types:', JSON.stringify(L.filter((r) => r.bedroom === 0).reduce((a, r) => { a[r.property_type] = (a[r.property_type] ?? 0) + 1; return a; }, {})));
console.log('total_floors==0 property types:', JSON.stringify(L.filter((r) => r.total_floors === 0).reduce((a, r) => { a[r.property_type] = (a[r.property_type] ?? 0) + 1; return a; }, {})));
console.log('floor>total_floors property types:', JSON.stringify(L.filter((r) => r.floor > r.total_floors).reduce((a, r) => { a[r.property_type] = (a[r.property_type] ?? 0) + 1; return a; }, {})));

writeFileSync(join(ROOT, 'analysis/out-corrupt.json'), JSON.stringify({ ids, byReason, detail: Object.fromEntries([...hits]) }, null, 2));
console.log('\nwrote analysis/out-corrupt.json');
