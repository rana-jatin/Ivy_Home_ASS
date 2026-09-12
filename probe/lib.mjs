// Shared plumbing for every probe and pull script.
// Secrets live in .env and are never printed; scripts log paths and shapes only.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function env() {
  const raw = readFileSync(join(ROOT, '.env'), 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

export const E = env();
export const BASE = E.IVY_BASE_URL;

let requests = 0;
export const reqCount = () => requests;

// One call. Returns status + parsed body + headers, never throws on HTTP error:
// error bodies are the point of most probes.
export async function call(path, opts = {}) {
  const {
    method = 'GET', query = {}, body, token, keyIn = 'x-api-key', headers = {},
  } = opts;
  const url = new URL(path.startsWith('http') ? path : BASE + path);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const h = { Accept: 'application/json', ...headers };
  if (keyIn === 'query') url.searchParams.set('api_key', E.IVY_API_KEY);
  else if (keyIn === 'x-api-key') h['X-API-Key'] = E.IVY_API_KEY;
  else if (keyIn === 'authorization') h['Authorization'] = E.IVY_API_KEY;
  else if (keyIn === 'bearer-key') h['Authorization'] = `Bearer ${E.IVY_API_KEY}`;
  // keyIn === 'none' -> no key at all
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';

  requests++;
  const started = Date.now();
  const res = await fetch(url, {
    method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  return {
    status: res.status,
    ok: res.ok,
    ms: Date.now() - started,
    headers: Object.fromEntries(res.headers),
    json,
    text: json ? undefined : text.slice(0, 400),
  };
}

export async function login(email = E.IVY_EMAIL) {
  const r = await call('/auth/login', {
    method: 'POST', body: { email, password: E.IVY_PASSWORD },
  });
  if (!r.ok) throw new Error(`login failed ${r.status} ${JSON.stringify(r.json ?? r.text)}`);
  // The docs promise `token`; the API sends `access_token` (plus a refresh token).
  return { ...r.json, token: r.json.access_token ?? r.json.token };
}

export function jwtClaims(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString()); } catch { return null; }
}

// Redact anything that looks like a secret before writing evidence to disk.
export function redact(obj) {
  const s = JSON.stringify(obj);
  return JSON.parse(
    s.replaceAll(E.IVY_API_KEY, '<API_KEY>').replaceAll(E.IVY_PASSWORD, '<PASSWORD>')
  );
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
