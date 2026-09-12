import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { getSession, logout, onSessionChange } from './api/client';
import { DataProvider, useData } from './api/store';
import { SavedProvider } from './lib/saved';
import Login from './pages/Login';
import Browse from './pages/Browse';
import Detail from './pages/Detail';
import Saved from './pages/Saved';
import Rentals from './pages/Rentals';
import Projects from './pages/Projects';
import Insights from './pages/Insights';

function Loading() {
  const s = useData();
  if (s.status === 'error') {
    return (
      <main>
        <div className="note bad">
          <strong>Could not load the dataset.</strong>
          <div style={{ marginTop: 6 }}>{s.message}</div>
        </div>
      </main>
    );
  }
  if (s.status !== 'ready') {
    const loaded = s.status === 'loading' ? s.loaded : 0;
    const declared = s.status === 'loading' ? s.declared : 0;
    const stage = s.status === 'loading' ? s.stage : 'starting';
    // The bar is drawn against the declared total, which is itself an
    // undercount - so it reaches 100% and keeps going. That is the bug, visible.
    const pct = declared ? Math.min(100, Math.round((loaded / declared) * 100)) : 0;
    return (
      <main>
        <h1>Pulling the dataset</h1>
        <p className="sub">
          Every filter in this app runs over a complete local snapshot, because the server's
          price, furnishing and project filters are accepted and then ignored.
        </p>
        <div className="card" style={{ maxWidth: 560 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span>{stage}</span>
            <span className="mono">{loaded} records</span>
          </div>
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
          {declared > 0 && loaded > declared && (
            <p className="muted" style={{ fontSize: 13, marginBottom: 0, marginTop: 10 }}>
              Past 100%: the endpoint reported <code>total: {declared}</code> and has already
              served {loaded}. Paging stops on <code>has_more</code>, never on <code>total</code>.
            </p>
          )}
        </div>
      </main>
    );
  }
  return null;
}

function Chrome() {
  const s = useData();
  const session = getSession();
  const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');
  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          Ivy Homes
          <span>{s.status === 'ready' ? s.data.me?.city ?? 'chennai' : 'chennai'}</span>
        </div>
        <nav>
          <NavLink to="/listings" className={link}>Listings</NavLink>
          <NavLink to="/rentals" className={link}>Rentals</NavLink>
          <NavLink to="/projects" className={link}>Projects</NavLink>
          <NavLink to="/saved" className={link}>Saved</NavLink>
          <NavLink to="/insights" className={link}>Insights</NavLink>
        </nav>
        <div className="spacer" />
        <span className="who">{session?.email}</span>
        <button onClick={logout}>Sign out</button>
      </header>
      {s.status === 'ready' ? (
        <Routes>
          <Route path="/" element={<Navigate to="/listings" replace />} />
          <Route path="/listings" element={<Browse />} />
          <Route path="/listings/:id" element={<Detail />} />
          <Route path="/rentals" element={<Rentals />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/saved" element={<Saved />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="*" element={<Navigate to="/listings" replace />} />
        </Routes>
      ) : (
        <Loading />
      )}
    </div>
  );
}

export default function App() {
  const [signedIn, setSignedIn] = useState(() => !!getSession());
  useEffect(() => onSessionChange((s) => setSignedIn(!!s)), []);

  if (!signedIn) return <Login />;
  return (
    <DataProvider>
      <SavedProvider>
        <Chrome />
      </SavedProvider>
    </DataProvider>
  );
}
