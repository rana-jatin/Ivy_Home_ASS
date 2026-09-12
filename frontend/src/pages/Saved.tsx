import { getSession } from '../api/client';
import { useDataset } from '../api/store';
import ListingCard from '../components/ListingCard';
import { useSaved } from '../lib/saved';

export default function Saved() {
  const data = useDataset();
  const { ids, loading, error, refresh } = useSaved();
  if (!data) return null;

  const rows = data.listings.filter((r) => ids.has(r.listing_id));

  return (
    <main>
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

      {rows.length === 0 ? (
        <div className="note">Nothing saved yet. Use the ☆ on any listing.</div>
      ) : (
        <div className="grid">
          {rows.map((r) => <ListingCard key={r.listing_id} r={r} flags={data.flags} />)}
        </div>
      )}
    </main>
  );
}
