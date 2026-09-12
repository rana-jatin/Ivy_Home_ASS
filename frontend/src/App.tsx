import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { getSession, logout, onSessionChange } from './api/client';
import { DataProvider, useData } from './api/store';
import { DataStatus, PullBar } from './components/DataStatus';
import ErrorBoundary from './components/ErrorBoundary';
import { ScrollManager } from './components/Navigation';
import { ToastProvider } from './components/Toasts';
import { SavedProvider } from './lib/saved';
import Login from './pages/Login';
import Browse from './pages/Browse';
import Detail from './pages/Detail';
import Saved from './pages/Saved';
import Rentals from './pages/Rentals';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Insights from './pages/Insights';
import NotFound from './pages/NotFound';

function Chrome() {
  const s = useData();
  const { pathname } = useLocation();
  const session = getSession();
  const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');
  return (
    <div className="shell" data-dataset={s.status}>
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
        <DataStatus />
        <span className="who">{session?.email}</span>
        <button onClick={logout}>Sign out</button>
        <PullBar />
      </header>
      {/* Routes render while the city is still downloading: a listing opened by
          URL fetches itself, and every other screen shows the pull's progress. */}
      <ScrollManager />
      <ErrorBoundary key={pathname}>
        <Routes>
          <Route path="/" element={<Navigate to="/listings" replace />} />
          <Route path="/listings" element={<Browse />} />
          <Route path="/listings/:id" element={<Detail />} />
          <Route path="/rentals" element={<Rentals />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/saved" element={<Saved />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ErrorBoundary>
    </div>
  );
}

export default function App() {
  const [signedIn, setSignedIn] = useState(() => !!getSession());
  useEffect(() => onSessionChange((s) => setSignedIn(!!s)), []);

  if (!signedIn) return <Login />;
  return (
    <DataProvider>
      <ToastProvider>
        <SavedProvider>
          <Chrome />
        </SavedProvider>
      </ToastProvider>
    </DataProvider>
  );
}
