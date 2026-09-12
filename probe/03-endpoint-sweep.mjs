// Phase 0.3 — which documented paths exist, which 404, and what exists undocumented.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { call, login, ROOT, redact } from './lib.mjs';

const sess = await login();
const token = sess.token;
const rows = [];

// Grab one real id of each kind first, so the {id} probes are honest.
const l0 = await call('/v1/listings', { token, query: { limit: 1 } });
const p0 = await call('/v1/projects', { token, query: { limit: 1 } });
const r0 = await call('/v1/rentals', { token, query: { limit: 1 } });
const listingId = l0.json?.results?.[0]?.listing_id;
const projectId = p0.json?.results?.[0]?.project_id;
const rentalId  = r0.json?.results?.[0]?.listing_id;
console.log('sample ids:', JSON.stringify({ listingId, projectId, rentalId }));

const ids = [listingId, projectId, rentalId].filter(Boolean);
const mask = (p) => ids.reduce((acc, id) => acc.split(id).join('{id}'), p);

const paths = [
  ['GET', '/v1/listings'], ['GET', '/v1/rentals'], ['GET', '/v1/projects'],
  ['GET', `/v1/listing/${listingId}`], ['GET', `/v1/listings/${listingId}`],
  ['GET', `/v1/listings/${listingId}/similar`], ['GET', `/v1/listing/${listingId}/similar`],
  ['GET', `/v1/rentals/${rentalId}`], ['GET', `/v1/rental/${rentalId}`],
  ['GET', `/v1/projects/${projectId}`], ['GET', `/v1/project/${projectId}`],
  ['GET', `/v1/projects/${projectId}/listings`],
  ['GET', '/v1/favourites'], ['GET', '/v1/favorites'],
  ['GET', '/v1/saved'], ['GET', '/v1/saved-listings'], ['GET', '/v1/users/me/favourites'],
  ['GET', '/v1/analytics/summary'], ['GET', '/v1/analytics'], ['GET', '/v1/analytics/localities'],
  ['GET', '/v1/analytics/price-trends'], ['GET', '/v1/analytics/overview'], ['GET', '/v1/stats/summary'],
  ['GET', '/v1/localities'], ['GET', '/v1/cities'], ['GET', '/v1/city'], ['GET', '/v1/me'],
  ['GET', '/v1/search'], ['GET', '/v1/agents'], ['GET', '/v1/builders'], ['GET', '/v1/developers'],
  ['GET', '/openapi.json'], ['GET', '/docs'], ['GET', '/redoc'], ['GET', '/health'], ['GET', '/'],
  ['GET', '/v1'], ['GET', '/version'],
];

for (const [method, path] of paths) {
  const r = await call(path, { method, token });
  const body = r.json;
  const shape = Array.isArray(body) ? `array[${body.length}]`
    : body && typeof body === 'object' ? Object.keys(body).slice(0, 12).join(',')
    : typeof body;
  rows.push({ method, path: mask(path), status: r.status, shape, detail: body?.detail });
  console.log(String(r.status).padEnd(4), method.padEnd(5), mask(path).padEnd(40), String(shape ?? '').slice(0, 95));
}

writeFileSync(join(ROOT, 'data/raw/probe-03-endpoint-sweep.json'), JSON.stringify(redact({ sampleIds: { listingId, projectId, rentalId }, rows }), null, 2));
console.log('\nwrote data/raw/probe-03-endpoint-sweep.json');
