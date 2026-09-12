// Phase 0.1/0.2 — server clock, API-key transports, login response shape.
import { writeFileSync } from 'node:fs';
import { call, login, redact, ROOT, E } from './lib.mjs';
import { join } from 'node:path';

const log = [];
const note = (label, data) => { log.push({ label, ...data }); console.log(label, JSON.stringify(data.summary ?? data, null, 0)); };

// --- 1. health / clock ---
const localBefore = Date.now();
const h = await call('/health', { keyIn: 'none' });
const localAfter = Date.now();
note('health', {
  status: h.status,
  body: h.json,
  local_midpoint_iso: new Date((localBefore + localAfter) / 2).toISOString(),
  summary: { status: h.status, body: h.json },
});

// --- 2. API key transports ---
for (const keyIn of ['query', 'x-api-key', 'authorization', 'bearer-key', 'none']) {
  const r = await call('/v1/listings', { keyIn, query: { limit: 1 } });
  note(`key-transport:${keyIn}`, {
    status: r.status,
    detail: r.json?.detail,
    got_results: Array.isArray(r.json?.results) ? r.json.results.length : null,
    summary: { keyIn, status: r.status, detail: r.json?.detail ?? null },
  });
}

// --- 3. bad key, to see the error contract ---
const bad = await call('/v1/listings', { keyIn: 'none', query: { api_key: 'IVY26-DOESNOTEXIST', limit: 1 } });
note('key-transport:bogus-key', { status: bad.status, detail: bad.json?.detail, summary: { status: bad.status, detail: bad.json?.detail } });

// --- 4. login ---
const lr = await call('/auth/login', { method: 'POST', body: { email: E.IVY_EMAIL, password: E.IVY_PASSWORD } });
note('login', {
  status: lr.status,
  keys: lr.json ? Object.keys(lr.json) : null,
  expires_in: lr.json?.expires_in,
  token_type: lr.json?.token_type,
  user: lr.json?.user,
  token_len: lr.json?.token?.length,
  summary: { status: lr.status, keys: lr.json ? Object.keys(lr.json) : null, expires_in: lr.json?.expires_in },
});

// decode JWT payload if it is one (no verification, just reading the claims)
const tok = lr.json?.token;
if (tok && tok.split('.').length === 3) {
  try {
    const payload = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString());
    const span = payload.exp && payload.iat ? payload.exp - payload.iat : null;
    note('login:jwt-claims', {
      claims: { ...payload, sub: payload.sub ? '<sub>' : undefined },
      exp_minus_iat_seconds: span,
      summary: { claims: Object.keys(payload), exp_minus_iat_seconds: span },
    });
  } catch (e) { note('login:jwt-decode-failed', { err: String(e), summary: String(e) }); }
}

// --- 5. wrong password / unknown user ---
for (const [label, body] of [
  ['wrong-password', { email: E.IVY_EMAIL, password: 'not-the-password' }],
  ['unknown-user', { email: 'nobody@ivy.homes', password: E.IVY_PASSWORD }],
  ['missing-field', { email: E.IVY_EMAIL }],
]) {
  const r = await call('/auth/login', { method: 'POST', body });
  note(`login:${label}`, { status: r.status, detail: r.json?.detail ?? r.json, summary: { label, status: r.status } });
}

// --- 6. all three demo users ---
for (const email of ['demo1@ivy.homes', 'demo2@ivy.homes', 'demo3@ivy.homes']) {
  const r = await call('/auth/login', { method: 'POST', body: { email, password: E.IVY_PASSWORD } });
  note(`login:${email}`, { status: r.status, user: r.json?.user, summary: { email, status: r.status, name: r.json?.user?.name } });
}

// --- 7. session endpoints that may or may not exist ---
const token = lr.json?.token;
for (const [method, path] of [['POST', '/auth/logout'], ['POST', '/auth/refresh'], ['GET', '/auth/me'], ['GET', '/v1/auth/me'], ['POST', '/auth/token/refresh']]) {
  const r = await call(path, { method, token });
  note(`auth-endpoint:${method} ${path}`, { status: r.status, body: r.json, summary: { path, status: r.status, detail: r.json?.detail ?? null } });
}

// --- 8. does the token survive the logout we just called? ---
const afterLogout = await call('/v1/favourites', { token });
note('favourites-after-logout', { status: afterLogout.status, body: afterLogout.json, summary: { status: afterLogout.status, detail: afterLogout.json?.detail ?? null } });

// --- 9. authed endpoint with NO token, and with a junk token ---
for (const [label, opt] of [['no-token', {}], ['junk-token', { token: 'not.a.jwt' }]]) {
  const r = await call('/v1/favourites', opt);
  note(`favourites:${label}`, { status: r.status, detail: r.json?.detail, summary: { label, status: r.status, detail: r.json?.detail } });
}

writeFileSync(join(ROOT, 'data/raw/probe-01-health-auth.json'), JSON.stringify(redact(log), null, 2));
console.log('\nwrote data/raw/probe-01-health-auth.json');
