// The sign-in screen, carried over from the "Come home to Ivy" design in
// rana-jatin/remix-of-pixel-perfect-replica: an apartment at golden hour that
// sways very slightly, a card rising over it, and the lights coming up once you
// are in. That design signs in with a phone number and a one-time code; this
// API only knows email and password, so the fields are the API's and
// everything around them is the design's.

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, sessionEndReason } from '../api/client';
import scene from '../assets/login/scene.jpg';
import sceneMobile from '../assets/login/scene-mobile.jpg';
import { IvyLogo, WelcomeWash } from '../components/Welcome';
import { useTitle } from '../lib/useTitle';

const DEMO = ['demo1@ivy.homes', 'demo2@ivy.homes', 'demo3@ivy.homes'];

type Intent = 'sell' | 'buy';

// Remembered between visits: who signed in last, and what they came to do.
const LAST_EMAIL = 'ivy.lastEmail';
const INTENT = 'ivy.intent';
function recall(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode - the screen just will not remember */
  }
}

// The lights come up, then the wash covers the screen, then the app takes over.
const LIGHTS_MS = 1400;
const WASH_MS = 1100;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stillness = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export default function Login({ onEntered }: { onEntered: () => void }) {
  useTitle('Sign in');
  const navigate = useNavigate();
  const [returning] = useState(() => !!recall(LAST_EMAIL) || !!sessionEndReason());
  const [email, setEmail] = useState(() => {
    const last = recall(LAST_EMAIL);
    return last && DEMO.includes(last) ? last : DEMO[0];
  });
  const [password, setPassword] = useState('d1eecc3b8b');
  const [intent, setIntent] = useState<Intent>(() => (recall(INTENT) === 'buy' ? 'buy' : 'sell'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lit, setLit] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err: any) {
      setBusy(false);
      setError(err?.message ?? String(err));
      return;
    }
    remember(LAST_EMAIL, email);
    remember(INTENT, intent);
    setBusy(false);
    setLit(true);
    const still = stillness();
    await wait(still ? 0 : LIGHTS_MS);
    setLeaving(true);
    await wait(still ? 0 : WASH_MS);
    navigate('/sell', { replace: true });
    onEntered();
  }

  const ended = sessionEndReason();
  const sub = returning
    ? 'Your home journey is waiting.'
    : intent === 'sell'
      ? "Let's get your home moving."
      : 'Your next home might be closer than you think.';

  return (
    <main className={`lg${lit ? ' lit' : ''}`}>
      <div className="lg-scene" aria-hidden="true">
        <picture>
          <source media="(min-width: 768px)" srcSet={scene} />
          <img src={sceneMobile} alt="" />
        </picture>
        {/* evening warmth drifting through the window */}
        <div className="lg-warmth" />
        {/* a lamp that breathes gently, and blooms once the lights are on */}
        <div className="lg-lamp" />
        {/* scrims, so the type stays legible over the photograph */}
        <div className="lg-scrim" />
      </div>

      <div className="lg-layout">
        <div className="lg-pitch">
          <p className="lg-pitch-h">Come home to Ivy.</p>
          <p className="lg-pitch-p">
            Buying and selling a home should feel calm. We handle the complicated parts, quietly, in
            the background.
          </p>
          {/* a verse on the idea a home opens up to, not shuts out - the same
              spirit as "come home to Ivy" rather than a literal translation */}
          <div className="lg-shlok" lang="sa" aria-label="A Sanskrit verse on home and belonging">
            <p className="lg-shlok-sa">
              अयं निजः परो वेति गणना लघुचेतसाम्।
              <br />
              उदारचरितानां तु वसुधैव कुटुम्बकम्॥
            </p>
            <p className="lg-shlok-en">
              “This is mine, that is another’s” — so reckons the small heart. To the large-hearted,
              the whole world is one family.
            </p>
            <p className="lg-shlok-src">— Maha Upanishad</p>
          </div>
        </div>

        <form className="login lg-card" onSubmit={submit} aria-labelledby="lg-heading">
          <IvyLogo lit={lit} />

          <h1 id="lg-heading">{returning ? 'Welcome back.' : 'Welcome home.'}</h1>
          <p className="lg-sub">{sub}</p>
          {ended && <p className="lg-ended">{ended}</p>}

          <div className="lg-stack">
            <div role="radiogroup" aria-label="What brings you to Ivy?" className="lg-intent">
              {(['sell', 'buy'] as Intent[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={intent === option}
                  className={intent === option ? 'on' : ''}
                  onClick={() => setIntent(option)}
                  disabled={lit}
                >
                  {option === 'sell' ? "I'm selling" : "I'm buying"}
                </button>
              ))}
            </div>

            <div className="lg-field">
              <label htmlFor="email">Demo account</label>
              <div className="lg-box">
                <select
                  id="email"
                  value={email}
                  disabled={busy || lit}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                >
                  {DEMO.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <svg className="lg-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </div>

            <div className="lg-field">
              <label htmlFor="password">Password</label>
              <div className={`lg-box${error ? ' invalid' : ''}`}>
                <input
                  id="password"
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  placeholder="password"
                  aria-invalid={!!error}
                  disabled={busy || lit}
                  required
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                />
              </div>
            </div>

            <div aria-live="polite" className="lg-error">
              {error && <p>{error}</p>}
            </div>

            <button type="submit" className="lg-go" disabled={busy || lit}>
              {lit ? (
                <>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                  You're in
                </>
              ) : busy ? (
                <>
                  <svg className="lg-spin" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.22-8.56" /></svg>
                  Signing you in
                </>
              ) : (
                <>
                  Sign in
                  <svg className="lg-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </>
              )}
            </button>
          </div>

          <p className="lg-foot">Secure • Simple • Chennai</p>
          <p className="lg-note">
            The access token lasts 15 minutes, not the documented 24 hours. This app refreshes it in
            the background, so the session keeps working for as long as you leave it open.
          </p>
        </form>
      </div>

      <p className="lg-tagline">Your home. Your next chapter.</p>

      <WelcomeWash state={leaving ? 'shown' : 'hidden'} />
    </main>
  );
}
