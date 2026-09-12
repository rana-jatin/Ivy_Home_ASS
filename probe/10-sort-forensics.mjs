// Which sorts actually sort, and what is the server ordering by when it does not?
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { call, login, ROOT, redact } from './lib.mjs';

const { token } = await login();
const out = {};

async function inspect(path, sort_by, order, fields) {
  const r = await call(path, { token, query: { sort_by, order, limit: 50 } });
  const res = r.json.results;
  const vals = res.map((x) => x[sort_by]);
  const cmp = order === 'asc' ? (a, b) => a >= b : (a, b) => a <= b;
  const breaks = [];
  for (let i = 1; i < vals.length; i++) if (!cmp(vals[i], vals[i - 1])) breaks.push({ i, prev: vals[i - 1], cur: vals[i], id: res[i].listing_id ?? res[i].project_id });
  // try other columns to see what IS monotonic
  const alsoSorted = [];
  for (const f of fields) {
    const fv = res.map((x) => x[f]);
    if (fv.every((v) => v !== null && v !== undefined) && fv.every((v, i) => i === 0 || cmp(v, fv[i - 1]))) alsoSorted.push(f);
  }
  const row = { path, sort_by, order, monotonic: breaks.length === 0, break_count: breaks.length, first_breaks: breaks.slice(0, 4), head: vals.slice(0, 6), other_columns_monotonic: alsoSorted };
  out[`${path} ${sort_by} ${order}`] = row;
  console.log(`${sort_by} ${order}`.padEnd(24), `monotonic=${String(row.monotonic).padEnd(5)}`, `breaks=${String(breaks.length).padEnd(3)}`, 'head=', JSON.stringify(vals.slice(0, 5)));
  if (breaks.length) console.log('   first break:', JSON.stringify(breaks[0]));
  if (alsoSorted.length) console.log('   actually monotonic in:', alsoSorted.join(', '));
  return res;
}

const lf = ['price', 'carpet_area', 'super_built_up_area', 'bedroom', 'posted_at', 'listing_id', 'bathroom', 'floor'];
console.log('=== /v1/listings ===');
for (const s of ['price', 'carpet_area', 'posted_at', 'bedroom']) {
  for (const o of ['asc', 'desc']) await inspect('/v1/listings', s, o, lf);
}

console.log('\n=== /v1/rentals ===');
const rf = ['price', 'carpet_area', 'super_builtup_area', 'bedroom', 'posted_at', 'deposit'];
for (const s of ['price', 'carpet_area', 'posted_at', 'bedroom']) {
  for (const o of ['asc', 'desc']) await inspect('/v1/rentals', s, o, rf);
}

console.log('\n=== /v1/projects ===');
const pf = ['price_min', 'price_max', 'launch_date', 'total_units', 'total_floors', 'min_area_sqft', 'max_area_sqft'];
for (const s of ['price_min', 'price_max', 'launch_date', 'total_units']) {
  for (const o of ['asc', 'desc']) await inspect('/v1/projects', s, o, pf);
}

writeFileSync(join(ROOT, 'data/raw/probe-10-sort.json'), JSON.stringify(redact(out), null, 2));
console.log('\nwrote data/raw/probe-10-sort.json');
