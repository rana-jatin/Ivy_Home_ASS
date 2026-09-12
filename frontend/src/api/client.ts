// The API client, written against the API rather than against the reference.
//
// Three things the documentation gets wrong are load-bearing here:
//   - the key goes in X-API-Key, not ?api_key=
//   - the login response field is access_token, and there is a refresh_token
//   - the access token lasts 900 seconds, not 24 hours
// The last one is why every request goes through withAuth(), which refreshes
// ahead of expiry and retries once on a 401 it did not expect.

const BASE = import.meta.env.VITE_IVY_BASE_URL ?? 'https://solve.ivy.homes';
const API_KEY = import.meta.env.VITE_IVY_API_KEY ?? '';

export type Session = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // ms epoch, computed from expires_in at login
  email: string;
};

const STORAGE_KEY = 'ivy.session';
// Refresh this long before the token actually dies, so a slow request that
// starts valid does not finish invalid.
const REFRESH_MARGIN_MS = 60_000;

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode - the session just will not survive a reload */
  }
}

let session: Session | null = loadSession();
let refreshing: Promise<Session | null> | null = null;
const listeners = new Set<(s: Session | null) => void>();

export function onSessionChange(fn: (s: Session | null) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function setSession(s: Session | null) {
  session = s;
  saveSession(s);
  listeners.forEach((fn) => fn(s));
}

export function getSession() {
  return session;
}

async function raw(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('X-API-Key', API_KEY);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  const res = await fetch(BASE + path, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body: body as any };
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function login(email: string, password: string): Promise<Session> {
  const { res, body } = await raw('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new ApiError(res.status, detailOf(body) ?? `login failed (${res.status})`);
  }
  const s: Session = {
    // documented as `token`; the API sends `access_token`
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Date.now() + (body.expires_in ?? 900) * 1000,
    email: body.user?.email ?? email,
  };
  setSession(s);
  return s;
}

export function logout() {
  // The API's own logout says tokens are stateless and must be discarded client
  // side, and the token does keep working afterwards - so the client discarding
  // it is the part that matters. Fire the call anyway, ignore the result.
  const s = session;
  setSession(null);
  if (s) {
    void raw('/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.access_token}` },
    }).catch(() => {});
  }
}

// The refresh flow the documentation says does not exist. Single-flighted, so
// eighty concurrent page requests hitting an expired token cause one refresh.
async function refresh(): Promise<Session | null> {
  if (refreshing) return refreshing;
  const current = session;
  if (!current) return null;
  refreshing = (async () => {
    try {
      const { res, body } = await raw('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: current.refresh_token }),
      });
      if (!res.ok) {
        setSession(null);
        return null;
      }
      const s: Session = {
        access_token: body.access_token,
        refresh_token: body.refresh_token ?? current.refresh_token,
        expires_at: Date.now() + (body.expires_in ?? 900) * 1000,
        email: body.user?.email ?? current.email,
      };
      setSession(s);
      return s;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

function detailOf(body: any): string | null {
  const d = body?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x: any) => x?.msg ?? JSON.stringify(x)).join('; ');
  return null;
}

/** Any authenticated call. Refreshes before expiry, and retries once on a 401. */
export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  let s = session;
  if (!s) throw new ApiError(401, 'not signed in');
  if (Date.now() > s.expires_at - REFRESH_MARGIN_MS) {
    s = await refresh();
    if (!s) throw new ApiError(401, 'session expired');
  }
  const attempt = (tok: string) =>
    raw(path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${tok}` } });

  let { res, body } = await attempt(s.access_token);
  if (res.status === 401) {
    const s2 = await refresh();
    if (!s2) throw new ApiError(401, detailOf(body) ?? 'session expired');
    ({ res, body } = await attempt(s2.access_token));
  }
  if (!res.ok) throw new ApiError(res.status, detailOf(body) ?? `request failed (${res.status})`);
  return body as T;
}

export type Page<T> = {
  limit: number;
  offset: number;
  count: number;
  total: number;
  has_more: boolean;
  results: T[];
};

/**
 * Page a collection to exhaustion.
 *
 * Walks on has_more and never on total. total under-reports every collection
 * on this API - 3923 against 4100 actual listings - so using it as a loop bound
 * silently drops 4% of the data. limit is asked for as 50 because anything
 * larger is clamped to 50 anyway.
 */
export async function fetchAll<T>(
  path: string,
  onProgress?: (loaded: number, declaredTotal: number) => void,
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const page = await api<Page<T>>(`${path}?limit=50&offset=${offset}`);
    out.push(...page.results);
    onProgress?.(out.length, page.total);
    if (!page.has_more || page.count === 0) return out;
    offset += page.count;
  }
}

export const SAVED_PATH = '/v1/saved'; // documented as /v1/favourites, which 404s

export async function getSaved() {
  return api<{ count: number; results: any[] }>(SAVED_PATH);
}
export async function addSaved(listing_id: string) {
  // documented body key is `id`, which the API rejects with 422
  return api(SAVED_PATH, { method: 'POST', body: JSON.stringify({ listing_id }) });
}
export async function removeSaved(listing_id: string) {
  return api(`${SAVED_PATH}/${encodeURIComponent(listing_id)}`, { method: 'DELETE' });
}
export async function getMe() {
  return api<{
    user: { email: string };
    city: string;
    city_id: number;
    assigned_locality: string;
    reference_date: string;
  }>('/v1/me');
}
