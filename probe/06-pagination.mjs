// Phase 0.4 — how paging really works, and whether `total` can be trusted.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { call, login, ROOT, redact } from './lib.mjs';

const { token } = await login();
const out = {};
const meta = (j) => j && ({ limit: j.limit, offset: j.offset, count: j.count, total: j.total, has_more: j.has_more, page: j.page, page_size: j.page_size, results: j.results?.length });

console.log('--- documented page/limit params ---');
for (const q of [{}, { page: 1 }, { page: 2 }, { page: 0 }, { page: 3, limit: 5 }, { limit: 5 }, { limit: 5, offset: 5 }]) {
  const r = await call('/v1/listings', { token, query: q });
  const m = meta(r.json);
  out[`listings ${JSON.stringify(q)}`] = { status: r.status, meta: m, first_id: r.json?.results?.[0]?.listing_id, last_id: r.json?.results?.at(-1)?.listing_id };
  console.log(JSON.stringify(q).padEnd(26), r.status, JSON.stringify(m), 'first=', r.json?.results?.[0]?.listing_id);
}

console.log('\n--- limit ceiling ---');
for (const limit of [100, 200, 201, 500, 1000, -1, 0]) {
  const r = await call('/v1/listings', { token, query: { limit } });
  const m = meta(r.json);
  out[`limit=${limit}`] = { status: r.status, meta: m, detail: r.json?.detail };
  console.log(String(limit).padEnd(8), r.status, JSON.stringify(m ?? r.json?.detail));
}

console.log('\n--- past the end ---');
const t = (await call('/v1/listings', { token, query: { limit: 1 } })).json.total;
for (const offset of [t - 1, t, t + 50]) {
  const r = await call('/v1/listings', { token, query: { limit: 10, offset } });
  out[`offset=${offset}(total=${t})`] = { status: r.status, meta: meta(r.json) };
  console.log(`offset=${offset}`.padEnd(18), r.status, JSON.stringify(meta(r.json)));
}

console.log('\n--- declared totals per collection ---');
for (const c of ['/v1/listings', '/v1/rentals', '/v1/projects']) {
  const r = await call(c, { token, query: { limit: 1 } });
  out[`total ${c}`] = meta(r.json);
  console.log(c.padEnd(16), JSON.stringify(meta(r.json)));
}

console.log('\n--- is paging stable? same window twice ---');
const a = await call('/v1/listings', { token, query: { limit: 20, offset: 1000 } });
const b = await call('/v1/listings', { token, query: { limit: 20, offset: 1000 } });
const idsA = a.json.results.map((x) => x.listing_id), idsB = b.json.results.map((x) => x.listing_id);
out['stability'] = { identical: JSON.stringify(idsA) === JSON.stringify(idsB), sample: idsA.slice(0, 3) };
console.log('identical windows:', JSON.stringify(idsA) === JSON.stringify(idsB));

writeFileSync(join(ROOT, 'data/raw/probe-06-pagination.json'), JSON.stringify(redact(out), null, 2));
console.log('\nwrote data/raw/probe-06-pagination.json');
