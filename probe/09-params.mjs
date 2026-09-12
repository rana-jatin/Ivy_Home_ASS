// Phase 0.5 — does each documented parameter actually do anything?
// Method: ask the server for a filtered set, then check the returned records
// against the predicate. A param that changes nothing is silently ignored.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { call, login, ROOT, redact } from './lib.mjs';

const { token } = await login();
const listings = JSON.parse(readFileSync(join(ROOT, 'data/listings.json'), 'utf8'));
const UNFILTERED_TOTAL = 3923; // what /v1/listings reports with no filters

const rows = [];
async function probe(path, query, predicate, label) {
  const r = await call(path, { token, query: { ...query, limit: 50 } });
  const res = r.json?.results ?? [];
  const violations = predicate ? res.filter((x) => !predicate(x)) : [];
  const row = {
    path, query: JSON.stringify(query), status: r.status,
    total: r.json?.total, count: res.length,
    violations: predicate ? violations.length : null,
    sample_violation: violations[0] ? { id: violations[0].listing_id ?? violations[0].project_id, got: label && label(violations[0]) } : null,
    detail: r.json?.detail,
  };
  rows.push(row);
  const verdict = r.status !== 200 ? `HTTP ${r.status}`
    : row.total === UNFILTERED_TOTAL && path === '/v1/listings' ? 'IGNORED (total unchanged)'
    : predicate && violations.length ? `APPLIED? ${violations.length}/${res.length} violate`
    : 'applied';
  console.log(JSON.stringify(query).padEnd(52), String(r.status).padEnd(4), `total=${String(row.total).padEnd(6)}`, verdict, row.sample_violation ? JSON.stringify(row.sample_violation) : '');
  return r.json;
}

console.log('--- listings filters (documented) ---');
await probe('/v1/listings', { locality: 'velachery' }, (x) => x.locality === 'velachery', (x) => x.locality);
await probe('/v1/listings', { bhk: 2 }, (x) => x.bedroom === 2, (x) => x.bedroom);
await probe('/v1/listings', { property_type: 'villa' }, (x) => x.property_type === 'villa', (x) => x.property_type);
await probe('/v1/listings', { min_price: 20000000 }, (x) => x.price >= 20000000, (x) => x.price);
await probe('/v1/listings', { max_price: 3000000 }, (x) => x.price <= 3000000, (x) => x.price);
await probe('/v1/listings', { furnishing: 'fully-furnished' }, (x) => x.furnishing === 'fully-furnished', (x) => x.furnishing);
await probe('/v1/listings', { project_id: 'P40001' }, (x) => x.project_id === 'P40001', (x) => x.project_id);

console.log('\n--- listings filters (undocumented guesses) ---');
await probe('/v1/listings', { bedroom: 2 }, (x) => x.bedroom === 2, (x) => x.bedroom);
await probe('/v1/listings', { bedrooms: 2 }, (x) => x.bedroom === 2, (x) => x.bedroom);
await probe('/v1/listings', { is_live: true }, (x) => x.is_live === true, (x) => x.is_live);
await probe('/v1/listings', { is_live: 'false' }, (x) => x.is_live === false, (x) => x.is_live);
await probe('/v1/listings', { website: '100acres' }, (x) => x.website === '100acres', (x) => x.website);
await probe('/v1/listings', { verified: true }, null);
await probe('/v1/listings', { totally_made_up_param: 'xyzzy' }, null);

console.log('\n--- sorting ---');
const asc = (vals) => vals.every((v, i) => i === 0 || v >= vals[i - 1]);
const desc = (vals) => vals.every((v, i) => i === 0 || v <= vals[i - 1]);
for (const [sort_by, field] of [['price', 'price'], ['carpet_area', 'carpet_area'], ['posted_at', 'posted_at'], ['bedroom', 'bedroom']]) {
  for (const order of ['asc', 'desc']) {
    const j = await probe('/v1/listings', { sort_by, order }, null);
    const vals = (j?.results ?? []).map((x) => x[field]);
    const sorted = order === 'asc' ? asc(vals) : desc(vals);
    rows.at(-1).sorted_correctly = sorted;
    rows.at(-1).head = vals.slice(0, 4);
    console.log(`   sort_by=${sort_by} order=${order} -> sorted=${sorted} head=${JSON.stringify(vals.slice(0, 4))}`);
  }
}
await probe('/v1/listings', { sort_by: 'not_a_field' }, null);

console.log('\n--- rentals + projects params ---');
await probe('/v1/rentals', { locality: 'velachery' }, (x) => x.locality === 'velachery', (x) => x.locality);
await probe('/v1/rentals', { bhk: 2 }, (x) => x.bedroom === 2, (x) => x.bedroom);
await probe('/v1/rentals', { furnishing: 'fully-furnished' }, (x) => x.furnishing === 'fully-furnished', (x) => x.furnishing);
await probe('/v1/projects', { locality: 'velachery' }, (x) => x.locality === 'velachery', (x) => x.locality);
await probe('/v1/projects', { project_status: 'under construction' }, (x) => x.project_status === 'under construction', (x) => x.project_status);
for (const sort_by of ['price_min', 'price_max', 'launch_date', 'total_units']) {
  const j = await probe('/v1/projects', { sort_by, order: 'desc' }, null);
  const vals = (j?.results ?? []).map((x) => x[sort_by]);
  rows.at(-1).sorted_correctly = desc(vals);
  rows.at(-1).head = vals.slice(0, 4);
  console.log(`   projects sort_by=${sort_by} desc -> sorted=${desc(vals)} head=${JSON.stringify(vals.slice(0, 4))}`);
}

writeFileSync(join(ROOT, 'data/raw/probe-09-params.json'), JSON.stringify(redact(rows), null, 2));
console.log('\nwrote data/raw/probe-09-params.json');
