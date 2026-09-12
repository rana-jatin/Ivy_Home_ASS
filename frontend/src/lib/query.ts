import { useSearchParams } from 'react-router-dom';

/**
 * A screen's filters, sort and page, held in the URL so they survive a reload,
 * can be shared as a link, and step back with the browser's Back button.
 */
export function useQueryState() {
  const [params, setParams] = useSearchParams();

  const get = (key: string, fallback = '') => params.get(key) ?? fallback;

  /**
   * Change one or more parameters; an empty value removes it. Any change other
   * than the page itself goes back to page 1. Each change is its own history
   * entry, except with `replace`, which typed inputs use so that Back does not
   * step through them a keystroke at a time.
   */
  const set = (changes: Record<string, string>, { replace = false } = {}) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace });
  };

  return { params, get, set };
}
