import { Link } from 'react-router-dom';
import { getSession } from '../api/client';
import { useDataset } from '../api/store';
import DataPending from '../components/DataPending';
import ListingCard from '../components/ListingCard';
import { useSaved } from '../lib/saved';

export default function Saved() {
  const data = useDataset();
  const { ids, loading, error, refresh, toggle } = useSaved();
  if (!data) return <DataPending />;

  // In the order the server lists them. A saved id can be missing from the
  // copy on screen - posted after it was pulled, or taken down since - and it
  // is still on the user's list, so it is shown rather than dropped.
  const rows = [...ids].flatMap((id) => data.listingById.get(id) ?? []);
  const missing = [...ids].filter((id) => !data.listingById.has(id));

  return (
    <main data-saved={loading ? 'loading' : 'ready'}>
      <h1>Saved listings</h1>
      <p className="sub">
        Held server-side against <span className="mono">/v1/saved</span> for{' '}
        {getSession()?.email}. The documented path, <span className="mono">/v1/favourites</span>,
        does not exist. Survives a reload and a re-login; each demo user has their own list.
      </p>

      {error && <div className="note bad" style={{ marginBottom: 12 }}>{error}</div>}

      <p>
        <button onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh from the server'}
        </button>
      </p>

      {missing.length > 0 && (
        <div className="note warn" style={{ marginBottom: 12 }}>
          <strong>
            {missing.length} saved listing{missing.length > 1 ? 's are' : ' is'} not in the copy of the
            city on screen.
          </strong>{' '}
          Posted after it was pulled, or taken down since. Open one to fetch it from the API.
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {missing.map((id) => (
              <li key={id}>
                <Link className="mono" to={`/listings/${encodeURIComponent(id)}`}>{id}</Link>{' '}
                <button className="linkish" onClick={() => void toggle(id)}>remove</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading && ids.size === 0 ? (
        <p className="muted">Loading your saved list…</p>
      ) : ids.size === 0 ? (
        <div className="note">
          Nothing saved yet. Use the ☆ on any listing, or <Link to="/listings">browse listings</Link>.
        </div>
      ) : (
        <div className="grid">
          {rows.map((r) => <ListingCard key={r.listing_id} r={r} flags={data.flags} />)}
        </div>
      )}
    </main>
  );
}
