// `total` says 3923 but offset=3973 still returns records. Where does it actually stop?
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { call, login, ROOT, redact } from './lib.mjs';

const { token } = await login();
const out = {};
for (const path of ['/v1/listings', '/v1/rentals', '/v1/projects']) {
  const head = (await call(path, { token, query: { limit: 1 } })).json;
  const probes = {};
  // walk outward from the declared total until has_more turns false
  for (const off of [head.total, head.total + 100, head.total + 200, head.total + 500, head.total + 1000, head.total + 2000]) {
    const r = await call(path, { token, query: { limit: 10, offset: off } });
    probes[off] = { status: r.status, count: r.json?.count, has_more: r.json?.has_more, total: r.json?.total };
    console.log(path.padEnd(14), `offset=${off}`.padEnd(14), `count=${r.json?.count}`.padEnd(10), `has_more=${r.json?.has_more}`);
    if (r.json?.has_more === false) break;
  }
  out[path] = { declared_total: head.total, probes };
  console.log();
}
writeFileSync(join(ROOT, 'data/raw/probe-07-find-the-end.json'), JSON.stringify(redact(out), null, 2));
console.log('wrote data/raw/probe-07-find-the-end.json');
