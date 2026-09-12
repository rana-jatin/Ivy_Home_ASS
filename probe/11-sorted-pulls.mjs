// The server sorts on the TRUE stored value while serialising a mixed-unit view.
// So a full pull in sort order is a ground-truth ordering of the real numbers:
// for each record we can solve for the multiplier that keeps the sequence monotonic.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { call, login, ROOT, reqCount } from './lib.mjs';

let TOKEN = (await login()).token;

async function pullSorted(path, sort_by, order, idKey) {
  const recs = [];
  let offset = 0;
  for (;;) {
    const r = await call(path, { token: TOKEN, query: { sort_by, order, limit: 50, offset } });
    if (r.status === 401) { TOKEN = (await login()).token; continue; }
    if (!r.ok) throw new Error(`${path} ${sort_by} offset=${offset} -> ${r.status}`);
    recs.push(...r.json.results);
    if (!r.json.has_more || r.json.count === 0) break;
    offset += r.json.count;
  }
  console.log(`${path} sort_by=${sort_by} ${order}: ${recs.length} records`);
  return recs;
}

const jobs = [
  ['/v1/listings', 'carpet_area', 'asc', 'listings-by-carpet_area'],
  ['/v1/listings', 'posted_at', 'asc', 'listings-by-posted_at'],
  ['/v1/listings', 'price', 'asc', 'listings-by-price'],
  ['/v1/rentals', 'posted_at', 'asc', 'rentals-by-posted_at'],
  ['/v1/rentals', 'price', 'asc', 'rentals-by-price'],
  ['/v1/projects', 'price_max', 'asc', 'projects-by-price_max'],
  ['/v1/projects', 'price_min', 'asc', 'projects-by-price_min'],
];
for (const [path, sort_by, order, name] of jobs) {
  const recs = await pullSorted(path, sort_by, order);
  writeFileSync(join(ROOT, `data/sorted-${name}.json`), JSON.stringify(recs));
}
console.log('requests used:', reqCount());
