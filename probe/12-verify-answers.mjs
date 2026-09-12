// Independent verification against the live API for the answers that can be
// re-derived a second way: filtered endpoints paged to exhaustion.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { call, login, ROOT, redact, E } from './lib.mjs';

let TOKEN = (await login()).token;
async function walkAll(path, query) {
  const out = []; let offset = 0;
  for (;;) {
    const r = await call(path, { token: TOKEN, query: { ...query, limit: 50, offset } });
    if (r.status === 401) { TOKEN = (await login()).token; continue; }
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    out.push(...r.json.results);
    if (!r.json.has_more || r.json.count === 0) return { records: out, declared_total: r.json.total };
    offset += r.json.count;
  }
}

const results = {};
console.log('--- Q5: rentals in', E.IVY_LOCALITY, '---');
const w = await walkAll('/v1/rentals', { locality: E.IVY_LOCALITY });
const sum = w.records.reduce((a, r) => a + r.price, 0);
console.log(`server-filtered walk: ${w.records.length} records (declared total ${w.declared_total}), rent sum ${sum}`);
results.q5 = { records: w.records.length, declared_total: w.declared_total, sum, ids: w.records.map((r) => r.listing_id) };

console.log('\n--- Q1/Q3: does a filtered walk agree with the offline snapshot? ---');
for (const loc of ['velachery', 'guindy', 'omr']) {
  const x = await walkAll('/v1/listings', { locality: loc });
  console.log(`  ${loc.padEnd(12)} walked ${String(x.records.length).padStart(4)}  declared total ${String(x.declared_total).padStart(4)}  is_live true ${x.records.filter((r) => r.is_live).length}`);
  results[`listings_${loc}`] = { walked: x.records.length, declared_total: x.declared_total, live: x.records.filter((r) => r.is_live).length };
}

console.log('\n--- Q7: fetch the costliest project on its own, unsorted ---');
const p = await call('/v1/projects/P40224', { token: TOKEN });
console.log('  GET /v1/projects/P40224 ->', p.status, JSON.stringify({ price_min: p.json?.price_min, price_max: p.json?.price_max, name: p.json?.apartment_name, total_listings: p.json?.total_listings }));
results.q7 = p.json;

console.log('\n--- does the detail endpoint agree with the collection? ---');
const first = (await call('/v1/listings', { token: TOKEN, query: { limit: 3 } })).json.results;
for (const r of first) {
  const d = await call(`/v1/listings/${r.listing_id}`, { token: TOKEN });
  const same = JSON.stringify(d.json) === JSON.stringify(r);
  console.log(`  ${r.listing_id} detail matches collection: ${same}`);
  if (!same) console.log('    collection:', JSON.stringify(r).slice(0, 200), '\n    detail    :', JSON.stringify(d.json).slice(0, 200));
}

writeFileSync(join(ROOT, 'data/raw/probe-12-verify.json'), JSON.stringify(redact(results), null, 2));
console.log('\nwrote data/raw/probe-12-verify.json');
