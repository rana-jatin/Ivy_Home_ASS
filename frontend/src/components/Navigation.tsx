import { useEffect, useLayoutEffect, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate, useNavigationType } from 'react-router-dom';

// Scroll positions by history entry. Screens render from memory, so on Back
// the page is already its full height when the position is put back.
const positions = new Map<string, number>();
if (typeof history !== 'undefined' && 'scrollRestoration' in history) history.scrollRestoration = 'manual';

/**
 * A new screen or a new page of results starts at the top; Back and Forward
 * return to where that entry was scrolled to.
 */
export function ScrollManager() {
  const location = useLocation();
  const type = useNavigationType();
  const page = new URLSearchParams(location.search).get('page');

  useEffect(() => {
    const key = location.key;
    const remember = () => positions.set(key, window.scrollY);
    window.addEventListener('scroll', remember, { passive: true });
    return () => window.removeEventListener('scroll', remember);
  }, [location.key]);

  useLayoutEffect(() => {
    if (type === 'POP') {
      const y = positions.get(location.key);
      if (y !== undefined) window.scrollTo(0, y);
    } else {
      window.scrollTo(0, 0);
    }
    // Only a change of screen or of page moves the scroll; a filter change on
    // page 1 leaves the filter panel where the user is working.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, page]);

  return null;
}

/**
 * Back to wherever the user came from, filters and scroll intact. Someone who
 * arrived on this URL directly has nowhere to go back to, so they get `to`.
 */
export function BackLink({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const cameFromApp = location.key !== 'default';
  const onClick = (e: MouseEvent) => {
    if (!cameFromApp) return;
    e.preventDefault();
    navigate(-1);
  };
  return (
    <p>
      <Link to={to} onClick={onClick}>← {cameFromApp ? 'Back' : label}</Link>
    </p>
  );
}
