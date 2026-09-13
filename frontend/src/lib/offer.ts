// The sell screen's instant offer: a rate, the comparables behind it, and what
// a year of waiting would cost. Kept out of the component, like browse.ts, so it
// is a pure function over the corrected dataset that a script can check.
//
// Two rules keep the number honest.
//
// The rate comes from the same records the comparables do - live, possible,
// not from a lead-generation number, and one per property - not from
// flags.marketRate. marketRate has to span every possible record, because it
// is the benchmark the lead-generation rule scores sellers against; an offer
// anchored to it leans on the very listings that rule exists to catch, and
// counts a re-posted flat once per copy.
//
// Lost rent is matched on size, not scaled by area. Within one bedroom count,
// rent barely follows carpet area (correlation 0.20-0.45 on this pull), so a
// large 2 BHK still rents like a 2 BHK. Across sizes it follows area closely
// (0.80), which is what the fallback for a size nobody rents out relies on.

import type { FixedListing, FixedRental } from './corrections';
import type { Flags } from './flags';

/** Fewer matching properties or rentals than this and the match widens to the whole locality. */
export const MIN_MATCHES = 3;
export const COMPARABLES_SHOWN = 3;
/** open-market brokerage, as a share of the sale price */
export const BROKERAGE = 0.02;
/** upkeep, rupees per square foot per month */
export const UPKEEP_PER_SQFT = 2;
/** monthly rent as a share of value, for a locality with no live rentals at all */
export const FALLBACK_YIELD = 0.003;

export type Ask = { locality: string; bedroom: number; area: number };

/** How the monthly rent was arrived at, so the screen can say. */
export type RentBasis =
  /** the median of live rentals of this size in this locality */
  | { kind: 'size'; monthly: number; rentals: number }
  /** none of this size: the locality's median rent per square foot, times the flat's area */
  | { kind: 'area'; monthly: number; rentals: number; perSqft: number }
  /** no live rentals in the locality */
  | { kind: 'yield'; monthly: number };

export type Offer = {
  ask: Ask;
  /** rupees per carpet square foot */
  pps: number;
  estimate: number;
  /** distinct properties the rate is the median of */
  poolSize: number;
  /** true when fewer than MIN_MATCHES properties matched the size, so every size in the locality counts */
  widened: boolean;
  comps: FixedListing[];
  rent: RentBasis;
  lostRent: number;
  brokerage: number;
  maintenance: number;
  totalCost: number;
};

/** Upper median for an even count - the convention flags.ts uses. */
export function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Live, possible listings not posted from a lead-generation number, one per
 * property. A property is keyed by the smallest id among its copies, as in
 * browse.ts; of those copies the newest is kept, because a re-post carries a
 * jittered price and the latest one is the seller's current ask.
 */
export function genuineListings(listings: FixedListing[], flags: Flags): FixedListing[] {
  const kept = new Map<string, FixedListing>();
  for (const r of listings) {
    if (!r.is_live || flags.corrupt.has(r.listing_id) || flags.fakeIds.has(r.listing_id)) continue;
    const copies = flags.duplicatesOf.get(r.listing_id);
    const key = copies ? copies.reduce((a, b) => (b < a ? b : a), r.listing_id) : r.listing_id;
    const prev = kept.get(key);
    // posted_at is always UTC with a Z suffix, so the strings sort in time order.
    if (!prev || r.posted_at > prev.posted_at || (r.posted_at === prev.posted_at && r.listing_id < prev.listing_id)) {
      kept.set(key, r);
    }
  }
  return [...kept.values()];
}

/** `genuine` is genuineListings() of the dataset, computed once by the caller. */
export function priceOffer(genuine: FixedListing[], rentals: FixedRental[], ask: Ask): Offer | null {
  const inLocality = genuine.filter((r) => r.locality === ask.locality);
  const sameSize = inLocality.filter((r) => r.bedroom === ask.bedroom);
  const widened = sameSize.length < MIN_MATCHES;
  const pool = widened ? inLocality : sameSize;
  if (!pool.length) return null;

  const pps = median(pool.map((r) => r.price_per_sqft));
  const estimate = pps * ask.area;
  const comps = [...pool]
    .sort((a, b) =>
      Math.abs(a.price_per_sqft - pps) - Math.abs(b.price_per_sqft - pps) || a.listing_id.localeCompare(b.listing_id))
    .slice(0, COMPARABLES_SHOWN);

  const rent = rentFor(rentals, ask, estimate);
  const lostRent = rent.monthly * 12;
  const brokerage = estimate * BROKERAGE;
  const maintenance = ask.area * UPKEEP_PER_SQFT * 12;

  return {
    ask, pps, estimate, poolSize: pool.length, widened, comps,
    rent, lostRent, brokerage, maintenance, totalCost: lostRent + brokerage + maintenance,
  };
}

function rentFor(rentals: FixedRental[], ask: Ask, estimate: number): RentBasis {
  const live = rentals.filter((r) => r.is_live && r.locality === ask.locality);
  const sameSize = live.filter((r) => r.bedroom === ask.bedroom);
  if (sameSize.length >= MIN_MATCHES) {
    return { kind: 'size', monthly: median(sameSize.map((r) => r.price)), rentals: sameSize.length };
  }
  if (live.length >= MIN_MATCHES) {
    // Rental areas are never served in square metres (findings.md), so carpet_area is square feet.
    const perSqft = median(live.map((r) => r.price / r.carpet_area));
    return { kind: 'area', monthly: perSqft * ask.area, rentals: live.length, perSqft };
  }
  return { kind: 'yield', monthly: estimate * FALLBACK_YIELD };
}
