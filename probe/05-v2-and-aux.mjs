// Phase 0.3c — the v2 surface and aux files advertised by /llms.txt.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { call, login, ROOT, redact } from './lib.mjs';

const { token } = await login();
const out = {};
const sampleId = (await call('/v1/listings', { token, query: { limit: 1 } })).json.results[0].listing_id;

const v2 = [
  ['GET', '/v2/listings', {}],
  ['GET', '/v2/listings/search', { q: '2 bhk in velachery' }],
  ['GET', '/v2/insights/summary', {}],
  ['GET', `/v2/valuation/${sampleId}`, {}],
  ['GET', '/v2/listings/' + sampleId, {}],
];
for (const [method, path, query] of v2) {
  const r = await call(path, { method, token, query });
  const key = path.split(sampleId).join('{id}');
  out[key] = { status: r.status, body: r.json ?? r.text };
  console.log(String(r.status).padEnd(4), key.padEnd(34), JSON.stringify(r.json ?? r.text).slice(0, 200));
}

for (const f of ['/sitemap.xml', '/robots.txt', '/humans.txt', '/ads.txt', '/.well-known/ai-plugin.json', '/llms-full.txt']) {
  const res = await fetch('https://solve.ivy.homes' + f);
  const t = await res.text();
  out[f] = { status: res.status, bytes: t.length, head: t.slice(0, 700) };
  console.log(String(res.status).padEnd(4), f.padEnd(34), `${t.length} bytes`);
}

writeFileSync(join(ROOT, 'data/raw/probe-05-v2-aux.json'), JSON.stringify(redact(out), null, 2));
console.log('\nwrote data/raw/probe-05-v2-aux.json');
