// The header's account of the data on screen: how old the copy is, whether a
// pull is running, and a way to pull again.

import { useData, useProgress, useReload } from '../api/store';
import { ago, useNow } from '../lib/time';

export function DataStatus() {
  const s = useData();
  const p = useProgress();
  const reload = useReload();
  const now = useNow();

  if (s.status === 'loading') {
    return p && <span className="datastatus">Pulling {p.stage} · {p.loaded.toLocaleString('en-IN')} records</span>;
  }
  if (s.status !== 'ready') return null;
  if (p) {
    return <span className="datastatus">Refreshing {p.stage} · {p.loaded.toLocaleString('en-IN')} records</span>;
  }
  return (
    <span className="datastatus">
      {s.refreshError ? (
        <span className="bad-text" title={s.refreshError}>Refresh failed</span>
      ) : (
        <span title={new Date(s.data.fetchedAt).toLocaleString('en-IN')}>Data from {ago(now - s.data.fetchedAt)}</span>
      )}
      <button className="linkish" onClick={reload} title="Pull the whole city again - about 123 requests">
        {s.refreshError ? 'Retry' : 'Refresh'}
      </button>
    </span>
  );
}

/** A thin bar along the bottom of the header while any pull runs. */
export function PullBar() {
  const s = useData();
  const p = useProgress();
  if (!p || (s.status !== 'loading' && s.status !== 'ready')) return null;
  const pct = p.declared ? Math.min(100, Math.round((p.loaded / p.declared) * 100)) : 4;
  return (
    <div className="pullbar" role="progressbar" aria-label={`Pulling ${p.stage}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
