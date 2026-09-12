// Saved listings, against the real endpoint.
//
// The reference documents /v1/favourites with a {"id": ...} body. That path
// 404s and that body 422s. The endpoint is /v1/saved and the key is listing_id.
// The list is genuinely per-user and survives a re-login, which is the part the
// brief asks for, so it is kept server-side only - no local mirror to go stale.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { addSaved, getSaved, getSession, onSessionChange, removeSaved } from '../api/client';
import { useDataset } from '../api/store';
import { useToast } from '../components/Toasts';

type SavedCtx = {
  ids: Set<string>;
  loading: boolean;
  error: string | null;
  toggle: (listing_id: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<SavedCtx>({
  ids: new Set(),
  loading: false,
  error: null,
  toggle: async () => {},
  refresh: async () => {},
});

export const useSaved = () => useContext(Ctx);

export function SavedProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const data = useDataset();
  // ids with a request in flight, so a double click does not race itself
  const inFlight = useRef(new Set<string>());
  // Bumped by every toggle. A list fetched before a toggle is older than the
  // toggle, and must not overwrite it when it lands.
  const edits = useRef(0);

  const refresh = useCallback(async () => {
    if (!getSession()) return;
    setLoading(true);
    const startedAt = edits.current;
    try {
      const r = await getSaved();
      if (edits.current !== startedAt) return;
      setIds(new Set((r.results ?? []).map((x: any) => x.listing_id)));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // A different user signing in must not inherit the previous user's list.
    return onSessionChange((s) => {
      if (s) void refresh();
      else setIds(new Set());
    });
  }, [refresh]);

  const flip = (listing_id: string, on: boolean) =>
    setIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(listing_id);
      else next.delete(listing_id);
      return next;
    });

  const toggleRef = useRef<(id: string) => Promise<void>>(async () => {});

  const toggle = useCallback(
    async (listing_id: string) => {
      if (inFlight.current.has(listing_id)) return;
      inFlight.current.add(listing_id);
      edits.current++;
      const had = ids.has(listing_id);
      const name = data?.listingById.get(listing_id)?.apartment_name ?? listing_id;
      flip(listing_id, !had); // optimistic, reverted if the server disagrees
      try {
        if (had) await removeSaved(listing_id);
        else await addSaved(listing_id);
        toast(
          had
            ? { text: `Removed ${name} from saved`, action: { label: 'Undo', run: () => void toggleRef.current(listing_id) } }
            : { text: `Saved ${name}`, kind: 'good' },
        );
      } catch (e: any) {
        edits.current++;
        flip(listing_id, had);
        toast({ kind: 'bad', text: `Could not ${had ? 'remove' : 'save'} ${name}: ${e?.message ?? String(e)}` });
      } finally {
        inFlight.current.delete(listing_id);
      }
    },
    [ids, data, toast],
  );
  toggleRef.current = toggle;

  return <Ctx.Provider value={{ ids, loading, error, toggle, refresh }}>{children}</Ctx.Provider>;
}
