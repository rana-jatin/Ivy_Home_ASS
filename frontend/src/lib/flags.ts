// Corrupt, fake and duplicate detection, re-derived in the browser from the
// live data using the same rules as analysis/05-corrupt.mjs, 06-fraud.mjs and
// 07-duplicates.mjs.
//
// This is deliberately not a hard-coded list of ids copied out of the analysis.
// If the app can only badge a listing because a constant says so, the rule was
// never real. Running the rules here means the badges stay honest if the data
// moves, and it is the same code path the answers came from.

import type { FixedListing } from './corrections';

export type CorruptReason =
  | 'negative price'
  | 'carpet area exceeds super built-up area'
  | 'floor above the building height'
  | 'latitude and longitude transposed'
  | 'posted in the future'
  | 'no bedrooms and no bathrooms'
  | 'price is a thousandth of any plausible price';

const NOW_ISH = new Date('2026-09-12T12:00:00Z');

/** Impossibility rules. Each returns records that CANNOT exist, not odd ones. */
export function corruptReasons(r: FixedListing): CorruptReason[] {
  const out: CorruptReason[] = [];
  if (r.price <= 0) out.push('negative price');
  if (r.carpet_area_sqft > r.super_built_up_area_sqft) out.push('carpet area exceeds super built-up area');
  if (r.floor > r.total_floors) out.push('floor above the building height');
  if (r.coords_swapped) out.push('latitude and longitude transposed');
  if (new Date(r.posted_at) > NOW_ISH) out.push('posted in the future');
  if (r.bedroom === 0 && r.bathroom === 0 && r.property_type !== 'plot') out.push('no bedrooms and no bathrooms');
  if (r.price > 0 && r.price_per_sqft < 100) out.push('price is a thousandth of any plausible price');
  return out;
}

/** How the impossibility rules fell out: how many classes, how big, and overlap. */
export function corruptSummary(corrupt: Map<string, CorruptReason[]>) {
  const byReason = new Map<CorruptReason, number>();
  let overlap = 0;
  for (const reasons of corrupt.values()) {
    if (reasons.length > 1) overlap++;
    for (const r of reasons) byReason.set(r, (byReason.get(r) ?? 0) + 1);
  }
  const sizes = [...byReason.values()];
  return {
    byReason,
    classes: byReason.size,
    /** the size every class shares, or null if they differ */
    eachSize: sizes.length && sizes.every((n) => n === sizes[0]) ? sizes[0] : null,
    minSize: sizes.length ? Math.min(...sizes) : 0,
    maxSize: sizes.length ? Math.max(...sizes) : 0,
    /** records hit by more than one rule */
    overlap,
  };
}

/** What the fraud rule saw for one phone number it flagged. */
export type FakeProfile = {
  listings: number;
  names: number;
  websites: number;
  localities: number;
  /** median of price per ft² over the locality-and-bedroom market rate */
  ratio: number;
  allVerifiedLive: boolean;
};

// The duplicate matcher's tolerances, exported so the screens that describe
// the rule quote the numbers it actually uses.
export const RADIUS_M = 150;
export const AREA_TOL = 0.02;

export type Flags = {
  corrupt: Map<string, CorruptReason[]>;
  fakeIds: Set<string>;
  fakeContacts: Set<string>;
  fakeProfiles: Map<string, FakeProfile>;
  /** listing_id -> the ids of every other record describing the same property */
  duplicatesOf: Map<string, string[]>;
  clusters: string[][];
  distinctProperties: number;
  /** locality|bedroom -> median rupees per square foot */
  marketRate: Map<string, number>;
};

const cellKey = (r: FixedListing) => `${r.locality}|${r.bedroom}`;

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function computeFlags(listings: FixedListing[]): Flags {
  // ---- corrupt ----
  const corrupt = new Map<string, CorruptReason[]>();
  for (const r of listings) {
    const why = corruptReasons(r);
    if (why.length) corrupt.set(r.listing_id, why);
  }

  // ---- market rate, computed without the impossible records ----
  const clean = listings.filter((r) => !corrupt.has(r.listing_id));
  const cells = new Map<string, number[]>();
  for (const r of clean) {
    const k = cellKey(r);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k)!.push(r.price_per_sqft);
  }
  const marketRate = new Map<string, number>();
  for (const [k, v] of cells) marketRate.set(k, median(v));

  // ---- fake: the phone number is the unit of analysis, not the listing ----
  const byContact = new Map<string, FixedListing[]>();
  for (const r of clean) {
    if (!byContact.has(r.posted_by_contact)) byContact.set(r.posted_by_contact, []);
    byContact.get(r.posted_by_contact)!.push(r);
  }
  const scored = [...byContact.entries()]
    .map(([contact, rs]) => ({
      contact,
      rs,
      medianRatio: median(rs.map((r) => r.price_per_sqft / (marketRate.get(cellKey(r)) || r.price_per_sqft))),
      perfect: rs.length >= 8 && rs.every((r) => r.is_verified) && rs.every((r) => r.is_live),
    }))
    .sort((a, b) => a.medianRatio - b.medianRatio);

  // Test 1: the largest gap in median price-to-market, looking only at the
  // cheap end where a lead-gen operation would sit.
  let gapAt = 0;
  let gapSize = 0;
  for (let i = 1; i < Math.min(30, scored.length); i++) {
    const g = scored[i].medianRatio - scored[i - 1].medianRatio;
    if (g > gapSize) {
      gapSize = g;
      gapAt = i;
    }
  }
  const byPrice = new Set(scored.slice(0, gapAt).map((s) => s.contact));
  // Test 2: implausible perfection. Both tests must agree before a number is
  // called fake, which is what keeps busy agents out of the list.
  const byPerfection = new Set(scored.filter((s) => s.perfect).map((s) => s.contact));
  const fakeContacts = new Set([...byPrice].filter((c) => byPerfection.has(c)));

  const fakeIds = new Set<string>();
  for (const c of fakeContacts) for (const r of byContact.get(c) ?? []) fakeIds.add(r.listing_id);

  const fakeProfiles = new Map<string, FakeProfile>();
  for (const s of scored) {
    if (!fakeContacts.has(s.contact)) continue;
    fakeProfiles.set(s.contact, {
      listings: s.rs.length,
      names: new Set(s.rs.map((r) => r.posted_by_name)).size,
      websites: new Set(s.rs.map((r) => r.website)).size,
      localities: new Set(s.rs.map((r) => r.locality)).size,
      ratio: s.medianRatio,
      allVerifiedLive: s.rs.every((r) => r.is_verified && r.is_live),
    });
  }

  // ---- duplicates: physical signature plus position ----
  const CELL = 0.0015;
  const SIGNATURE: (keyof FixedListing)[] = [
    'bedroom', 'bathroom', 'balcony', 'floor', 'total_floors',
    'property_type', 'furnishing', 'facing_direction', 'covered_parking',
  ];
  const metres = (a: FixedListing, b: FixedListing) =>
    Math.hypot((a.latitude_fixed - b.latitude_fixed) * 111000, (a.longitude_fixed - b.longitude_fixed) * 108300);
  const same = (a: FixedListing, b: FixedListing) =>
    SIGNATURE.every((f) => a[f] === b[f]) &&
    Math.abs(a.carpet_area_sqft - b.carpet_area_sqft) / Math.max(a.carpet_area_sqft, b.carpet_area_sqft) <= AREA_TOL &&
    metres(a, b) <= RADIUS_M;

  const grid = new Map<string, FixedListing[]>();
  const cellOf = (r: FixedListing) =>
    `${Math.floor(r.latitude_fixed / CELL)},${Math.floor(r.longitude_fixed / CELL)}`;
  for (const r of listings) {
    const k = cellOf(r);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(r);
  }

  const parent = new Map(listings.map((r) => [r.listing_id, r.listing_id]));
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  const union = (x: string, y: string) => {
    const a = find(x), b = find(y);
    if (a !== b) parent.set(a, b);
  };

  for (const r of listings) {
    const [ci, cj] = cellOf(r).split(',').map(Number);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const s of grid.get(`${ci + di},${cj + dj}`) ?? []) {
          if (s.listing_id <= r.listing_id) continue;
          if (same(r, s)) union(r.listing_id, s.listing_id);
        }
      }
    }
  }

  const groups = new Map<string, string[]>();
  for (const r of listings) {
    const root = find(r.listing_id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(r.listing_id);
  }
  const clusters = [...groups.values()].filter((g) => g.length > 1);
  const duplicatesOf = new Map<string, string[]>();
  for (const g of clusters) {
    for (const id of g) duplicatesOf.set(id, g.filter((x) => x !== id));
  }

  return {
    corrupt,
    fakeIds,
    fakeContacts,
    fakeProfiles,
    duplicatesOf,
    clusters,
    distinctProperties: groups.size,
    marketRate,
  };
}
