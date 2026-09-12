// Phase 0.3b — read the undocumented surface in full; it is the API describing itself.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { call, login, ROOT, redact } from './lib.mjs';

const { token } = await login();
const out = {};
for (const p of ['/', '/v1/me', '/v1/localities']) {
  const r = await call(p, { token });
  out[p] = r.json;
  console.log('=== ' + p + ' ===');
  console.log(JSON.stringify(r.json, null, 2).slice(0, 2200));
  console.log();
}

// What does /v1/saved support?
console.log('=== /v1/saved method probe ===');
const sampleId = (await call('/v1/listings', { token, query: { limit: 1 } })).json.results[0].listing_id;
const probes = [
  ['POST', '/v1/saved', { id: sampleId }],
  ['POST', '/v1/saved', { listing_id: sampleId }],
];
for (const [method, path, body] of probes) {
  const r = await call(path, { method, token, body });
  console.log(method, path, JSON.stringify(body), '->', r.status, JSON.stringify(r.json)?.slice(0, 260));
  out[`${method} ${path} ${JSON.stringify(body)}`] = { status: r.status, body: r.json };
}
const after = await call('/v1/saved', { token });
console.log('GET /v1/saved ->', after.status, 'count=', after.json?.count);
out['GET /v1/saved after post'] = { status: after.status, count: after.json?.count, first: after.json?.results?.[0] };

for (const path of [`/v1/saved/${sampleId}`]) {
  const r = await call(path, { method: 'DELETE', token });
  console.log('DELETE', path.replace(sampleId, '{id}'), '->', r.status, JSON.stringify(r.json)?.slice(0, 200));
  out[`DELETE /v1/saved/{id}`] = { status: r.status, body: r.json };
}
const after2 = await call('/v1/saved', { token });
console.log('GET /v1/saved after delete ->', after2.status, 'count=', after2.json?.count);
out['GET /v1/saved after delete'] = { status: after2.status, count: after2.json?.count };

writeFileSync(join(ROOT, 'data/raw/probe-04-undocumented.json'), JSON.stringify(redact(out), null, 2));
console.log('\nwrote data/raw/probe-04-undocumented.json');
