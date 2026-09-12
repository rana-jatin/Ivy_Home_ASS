// One dataset, loaded once, held in memory.
//
// The app filters and pages entirely over this snapshot rather than asking the
// server, because the server's filters cannot be trusted: min_price, max_price,
// furnishing and project_id are all accepted and silently ignored on
// /v1/listings, and `page` does nothing anywhere. Pulling everything once (123
// requests, a few seconds) and filtering locally is the only way the six
// required filters can actually filter.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchAll, getMe, getSession, onSessionChange } from './client';
import {
  fixListing, fixProject, fixRental,
  type FixedListing, type FixedProject, type FixedRental,
  type Listing, type Project, type Rental,
} from '../lib/corrections';
import { computeFlags, type Flags } from '../lib/flags';

export type Dataset = {
  listings: FixedListing[];
  rentals: FixedRental[];
  projects: FixedProject[];
  flags: Flags;
  me: { city: string; assigned_locality: string; reference_date: string } | null;
  /** what /v1/listings claimed its total was, kept to show the shortfall */
  declaredTotals: { listings: number; rentals: number; projects: number };
};

type State =
  | { status: 'idle' }
  | { status: 'loading'; loaded: number; declared: number; stage: string }
  | { status: 'ready'; data: Dataset }
  | { status: 'error'; message: string };

const Ctx = createContext<State>({ status: 'idle' });
export const useData = () => useContext(Ctx);

/** Narrowing helper so pages can assume a loaded dataset. */
export function useDataset(): Dataset | null {
  const s = useData();
  return s.status === 'ready' ? s.data : null;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const [signedIn, setSignedIn] = useState(() => !!getSession());

  useEffect(() => onSessionChange((s) => setSignedIn(!!s)), []);

  useEffect(() => {
    if (!signedIn) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setState({ status: 'loading', loaded: 0, declared: 0, stage: 'listings' });
        const declaredTotals = { listings: 0, rentals: 0, projects: 0 };

        const rawListings = await fetchAll<Listing>('/v1/listings', (loaded, declared) => {
          declaredTotals.listings = declared;
          if (!cancelled) setState({ status: 'loading', loaded, declared, stage: 'listings' });
        });
        if (cancelled) return;

        const rawRentals = await fetchAll<Rental>('/v1/rentals', (loaded, declared) => {
          declaredTotals.rentals = declared;
          if (!cancelled) setState({ status: 'loading', loaded, declared, stage: 'rentals' });
        });
        if (cancelled) return;

        const rawProjects = await fetchAll<Project>('/v1/projects', (loaded, declared) => {
          declaredTotals.projects = declared;
          if (!cancelled) setState({ status: 'loading', loaded, declared, stage: 'projects' });
        });
        if (cancelled) return;

        let me: Dataset['me'] = null;
        try {
          const m = await getMe(); // undocumented, and it knows the assigned locality
          me = { city: m.city, assigned_locality: m.assigned_locality, reference_date: m.reference_date };
        } catch {
          /* not fatal - the screens fall back to showing every locality */
        }
        if (cancelled) return;

        const listings = rawListings.map(fixListing);
        const rentals = rawRentals.map(fixRental);
        const projects = rawProjects.map(fixProject);
        setState({
          status: 'ready',
          data: { listings, rentals, projects, flags: computeFlags(listings), me, declaredTotals },
        });
      } catch (e: any) {
        if (!cancelled) setState({ status: 'error', message: e?.message ?? String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const value = useMemo(() => state, [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
