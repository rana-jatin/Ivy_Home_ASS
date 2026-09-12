import { Link } from 'react-router-dom';
import { inrShort, sqft, type FixedListing } from '../lib/corrections';
import type { Flags } from '../lib/flags';
import { useSaved } from '../lib/saved';

export function Badges({ r, flags }: { r: FixedListing; flags: Flags }) {
  const corrupt = flags.corrupt.get(r.listing_id);
  const dupes = flags.duplicatesOf.get(r.listing_id);
  return (
    <div className="badges">
      {!r.is_live && <span className="badge warn" title="is_live is false. The docs say these are excluded server side; they are not.">not live</span>}
      {corrupt && <span className="badge bad" title={corrupt.join('; ')}>impossible: {corrupt[0]}</span>}
      {flags.fakeIds.has(r.listing_id) && (
        <span className="badge bad" title={`One of ${flags.fakeIds.size} listings on ${flags.fakeContacts.size} lead-generation phone numbers.`}>
          lead-gen
        </span>
      )}
      {dupes && <span className="badge dup" title={dupes.join(', ')}>+{dupes.length} duplicate{dupes.length > 1 ? 's' : ''}</span>}
      {r.area_unit_corrected && <span className="badge info" title={`Served as ${r.carpet_area} m²; converted to square feet.`}>area from m²</span>}
      {r.coords_swapped && <span className="badge bad" title="latitude and longitude were transposed">coords swapped</span>}
      {r.is_verified && <span className="badge good">verified</span>}
    </div>
  );
}

export default function ListingCard({ r, flags }: { r: FixedListing; flags: Flags }) {
  const { ids, toggle } = useSaved();
  const saved = ids.has(r.listing_id);
  return (
    <div className="card listing">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <Link className="title" to={`/listings/${encodeURIComponent(r.listing_id)}`}>
          {r.apartment_name}
        </Link>
        <button
          onClick={() => toggle(r.listing_id)}
          title={saved ? 'Remove from saved' : 'Save this listing'}
          style={{ padding: '2px 9px', lineHeight: 1.4 }}
        >
          {saved ? '★' : '☆'}
        </button>
      </div>
      <div className="meta">
        {r.bedroom} BHK · {r.property_type} · {r.locality} · floor {r.floor}/{r.total_floors}
      </div>
      <div className="price">
        {inrShort(r.price)}{' '}
        <span className="pps">
          {sqft(r.carpet_area_sqft)} · {r.price > 0 ? `₹${Math.round(r.price_per_sqft).toLocaleString('en-IN')}/ft²` : '—'}
        </span>
      </div>
      <Badges r={r} flags={flags} />
      <div className="meta mono" style={{ fontSize: 12 }}>{r.listing_id} · {r.website}</div>
    </div>
  );
}
