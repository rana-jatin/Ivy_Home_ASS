// Phase 0.2 — measure the real access-token lifetime, and prove /auth/refresh works.
// Docs claim 24h and "no refresh flow"; login says expires_in=900. Which is true?
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { call, login, sleep, ROOT, redact } from './lib.mjs';

const log = [];
const t0 = Date.now();
const mark = () => ((Date.now() - t0) / 1000).toFixed(0);

const sess = await login();
log.push({ at_s: 0, event: 'login', expires_in: sess.expires_in, has_refresh: !!sess.refresh_token });
console.log(`[0s] logged in, expires_in=${sess.expires_in}`);

let token = sess.token;
let firstFailure = null;

// Poll an authed endpoint every 60s until it 401s, up to 25 minutes.
for (let i = 1; i <= 25 && !firstFailure; i++) {
  await sleep(60_000);
  const r = await call('/v1/listings', { token, query: { limit: 1 } });
  log.push({ at_s: Number(mark()), event: 'poll', status: r.status, detail: r.json?.detail });
  console.log(`[${mark()}s] /v1/listings -> ${r.status} ${r.json?.detail ?? ''}`);
  if (r.status === 401) firstFailure = Number(mark());
}

log.push({ event: 'first_401_at_s', at_s: firstFailure });

// Now prove the undocumented refresh flow restores access.
const rf = await call('/auth/refresh', { method: 'POST', body: { refresh_token: sess.refresh_token } });
log.push({ at_s: Number(mark()), event: 'refresh', status: rf.status, keys: rf.json ? Object.keys(rf.json) : null, expires_in: rf.json?.expires_in });
console.log(`[${mark()}s] refresh -> ${rf.status} keys=${rf.json ? Object.keys(rf.json) : null}`);

if (rf.json?.access_token) {
  const after = await call('/v1/listings', { token: rf.json.access_token, query: { limit: 1 } });
  log.push({ at_s: Number(mark()), event: 'authed_after_refresh', status: after.status });
  console.log(`[${mark()}s] authed call after refresh -> ${after.status}`);
}

writeFileSync(join(ROOT, 'data/raw/probe-02-token-ttl.json'), JSON.stringify(redact(log), null, 2));
console.log('wrote data/raw/probe-02-token-ttl.json');
