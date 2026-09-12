// Claims about sessions that are cheap to test and easy to get wrong:
// does logout actually invalidate, are saved lists per-user, do refresh tokens
// rotate, does a second login invalidate the first.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { call, login, ROOT, redact, E } from './lib.mjs';

const out = {};
const note = (k, v) => { out[k] = v; console.log(k.padEnd(52), JSON.stringify(v)); };

// --- logout ---
const s1 = await login();
const before = await call('/v1/saved', { token: s1.token });
const lo = await call('/auth/logout', { method: 'POST', token: s1.token });
const after = await call('/v1/saved', { token: s1.token });
note('authed before logout', before.status);
note('POST /auth/logout', { status: lo.status, body: lo.json });
note('same token after logout', { status: after.status, detail: after.json?.detail });
note('docs say logout invalidates the token; it does', after.status === 401);

// --- two concurrent sessions for the same user ---
const a = await login(), b = await login();
const aStill = await call('/v1/saved', { token: a.token });
note('first token still valid after a second login', aStill.status === 200);

// --- refresh: does it rotate, and does the old refresh token survive? ---
const r1 = await call('/auth/refresh', { method: 'POST', body: { refresh_token: a.refresh_token } });
note('POST /auth/refresh', { status: r1.status, keys: r1.json ? Object.keys(r1.json) : null, expires_in: r1.json?.expires_in });
note('refresh returns a NEW refresh token', r1.json?.refresh_token !== a.refresh_token);
const r2 = await call('/auth/refresh', { method: 'POST', body: { refresh_token: a.refresh_token } });
note('the old refresh token still works (no rotation enforced)', r2.status);
const badRefresh = await call('/auth/refresh', { method: 'POST', body: { refresh_token: 'nonsense' } });
note('refresh with a junk token', { status: badRefresh.status, detail: badRefresh.json?.detail });

// --- saved listings: per user? ---
const u1 = await login('demo1@ivy.homes');
const u2 = await login('demo2@ivy.homes');
const sample = (await call('/v1/listings', { token: u1.token, query: { limit: 2 } })).json.results;
for (const s of [u1, u2]) { // clear both
  const cur = (await call('/v1/saved', { token: s.token })).json;
  for (const r of cur.results ?? []) await call(`/v1/saved/${r.listing_id}`, { method: 'DELETE', token: s.token });
}
await call('/v1/saved', { method: 'POST', token: u1.token, body: { listing_id: sample[0].listing_id } });
const u1saved = (await call('/v1/saved', { token: u1.token })).json;
const u2saved = (await call('/v1/saved', { token: u2.token })).json;
note('demo1 saved count', u1saved.count);
note('demo2 saved count (should be 0)', u2saved.count);
note('saved lists are per user', u1saved.count === 1 && u2saved.count === 0);

// does a saved item survive a fresh login for the same user?
const u1b = await login('demo1@ivy.homes');
const persisted = (await call('/v1/saved', { token: u1b.token })).json;
note('saved survives a re-login', persisted.count === 1);
note('saved returns full listing objects', Array.isArray(persisted.results) && typeof persisted.results[0] === 'object' && 'price' in (persisted.results[0] ?? {}));

// --- error contract ---
const missing = await call('/v1/listings/DOES-NOT-EXIST', { token: u1b.token });
note('GET a listing that does not exist', { status: missing.status, detail: missing.json?.detail });
const dupSave = await call('/v1/saved', { method: 'POST', token: u1b.token, body: { listing_id: sample[0].listing_id } });
note('saving the same listing twice', { status: dupSave.status, body: dupSave.json });
const delMissing = await call('/v1/saved/NOT-SAVED', { method: 'DELETE', token: u1b.token });
note('deleting something not saved', { status: delMissing.status, detail: delMissing.json?.detail });
const saveUnknown = await call('/v1/saved', { method: 'POST', token: u1b.token, body: { listing_id: 'NOPE-1' } });
note('saving a listing id that does not exist', { status: saveUnknown.status, detail: saveUnknown.json?.detail });

// cleanup
await call(`/v1/saved/${sample[0].listing_id}`, { method: 'DELETE', token: u1b.token });

writeFileSync(join(ROOT, 'data/raw/probe-13-session.json'), JSON.stringify(redact(out), null, 2));
console.log('\nwrote data/raw/probe-13-session.json');
