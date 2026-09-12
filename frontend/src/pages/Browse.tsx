import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDataset } from '../api/store';
import ListingCard from '../components/ListingCard';

const PER_PAGE = 24;

// Every one of these runs locally. locality, bhk and property_type do work on
// the server; min_price, max_price and furnishing are accepted and ignored
// there. Doing them all in one place means the filter panel behaves
// consistently instead of half of it silently doing nothing.
export default function Browse() {
  const data = useDataset();
  const [params, setParams] = useSearchParams();

  const get = (k: string, d = '') => params.get(k) ?? d;
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const locality = get('locality');
  const bedroom = get('bedroom');
  const furnishing = get('furnishing');
  const minPrice = get('min_price');
  const maxPrice = get('max_price');
  const propertyType = get('property_type');
  const quality = get('quality', 'clean');
  const sort = get('sort', 'posted_desc');
  const page = Math.max(1, Number(get('page', '1')) || 1);

  const localities = useMemo(
    () => [...new Set(data?.listings.map((r) => r.locality) ?? [])].sort(),
    [data],
  );
  const types = useMemo(
    () => [...new Set(data?.listings.map((r) => r.property_type) ?? [])].sort(),
    [data],
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const { flags } = data;
    const min = minPrice ? Number(minPrice) : null;
    const max = maxPrice ? Number(maxPrice) : null;
    let out = data.listings.filter((r) => {
      if (locality && r.locality !== locality) return false;
      if (bedroom && r.bedroom !== Number(bedroom)) return false;
      if (furnishing && r.furnishing !== furnishing) return false;
      if (propertyType && r.property_type !== propertyType) return false;
      if (min !== null && r.price < min) return false;
      if (max !== null && r.price > max) return false;
      if (quality === 'clean') {
        if (!r.is_live) return false;
        if (flags.corrupt.has(r.listing_id)) return false;
        if (flags.fakeIds.has(r.listing_id)) return false;
      }
      if (quality === 'flagged') {
        const bad = flags.corrupt.has(r.listing_id) || flags.fakeIds.has(r.listing_id) || !r.is_live;
        if (!bad) return false;
      }
      return true;
    });
    // De-duplicate on request: keep one record per distinct property.
    if (get('dedupe') === '1') {
      const seen = new Set<string>();
      out = out.filter((r) => {
        const group = flags.duplicatesOf.get(r.listing_id);
        if (!group) return true;
        const key = [r.listing_id, ...group].sort()[0];
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    const cmp: Record<string, (a: typeof out[0], b: typeof out[0]) => number> = {
      posted_desc: (a, b) => b.posted_at.localeCompare(a.posted_at),
      posted_asc: (a, b) => a.posted_at.localeCompare(b.posted_at),
      price_asc: (a, b) => a.price - b.price,
      price_desc: (a, b) => b.price - a.price,
      area_desc: (a, b) => b.carpet_area_sqft - a.carpet_area_sqft,
      pps_asc: (a, b) => a.price_per_sqft - b.price_per_sqft,
    };
    return [...out].sort(cmp[sort] ?? cmp.posted_desc);
  }, [data, locality, bedroom, furnishing, propertyType, minPrice, maxPrice, quality, sort, params]);

  if (!data) return null;
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const clamped = Math.min(page, pages);
  const slice = filtered.slice((clamped - 1) * PER_PAGE, clamped * PER_PAGE);

  return (
    <main>
      <h1>Listings</h1>
      <p className="sub">
        {data.listings.length.toLocaleString('en-IN')} records held locally, describing{' '}
        {data.flags.distinctProperties.toLocaleString('en-IN')} distinct properties. Filters and
        sorting run over the whole snapshot.
      </p>

      <div className="filters">
        <div>
          <label htmlFor="f-loc">Locality</label>
          <select id="f-loc" value={locality} onChange={(e) => set('locality', e.target.value)}>
            <option value="">Any</option>
            {localities.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-bed">Bedrooms</label>
          <select id="f-bed" value={bedroom} onChange={(e) => set('bedroom', e.target.value)}>
            <option value="">Any</option>
            {[0, 1, 2, 3, 4, 5].map((b) => <option key={b} value={b}>{b} BHK</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-furn">Furnishing</label>
          <select id="f-furn" value={furnishing} onChange={(e) => set('furnishing', e.target.value)}>
            <option value="">Any</option>
            <option value="unfurnished">unfurnished</option>
            <option value="semi-furnished">semi-furnished</option>
            <option value="fully-furnished">fully-furnished</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-type">Type</label>
          <select id="f-type" value={propertyType} onChange={(e) => set('property_type', e.target.value)}>
            <option value="">Any</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-min">Min price ₹</label>
          <input id="f-min" type="number" inputMode="numeric" value={minPrice}
            onChange={(e) => set('min_price', e.target.value)} placeholder="0" />
        </div>
        <div>
          <label htmlFor="f-max">Max price ₹</label>
          <input id="f-max" type="number" inputMode="numeric" value={maxPrice}
            onChange={(e) => set('max_price', e.target.value)} placeholder="no limit" />
        </div>
        <div>
          <label htmlFor="f-q">Show</label>
          <select id="f-q" value={quality} onChange={(e) => set('quality', e.target.value)}>
            <option value="clean">Live, genuine only</option>
            <option value="all">Everything the API returns</option>
            <option value="flagged">Only flagged records</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-sort">Sort</label>
          <select id="f-sort" value={sort} onChange={(e) => set('sort', e.target.value)}>
            <option value="posted_desc">Newest first</option>
            <option value="posted_asc">Oldest first</option>
            <option value="price_asc">Price, low to high</option>
            <option value="price_desc">Price, high to low</option>
            <option value="area_desc">Largest first</option>
            <option value="pps_asc">Cheapest per ft²</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-dd">Duplicates</label>
          <select id="f-dd" value={get('dedupe')} onChange={(e) => set('dedupe', e.target.value)}>
            <option value="">Show every record</option>
            <option value="1">One per property</option>
          </select>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
        {filtered.length.toLocaleString('en-IN')} match
        {quality === 'clean' && ' · hiding non-live, impossible and lead-generation records'}
      </p>

      <div className="grid">
        {slice.map((r) => <ListingCard key={r.listing_id} r={r} flags={data.flags} />)}
      </div>
      {slice.length === 0 && <div className="note">Nothing matches those filters.</div>}

      <div className="pager">
        <button disabled={clamped <= 1} onClick={() => set('page', String(clamped - 1))}>Previous</button>
        <span className="count">Page {clamped} of {pages}</span>
        <button disabled={clamped >= pages} onClick={() => set('page', String(clamped + 1))}>Next</button>
      </div>
    </main>
  );
}
