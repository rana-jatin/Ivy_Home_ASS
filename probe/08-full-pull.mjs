// Phase 1 — page every collection to exhaustion with no filters.
// Walk on has_more. `total` is provably an undercount (probe 07), so it is
// recorded as evidence and never used as a loop bound.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { call, login, ROOT, reqCount } from './lib.mjs';

const LIMIT = 50; // the server clamps anything above this
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

async function walk(path, idKey) {
  const pages = [];
  const records = [];
  let offset = 0;
  let declaredTotal = null;
  let guard = 0;
  for (;;) {
    if (++guard > 400) throw new Error('guard tripped on ' + path);
    const r = await call(path, { token: TOKEN, query: { limit: LIMIT, offset } });
    if (r.status === 401) { // access token is only 15 min; re-auth and retry
      TOKEN = (await login()).token;
      continue;
    }
    if (!r.ok) throw new Error(`${path} offset=${offset} -> ${r.status} ${JSON.stringify(r.json)}`);
    const j = r.json;
    pages.push({ offset, limit: j.limit, count: j.count, total: j.total, has_more: j.has_more, ids: j.results.map((x) => x[idKey]) });
    records.push(...j.results);
    process.stdout.write(`\r${path} offset=${offset} count=${j.count} total=${j.total} has_more=${j.has_more} pulled=${records.length}   `);
    if (declaredTotal === null) declaredTotal = j.total;
    if (!j.has_more || j.count === 0) break;
    offset += j.count;
  }
  console.log();
  const ids = records.map((r) => r[idKey]);
  const unique = new Set(ids);
  const audit = {
    path,
    pulled: records.length,
    declared_total: declaredTotal,
    declared_total_matches_pulled: declaredTotal === records.length,
    unique_ids: unique.size,
    duplicate_ids_in_pull: ids.length - unique.size,
    pages: pages.length,
    pulled_at: new Date().toISOString(),
  };
  console.log(JSON.stringify(audit, null, 2));
  return { audit, pages, records };
}

let TOKEN = (await login()).token;

const result = {};
for (const [path, idKey, name] of [
  ['/v1/listings', 'listing_id', 'listings'],
  ['/v1/rentals', 'listing_id', 'rentals'],
  ['/v1/projects', 'project_id', 'projects'],
]) {
  const w = await walk(path, idKey);
  writeFileSync(join(ROOT, `data/raw/${name}-${stamp}.json`), JSON.stringify({ audit: w.audit, records: w.records }, null, 2));
  writeFileSync(join(ROOT, `data/${name}.json`), JSON.stringify(w.records));
  result[name] = w.audit;
}

writeFileSync(join(ROOT, 'data/raw/pull-audit.json'), JSON.stringify({ stamp, requests: reqCount(), result }, null, 2));
console.log('\n=== pull audit ===');
console.log(JSON.stringify(result, null, 2));
console.log('requests used:', reqCount());
