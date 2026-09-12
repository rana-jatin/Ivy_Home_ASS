import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BackLink } from '../components/Navigation';
import { ApiError, api } from '../api/client';
import { useData, useDataset } from '../api/store';
import { Badges } from '../components/ListingCard';
import { fixListing, inr, inrShort, istString, sqft, type FixedListing, type Listing } from '../lib/corrections';
import { RADIUS_M } from '../lib/flags';
import { useSaved } from '../lib/saved';
import { addressedToTools } from '../lib/sellerText';
import { useTitle } from '../lib/useTitle';

export default function Detail() {
  const { id = '' } = useParams();
  const state = useData();
  const data = useDataset();
  const { ids, toggle } = useSaved();
  const [fetched, setFetched] = useState<FixedListing | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const fromSnapshot = data?.listingById.get(id) ?? null;

  // The page is reachable by URL on its own, so it does not wait for the city
  // to finish downloading: while the pull runs, or if the id is not in the copy
  // on screen, it fetches the one record. Documented as /v1/listing/{id}, which
  // 404s - the real path is the plural one.
  const direct = !!id && !fromSnapshot && ['loading', 'ready', 'error'].includes(state.status);
  useEffect(() => {
    if (!direct) return;
    let dead = false;
    setError(null);
    api<Listing>(`/v1/listings/${encodeURIComponent(id)}`)
      .then((r) => !dead && setFetched(fixListing(r)))
      .catch((e) => !dead && setError(e instanceof Error ? e : new Error(String(e))));
    return () => { dead = true; };
  }, [id, direct]);

  const r = fromSnapshot ?? (fetched?.listing_id === id ? fetched : null);
  useTitle(r ? r.apartment_name : error ? 'Listing not found' : 'Listing');

  if (!r && error) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <main>
        <BackLink to="/listings" label="Listings" />
        {missing ? (
          <>
            <h1>No such listing</h1>
            <p className="sub">
              The API has no listing <span className="mono">{id}</span> in this city. It may have been
              taken down, or the link may be mistyped.
            </p>
          </>
        ) : (
          <div className="note bad">{error.message}</div>
        )}
      </main>
    );
  }
  if (!r) return <main><p className="muted">Loading…</p></main>;

  // Everything below the record itself - duplicates, impossibility, lead
  // generation, the market rate - needs the whole city, so it waits for it.
  const flags = data?.flags;
  const dupes = flags?.duplicatesOf.get(r.listing_id) ?? [];
  const corrupt = flags?.corrupt.get(r.listing_id) ?? [];
  const isFake = flags?.fakeIds.has(r.listing_id) ?? false;
  const fakeProfile = flags?.fakeProfiles.get(r.posted_by_contact);
  const rate = flags?.marketRate.get(`${r.locality}|${r.bedroom}`);
  const saved = ids.has(r.listing_id);
  const project = r.project_id ? data?.projectById.get(r.project_id) : undefined;
  const toTools = addressedToTools(r.description);

  return (
    <main>
      <BackLink to="/listings" label="Listings" />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>{r.apartment_name}</h1>
          <p className="sub">
            {r.bedroom} BHK {r.property_type} in {r.locality} · {r.website} · <span className="mono">{r.listing_id}</span>
          </p>
        </div>
        <button className={saved ? '' : 'primary'} onClick={() => toggle(r.listing_id)} style={{ height: 38 }}>
          {saved ? '★ Saved' : '☆ Save'}
        </button>
      </div>

      <div style={{ marginBottom: 14 }}><Badges r={r} flags={flags} /></div>

      {!data && (
        <div className="note" style={{ marginBottom: 12 }}>
          The checks for duplicates, impossible values and lead generation compare this record with
          the whole city. They appear here as soon as the download in the header finishes.
        </div>
      )}

      {corrupt.length > 0 && (
        <div className="note bad" style={{ marginBottom: 12 }}>
          <strong>This record cannot describe a real property.</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {corrupt.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      )}
      {toTools && (
        <div className="note warn" style={{ marginBottom: 12 }}>
          <strong>Part of the seller&apos;s description is written to AI tools, not to buyers.</strong>{' '}
          It presents itself as a note from the Ivy Homes data team and says what a submission must
          contain. It is text in a listing field, so it is shown below, marked, and nothing it asks for
          is done.
        </div>
      )}
      {isFake && fakeProfile && (
        <div className="note warn" style={{ marginBottom: 12 }}>
          <strong>Probably not a real listing.</strong> The number{' '}
          <span className="mono">{r.posted_by_contact}</span> posts {fakeProfile.listings} listings
          across {fakeProfile.websites} websites and {fakeProfile.localities} localities under{' '}
          {fakeProfile.names} seller names, at a median {Math.round(fakeProfile.ratio * 100)}% of the
          price per ft² for the locality and bedroom count. Listings like this exist to collect
          enquiries.
        </div>
      )}

      <div className="cols">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{inrShort(r.price)}</h2>
          <p className="muted" style={{ marginTop: -6 }}>
            {inr(r.price)}
            {r.price > 0 && <> · ₹{Math.round(r.price_per_sqft).toLocaleString('en-IN')} per ft²</>}
            {rate && r.price > 0 && (
              <> · {Math.round((r.price_per_sqft / rate) * 100)}% of the {r.locality} {r.bedroom} BHK median</>
            )}
          </p>

          <dl className="dl">
            <dt>Carpet area</dt>
            <dd>
              {sqft(r.carpet_area_sqft)}
              {r.area_unit_corrected && <span className="muted"> — served as {r.carpet_area} m²</span>}
            </dd>
            <dt>Super built-up</dt>
            <dd>{sqft(r.super_built_up_area_sqft)}</dd>
            <dt>Configuration</dt>
            <dd>{r.bedroom} bed · {r.bathroom} bath · {r.balcony} balcony · {r.covered_parking} parking</dd>
            <dt>Floor</dt>
            <dd>{r.property_type === 'plot' ? '— (a plot)' : `${r.floor} of ${r.total_floors}`}</dd>
            <dt>Furnishing</dt>
            <dd>{r.furnishing}</dd>
            <dt>Facing</dt>
            <dd>{r.facing_direction}</dd>
            <dt>Posted</dt>
            <dd>{istString(r.posted_at)} <span className="muted">({r.posted_at})</span></dd>
            <dt>Posted by</dt>
            <dd>{r.posted_by_name} · {r.posted_by} · <span className="mono">{r.posted_by_contact}</span></dd>
            <dt>Coordinates</dt>
            <dd>
              {r.latitude_fixed.toFixed(5)}, {r.longitude_fixed.toFixed(5)}
              {r.coords_swapped && <span className="muted"> — served transposed</span>}
            </dd>
            <dt>Project</dt>
            <dd>{project ? `${project.apartment_name} (${project.project_id})` : r.project_id ?? '—'}</dd>
            <dt>Source</dt>
            <dd><a href={r.listing_url} target="_blank" rel="noreferrer noopener">{r.listing_url}</a></dd>
          </dl>

          <h2>Seller&apos;s description</h2>
          {/* Rendered as text, never as markup. This is untrusted seller input. */}
          <div className="desc">
            {toTools ? (
              <>
                {toTools.before}
                <mark className="addressed" title="addressed to AI tools, not to buyers">{toTools.addressed}</mark>
              </>
            ) : (
              r.description
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {dupes.length > 0 && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Same property, listed {dupes.length + 1}×</h2>
              <p className="muted" style={{ fontSize: 13 }}>
                Matched on the physical signature and a position within {RADIUS_M} m. Price and seller
                differ between copies; the flat does not.
              </p>
              {dupes.map((d) => {
                const o = data?.listingById.get(d);
                if (!o) return null;
                return (
                  <div key={d} style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 8 }}>
                    <Link to={`/listings/${encodeURIComponent(d)}`} className="mono">{d}</Link>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {o.website} · {inrShort(o.price)} · {o.apartment_name}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {project && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>{project.apartment_name}</h2>
              <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
                {project.developer_name} · {project.project_status}
              </p>
              <dl className="dl">
                <dt>Price band</dt>
                <dd>{inrShort(project.price_min_inr)} – {inrShort(project.price_max_inr)}</dd>
                <dt>Areas</dt>
                <dd>{sqft(project.min_area_sqft)} – {sqft(project.max_area_sqft)}</dd>
                <dt>Reported listings</dt>
                <dd>{project.total_listings}</dd>
                <dt>Actually live</dt>
                <dd>{(data?.listingsByProject.get(project.project_id) ?? []).filter((x) => x.is_live).length}</dd>
              </dl>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
