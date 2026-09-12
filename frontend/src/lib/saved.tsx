// Saved listings, against the real endpoint.
//
// The reference documents /v1/favourites with a {"id": ...} body. That path
// 404s and that body 422s. The endpoint is /v1/saved and the key is listing_id.
// The list is genuinely per-user and survives a re-login, which is the part the
// brief asks for, so it is kept server-side only - no local mirror to go stale.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { addSaved, getSaved, getSession, onSessionChange, removeSaved } from '../api/client';

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

  const refresh = useCallback(async () => {
    if (!getSession()) return;
    setLoading(true);
    try {
      const r = await getSaved();
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

  const toggle = useCallback(
    async (listing_id: string) => {
      const had = ids.has(listing_id);
      // optimistic, reverted if the server disagrees
      setIds((prev) => {
        const next = new Set(prev);
        if (had) next.delete(listing_id);
        else next.add(listing_id);
        return next;
      });
      try {
        if (had) await removeSaved(listing_id);
        else await addSaved(listing_id);
      } catch (e: any) {
        setError(e?.message ?? String(e));
        setIds((prev) => {
          const next = new Set(prev);
          if (had) next.add(listing_id);
          else next.delete(listing_id);
          return next;
        });
      }
    },
    [ids],
  );

  return <Ctx.Provider value={{ ids, loading, error, toggle, refresh }}>{children}</Ctx.Provider>;
}
