// The listings screen's filter, sort and de-duplicate pipeline.
//
// Kept out of the component so analysis/10-parity.mjs can run it over the same
// snapshot the answers came from - "one per property" has to land on exactly
// as many records as unique_properties says there are.

import type { FixedListing } from './corrections';
import type { Flags } from './flags';

export type BrowseQuery = {
  locality: string;
  bedroom: string;
  furnishing: string;
  propertyType: string;
  minPrice: string;
  maxPrice: string;
  quality: string;
  sort: string;
  dedupe: boolean;
};

type Cmp = (a: FixedListing, b: FixedListing) => number;

export const SORTS: Record<string, Cmp> = {
  posted_desc: (a, b) => b.posted_at.localeCompare(a.posted_at),
  posted_asc: (a, b) => a.posted_at.localeCompare(b.posted_at),
  price_asc: (a, b) => a.price - b.price,
  price_desc: (a, b) => b.price - a.price,
  area_desc: (a, b) => b.carpet_area_sqft - a.carpet_area_sqft,
  pps_asc: (a, b) => a.price_per_sqft - b.price_per_sqft,
};

export function selectListings(listings: FixedListing[], flags: Flags, q: BrowseQuery): FixedListing[] {
  const min = q.minPrice ? Number(q.minPrice) : null;
  const max = q.maxPrice ? Number(q.maxPrice) : null;
  const out = listings.filter((r) => {
    if (q.locality && r.locality !== q.locality) return false;
    if (q.bedroom && r.bedroom !== Number(q.bedroom)) return false;
    if (q.furnishing && r.furnishing !== q.furnishing) return false;
    if (q.propertyType && r.property_type !== q.propertyType) return false;
    if (min !== null && r.price < min) return false;
    if (max !== null && r.price > max) return false;
    if (q.quality === 'clean') {
      if (!r.is_live) return false;
      if (flags.corrupt.has(r.listing_id)) return false;
      if (flags.fakeIds.has(r.listing_id)) return false;
    }
    if (q.quality === 'flagged') {
      const bad = flags.corrupt.has(r.listing_id) || flags.fakeIds.has(r.listing_id) || !r.is_live;
      if (!bad) return false;
    }
    return true;
  });
  const sorted = out.sort(SORTS[q.sort] ?? SORTS.posted_desc);
  if (!q.dedupe) return sorted;
  // One record per distinct property. This runs after the sort, so the copy
  // kept is the one the user's sort puts first - the cheapest when sorting by
  // price, the newest when sorting by date - not whichever the API served first.
  const seen = new Set<string>();
  return sorted.filter((r) => {
    const group = flags.duplicatesOf.get(r.listing_id);
    if (!group) return true;
    const key = [r.listing_id, ...group].sort()[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
