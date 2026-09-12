import { useMemo } from 'react';
import { useDataset } from '../api/store';
import DataPending from '../components/DataPending';
import { LakhField, ResultBar, SelectField, priceLabel, type Chip } from '../components/Filters';
import ListingCard from '../components/ListingCard';
import Pager, { paginate } from '../components/Pager';
import { selectListings } from '../lib/browse';
import { useQueryState } from '../lib/query';
import { useTitle } from '../lib/useTitle';

const PER_PAGE = 24;

const FURNISHING = ['unfurnished', 'semi-furnished', 'fully-furnished'];
const QUALITY = [
  { value: 'clean', label: 'Live, genuine only' },
  { value: 'all', label: 'Everything the API returns' },
  { value: 'flagged', label: 'Only flagged records' },
];
const SORT = [
  { value: 'posted_desc', label: 'Newest first' },
  { value: 'posted_asc', label: 'Oldest first' },
  { value: 'price_asc', label: 'Price, low to high' },
  { value: 'price_desc', label: 'Price, high to low' },
  { value: 'area_desc', label: 'Largest first' },
  { value: 'pps_asc', label: 'Cheapest per ft²' },
];
/** the filters "Clear all" resets; sort is a preference, not a filter */
const FILTER_KEYS = ['locality', 'bedroom', 'furnishing', 'property_type', 'min_price', 'max_price', 'quality', 'dedupe'];

// Every one of these runs locally, in lib/browse.ts. locality, bhk and
// property_type do work on the server; min_price, max_price and furnishing are
// accepted and ignored there. Doing them all in one place means the filter
// panel behaves consistently instead of half of it silently doing nothing.
export default function Browse() {
  useTitle('Listings');
  const data = useDataset();
  const { get, set } = useQueryState();

  const locality = get('locality');
  const bedroom = get('bedroom');
  const furnishing = get('furnishing');
  const minPrice = get('min_price');
  const maxPrice = get('max_price');
  const propertyType = get('property_type');
  const quality = get('quality', 'clean');
  const sort = get('sort', 'posted_desc');
  const dedupe = get('dedupe') === '1';
  const page = Math.max(1, Number(get('page', '1')) || 1);

  const localities = useMemo(
    () => [...new Set(data?.listings.map((r) => r.locality) ?? [])].sort(),
    [data],
  );
  const types = useMemo(
    () => [...new Set(data?.listings.map((r) => r.property_type) ?? [])].sort(),
    [data],
  );

  const filtered = useMemo(
    () =>
      data
        ? selectListings(data.listings, data.flags, {
            locality, bedroom, furnishing, propertyType, minPrice, maxPrice, quality, sort, dedupe,
          })
        : [],
    [data, locality, bedroom, furnishing, propertyType, minPrice, maxPrice, quality, sort, dedupe],
  );

  if (!data) return <DataPending />;
  const { pages, current, slice } = paginate(filtered, page, PER_PAGE);

  const chips: Chip[] = [
    locality && { key: 'locality', label: locality },
    bedroom && { key: 'bedroom', label: `${bedroom} BHK` },
    furnishing && { key: 'furnishing', label: furnishing },
    propertyType && { key: 'property_type', label: propertyType },
    minPrice && { key: 'min_price', label: `from ${priceLabel(minPrice)}` },
    maxPrice && { key: 'max_price', label: `up to ${priceLabel(maxPrice)}` },
    quality !== 'clean' && { key: 'quality', label: QUALITY.find((q) => q.value === quality)?.label ?? quality },
    dedupe && { key: 'dedupe', label: 'one per property' },
  ].filter((c): c is Chip => !!c);
  const inverted = minPrice && maxPrice && Number(minPrice) > Number(maxPrice);

  return (
    <main>
      <h1>Listings</h1>
      <p className="sub">
        {data.listings.length.toLocaleString('en-IN')} records held locally, describing{' '}
        {data.flags.distinctProperties.toLocaleString('en-IN')} distinct properties. Filters and
        sorting run over the whole snapshot.
      </p>

      <div className="filters">
        <SelectField id="f-loc" label="Locality" value={locality} onChange={(v) => set({ locality: v })} options={localities} />
        <SelectField id="f-bed" label="Bedrooms" value={bedroom} onChange={(v) => set({ bedroom: v })}
          options={[0, 1, 2, 3, 4, 5].map((b) => ({ value: String(b), label: `${b} BHK` }))} />
        <SelectField id="f-furn" label="Furnishing" value={furnishing} onChange={(v) => set({ furnishing: v })} options={FURNISHING} />
        <SelectField id="f-type" label="Type" value={propertyType} onChange={(v) => set({ property_type: v })} options={types} />
        <LakhField id="f-min" label="Min price, ₹ lakh" rupees={minPrice} placeholder="0"
          onChange={(v) => set({ min_price: v }, { replace: true })} />
        <LakhField id="f-max" label="Max price, ₹ lakh" rupees={maxPrice} placeholder="no limit"
          onChange={(v) => set({ max_price: v }, { replace: true })} />
        <SelectField id="f-q" label="Show" value={quality} any={null} onChange={(v) => set({ quality: v })} options={QUALITY} />
        <SelectField id="f-sort" label="Sort" value={sort} any={null} onChange={(v) => set({ sort: v })} options={SORT} />
        <SelectField id="f-dd" label="Duplicates" value={dedupe ? '1' : ''} any="Show every record"
          onChange={(v) => set({ dedupe: v })} options={[{ value: '1', label: 'One per property' }]} />
      </div>

      <ResultBar
        count={
          <>
            {filtered.length.toLocaleString('en-IN')} match
            {quality === 'clean' && ' · hiding non-live, impossible and lead-generation records'}
          </>
        }
        chips={chips}
        onRemove={(key) => set({ [key]: '' })}
        onClearAll={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])))}
        warning={inverted ? 'The minimum price is above the maximum, so nothing can match.' : null}
      />

      <div className="grid">
        {slice.map((r) => <ListingCard key={r.listing_id} r={r} flags={data.flags} />)}
      </div>
      {slice.length === 0 && <div className="note">Nothing matches those filters.</div>}

      <Pager current={current} pages={pages} total={filtered.length} perPage={PER_PAGE}
        onPage={(n) => set({ page: String(n) })} />
    </main>
  );
}
