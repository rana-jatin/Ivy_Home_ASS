import { useEffect } from 'react';

/** The browser tab says which screen, and which listing, this is. */
export function useTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Ivy Homes Chennai` : 'Ivy Homes — Chennai';
  }, [title]);
}
