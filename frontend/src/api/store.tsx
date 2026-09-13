// One dataset, loaded once, held in memory.
//
// The app filters and pages entirely over this snapshot rather than asking the
// server, because the server's filters cannot be trusted: min_price, max_price,
// furnishing and project_id are all accepted and silently ignored on
// /v1/listings, and `page` does nothing anywhere. Pulling everything once (123
// requests, a few seconds) and filtering locally is the only way the six
// required filters can actually filter.
//
// The raw pull is also kept in IndexedDB (lib/snapshot.ts), so a reload opens
// that copy instead of pulling again. The header shows its age and can re-pull.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DATASET_KEY, fetchAll, getMe, getSession, onSessionChange } from './client';
import {
  fixListing, fixProject, fixRental,
  type FixedListing, type FixedProject, type FixedRental,
  type Listing, type Project, type Rental,
} from '../lib/corrections';
import { computeFlags, type Flags } from '../lib/flags';
import { SNAPSHOT_STALE_MS, SNAPSHOT_VERSION, readSnapshot, writeSnapshot, type Snapshot } from '../lib/snapshot';

export type Dataset = {
  listings: FixedListing[];
  rentals: FixedRental[];
  projects: FixedProject[];
  flags: Flags;
  me: Snapshot['me'];
  /** what each collection claimed its total was, kept to show the shortfall */
  declaredTotals: Snapshot['declaredTotals'];
  listingById: Map<string, FixedListing>;
  projectById: Map<string, FixedProject>;
  /** every listing record that names a project, live or not, by project_id */
  listingsByProject: Map<string, FixedListing[]>;
  /**
   * live listings per project_id. Compared with a project's total_listings,
   * this is the reading that makes most projects agree - see Projects.
   */
  liveListingCount: Map<string, number>;
  /** when the pull behind this dataset finished, ms epoch */
  fetchedAt: number;
};

export type Progress = { loaded: number; declared: number; stage: string };

export type State =
  | { status: 'idle' }
  /** reading the local copy; brief */
  | { status: 'restoring' }
  /** first pull, nothing to show yet; how far it has got is useProgress() */
  | { status: 'loading' }
  /** a refresh may be running behind it - useProgress() is non-null while it does */
  | { status: 'ready'; data: Dataset; refreshError: string | null }
  | { status: 'error'; message: string };

type Ready = Extract<State, { status: 'ready' }>;

const Ctx = createContext<{ state: State; reload: () => void }>({
  state: { status: 'idle' },
  reload: () => {},
});
// Progress changes once per page, about 123 times a pull. It has its own context
// so that only what draws it re-renders that often, not every screen holding the
// dataset.
const ProgressCtx = createContext<Progress | null>(null);

export const useData = () => useContext(Ctx).state;
/** Pull the city again. Keeps the current copy on screen while it runs. */
export const useReload = () => useContext(Ctx).reload;
/** How far the running pull has got - the first one or a refresh - or null if none is running. */
export const useProgress = () => useContext(ProgressCtx);

/** Narrowing helper so pages can assume a loaded dataset. */
export function useDataset(): Dataset | null {
  const s = useData();
  return s.status === 'ready' ? s.data : null;
}

async function pull(onProgress: (p: Progress) => void): Promise<Snapshot> {
  const declaredTotals = { listings: 0, rentals: 0, projects: 0 };
  const listings = await fetchAll<Listing>('/v1/listings', (loaded, declared) => {
    declaredTotals.listings = declared;
    onProgress({ loaded, declared, stage: 'listings' });
  });
  const rentals = await fetchAll<Rental>('/v1/rentals', (loaded, declared) => {
    declaredTotals.rentals = declared;
    onProgress({ loaded, declared, stage: 'rentals' });
  });
  const projects = await fetchAll<Project>('/v1/projects', (loaded, declared) => {
    declaredTotals.projects = declared;
    onProgress({ loaded, declared, stage: 'projects' });
  });
  let me: Snapshot['me'] = null;
  try {
    const m = await getMe(); // undocumented, and it knows the assigned locality
    me = { city: m.city, assigned_locality: m.assigned_locality, reference_date: m.reference_date };
  } catch {
    /* not fatal - the screens fall back to showing every locality */
  }
  return { version: SNAPSHOT_VERSION, fetchedAt: Date.now(), listings, rentals, projects, declaredTotals, me };
}

function build(s: Snapshot): Dataset {
  const listings = s.listings.map(fixListing);
  const projects = s.projects.map(fixProject);
  const listingsByProject = new Map<string, FixedListing[]>();
  for (const r of listings) {
    if (!r.project_id) continue;
    if (!listingsByProject.has(r.project_id)) listingsByProject.set(r.project_id, []);
    listingsByProject.get(r.project_id)!.push(r);
  }
  const liveListingCount = new Map<string, number>();
  for (const [id, rs] of listingsByProject) liveListingCount.set(id, rs.filter((r) => r.is_live).length);
  return {
    listings,
    rentals: s.rentals.map(fixRental),
    projects,
    flags: computeFlags(listings),
    me: s.me,
    declaredTotals: s.declaredTotals,
    listingById: new Map(listings.map((r) => [r.listing_id, r])),
    projectById: new Map(projects.map((p) => [p.project_id, p])),
    listingsByProject,
    liveListingCount,
    fetchedAt: s.fetchedAt,
  };
}

const CANCELLED = Symbol('cancelled');

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const [progress, setProgress] = useState<Progress | null>(null);
  const [signedIn, setSignedIn] = useState(() => !!getSession());
  const [attempt, setAttempt] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const refreshing = useRef(false);

  useEffect(() => onSessionChange((s) => setSignedIn(!!s)), []);

  // A re-pull behind a dataset that is already on screen. Only ever touches a
  // ready state, so signing out halfway through cannot resurrect the old data.
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    const onScreen = (fn: (s: Ready) => State) => setState((s) => (s.status === 'ready' ? fn(s) : s));
    // Returning the same object leaves the dataset context alone, so a refresh
    // that has no old error to clear does not re-render the screen as it starts.
    onScreen((s) => (s.refreshError ? { ...s, refreshError: null } : s));
    setProgress({ loaded: 0, declared: 0, stage: 'listings' });
    try {
      const snap = await pull(setProgress);
      await writeSnapshot(DATASET_KEY, snap);
      onScreen(() => ({ status: 'ready', data: build(snap), refreshError: null }));
    } catch (e: any) {
      onScreen((s) => ({ ...s, refreshError: e?.message ?? String(e) }));
    } finally {
      setProgress(null);
      refreshing.current = false;
    }
  }, []);

  useEffect(() => {
    setProgress(null);
    if (!signedIn) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    (async () => {
      setState({ status: 'restoring' });
      const cached = await readSnapshot(DATASET_KEY);
      if (cancelled) return;
      if (cached) {
        setState({ status: 'ready', data: build(cached), refreshError: null });
        if (Date.now() - cached.fetchedAt > SNAPSHOT_STALE_MS) void refresh();
        return;
      }
      setState({ status: 'loading' });
      setProgress({ loaded: 0, declared: 0, stage: 'listings' });
      try {
        const snap = await pull((p) => {
          if (cancelled) throw CANCELLED; // stops the walk at the next page
          setProgress(p);
        });
        void writeSnapshot(DATASET_KEY, snap);
        if (!cancelled) setState({ status: 'ready', data: build(snap), refreshError: null });
      } catch (e: any) {
        if (!cancelled) setState({ status: 'error', message: e?.message ?? String(e) });
      } finally {
        // a cancelled walk leaves progress to whichever run replaced it
        if (!cancelled) setProgress(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, attempt, refresh]);

  const reload = useCallback(() => {
    if (stateRef.current.status === 'ready') void refresh();
    else setAttempt((n) => n + 1);
  }, [refresh]);

  const value = useMemo(() => ({ state, reload }), [state, reload]);
  return (
    <Ctx.Provider value={value}>
      <ProgressCtx.Provider value={progress}>{children}</ProgressCtx.Provider>
    </Ctx.Provider>
  );
}
