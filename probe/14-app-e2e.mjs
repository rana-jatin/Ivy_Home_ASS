// End-to-end test of the frontend's own API client against the live service:
// real login, a full paged pull through fetchAll, the saved-listings round trip,
// and a forced token refresh. Node has fetch and localStorage is stubbed, so the
// browser client runs unmodified.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { ROOT, E } from './lib.mjs';

// --- browser shims ---
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const tmp = mkdtempSync(join(tmpdir(), 'ivy-e2e-'));
const entry = join(tmp, 'entry.ts');
writeFileSync(entry, `export * from ${JSON.stringify(join(ROOT, 'frontend/src/api/client.ts'))};`);
const out = join(tmp, 'bundle.mjs');
const esbuild = await import(pathToFileURL(join(ROOT, 'frontend/node_modules/esbuild/lib/main.js')).href);
await esbuild.build({
  entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
  // import.meta.env is Vite's; supply the same two values the build would inline
  define: {
    'import.meta.env.VITE_IVY_BASE_URL': JSON.stringify(E.IVY_BASE_URL),
    'import.meta.env.VITE_IVY_API_KEY': JSON.stringify(E.IVY_API_KEY),
  },
});
const c = await import(pathToFileURL(out).href);

const step = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
};

// 1. login
const s = await c.login(E.IVY_EMAIL, E.IVY_PASSWORD);
step('login returns an access token', !!s.access_token);
step('login returns a refresh token', !!s.refresh_token);
step('session persisted to localStorage', !!c.loadSession(), '(this is what survives a page refresh)');

// 2. a wrong password must fail cleanly, with the server's own message
try {
  await c.login(E.IVY_EMAIL, 'definitely-not-it');
  step('a wrong password is rejected', false);
} catch (e) {
  step('a wrong password is rejected', e.status === 401, `-> ${e.message}`);
  await c.login(E.IVY_EMAIL, E.IVY_PASSWORD); // restore
}

// 3. full pull through the client the app actually uses
let lastDeclared = 0;
const listings = await c.fetchAll('/v1/listings', (_l, d) => { lastDeclared = d; });
const snapshot = JSON.parse(readFileSync(join(ROOT, 'data/listings.json'), 'utf8'));
step('fetchAll walks past the declared total', listings.length > lastDeclared, `${listings.length} pulled vs total ${lastDeclared}`);
step('fetchAll matches the offline snapshot', listings.length === snapshot.length, `${listings.length} == ${snapshot.length}`);
const ids = new Set(listings.map((r) => r.listing_id));
step('no record served twice', ids.size === listings.length);

// 4. saved listings round trip
const target = listings[0].listing_id;
const before = await c.getSaved();
for (const r of before.results ?? []) await c.removeSaved(r.listing_id);
await c.addSaved(target);
const mid = await c.getSaved();
step('add then list returns the listing', mid.results.some((r) => r.listing_id === target));
await c.removeSaved(target);
const after = await c.getSaved();
step('remove clears it', !after.results.some((r) => r.listing_id === target));

// 5. /v1/me
const me = await c.getMe();
step('/v1/me names the city and locality', me.city === E.IVY_CITY && me.assigned_locality === E.IVY_LOCALITY, `${me.city}/${me.assigned_locality}`);

// 6. the 30-minute requirement: expire the stored token and prove recovery.
// Rewriting expires_at makes the client believe it is stale, which is the same
// branch a 30-minute-old session takes.
const cur = c.loadSession();
mem.set('ivy.session', JSON.stringify({ ...cur, expires_at: Date.now() - 1 }));
const reloaded = c.loadSession();
step('a stale session is still readable from storage', reloaded.expires_at < Date.now());
// force the module's in-memory copy to the stale one by signing in through it again
await c.login(E.IVY_EMAIL, E.IVY_PASSWORD);
const live = c.getSession();
mem.set('ivy.session', JSON.stringify({ ...live, expires_at: Date.now() - 1 }));

// and the real thing: hand the client a genuinely dead access token
const dead = { ...live, access_token: live.access_token.slice(0, -4) + 'zzzz' };
mem.set('ivy.session', JSON.stringify(dead));
const c2 = await import(pathToFileURL(out).href + '?reload=1'); // fresh module, reads storage
const recovered = await c2.api('/v1/listings?limit=1');
step('a dead access token is refreshed and the request retried', Array.isArray(recovered.results), `got ${recovered.results?.length} record(s)`);

console.log(process.exitCode ? '\nsome checks failed' : '\nevery end-to-end check passed');
