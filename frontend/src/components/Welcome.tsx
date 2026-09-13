import { useEffect } from 'react';

/** The Ivy wordmark with its leaf mark. Lit, the mark warms and glows. */
export function IvyLogo({ lit = false }: { lit?: boolean }) {
  return (
    <span className={`lg-logo${lit ? ' lit' : ''}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21V9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
        <path d="M12 9.5C12 5.9 9.3 3.2 5.5 2.8 5.1 6.6 7.9 9.5 12 9.5Z" fill="currentColor" opacity="0.9" />
        <path d="M12 14C12 10.7 14.6 8.2 18.2 7.9 18.6 11.4 15.9 14 12 14Z" fill="currentColor" opacity="0.55" />
      </svg>
      <span className="lg-wordmark">Ivy</span>
      <span className="sr-only">Homes</span>
    </span>
  );
}

// How long the app takes to fade the wash off itself after taking over.
const LOWER_MS = 800;

/**
 * The ivory wash that carries a sign-in from the login screen into the app.
 * The login screen raises it ("shown"); the app, once mounted underneath,
 * lowers it ("leaving") and drops it when the fade is done.
 */
export function WelcomeWash({ state, onGone }: { state: 'hidden' | 'shown' | 'leaving'; onGone?: () => void }) {
  useEffect(() => {
    if (state !== 'leaving' || !onGone) return;
    const t = setTimeout(onGone, LOWER_MS);
    return () => clearTimeout(t);
  }, [state, onGone]);

  const up = state !== 'hidden';
  return (
    <div className={`lg-wash lg-wash-${state}`} role="status" aria-live="polite" aria-hidden={!up}>
      <IvyLogo lit={up} />
      <p className="lg-wash-msg">{up ? 'Welcome home.' : ''}</p>
    </div>
  );
}
