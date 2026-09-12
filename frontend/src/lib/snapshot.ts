// A local copy of the pull, in IndexedDB, so a reload does not cost another
// 123 requests.
//
// What is stored is what the API served, before correction. The rules in
// corrections.ts and flags.ts re-run over it on every load, so a cached copy
// can never carry a stale badge or a stale unit - only stale records, and the
// header says how old those are.

import type { Listing, Project, Rental } from './corrections';

export const SNAPSHOT_VERSION = 1;

/** Older than this, the copy is still shown but re-pulled in the background. */
export const SNAPSHOT_STALE_MS = 12 * 3600_000;

export type Snapshot = {
  version: typeof SNAPSHOT_VERSION;
  fetchedAt: number;
  listings: Listing[];
  rentals: Rental[];
  projects: Project[];
  /** what each collection claimed its total was, kept to show the shortfall */
  declaredTotals: { listings: number; rentals: number; projects: number };
  me: { city: string; assigned_locality: string; reference_date: string } | null;
};

const DB_NAME = 'ivy-homes';
const STORE = 'snapshots';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = op(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** The stored copy for this key, or null if there is none or storage is unavailable. */
export async function readSnapshot(key: string): Promise<Snapshot | null> {
  try {
    const s = (await run('readonly', (st) => st.get(key))) as Snapshot | undefined;
    return s && s.version === SNAPSHOT_VERSION ? s : null;
  } catch {
    return null; // private mode, blocked storage: the app just pulls every time
  }
}

export async function writeSnapshot(key: string, snapshot: Snapshot): Promise<void> {
  try {
    await run('readwrite', (st) => st.put(snapshot, key));
  } catch {
    /* not fatal - the next load pulls again */
  }
}
