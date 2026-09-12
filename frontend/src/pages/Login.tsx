import { useState, type FormEvent } from 'react';
import { login } from '../api/client';

const DEMO = ['demo1@ivy.homes', 'demo2@ivy.homes', 'demo3@ivy.homes'];

export default function Login() {
  const [email, setEmail] = useState(DEMO[0]);
  const [password, setPassword] = useState('d1eecc3b8b');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h1>Ivy Homes</h1>
        <p className="sub">Chennai property browser. Sign in with a demo account.</p>

        <div className="row">
          <label htmlFor="email">Email</label>
          <select id="email" value={email} onChange={(e) => setEmail(e.target.value)}>
            {DEMO.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="row">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            required
          />
        </div>

        <button className="primary" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        {error && <div className="err">{error}</div>}

        <p className="muted" style={{ fontSize: 12, marginTop: 18, marginBottom: 0 }}>
          The access token lasts 15 minutes, not the documented 24 hours. This app refreshes it
          in the background, so the session keeps working for as long as you leave it open.
        </p>
      </form>
    </div>
  );
}
