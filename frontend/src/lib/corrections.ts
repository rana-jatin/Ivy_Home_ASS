// The correction layer. This is the app-side twin of analysis/04-normalize.mjs
// and it has to stay in step with it: every rule here was derived offline from
// the full dataset and is re-applied live to whatever the API returns.
//
// Nothing here is a guess. Each constant has a paragraph in findings.md and a
// script in analysis/ that derived it from the server's own sort order.

export type Listing = {
  listing_id: string;
  listing_url: string;
  website: string;
  city_id: number;
  apartment_name: string;
  locality: string;
  property_type: string;
  bedroom: number;
  bathroom: number;
  balcony: number;
  floor: number;
  total_floors: number;
  furnishing: string;
  facing_direction: string;
  covered_parking: number;
  price: number;
  carpet_area: number;
  super_built_up_area: number;
  latitude: number;
  longitude: number;
  posted_by: string;
  posted_by_name: string;
  posted_by_contact: string;
  project_id: string | null;
  description: string;
  posted_at: string;
  is_verified: boolean;
  is_live: boolean; // undocumented
};

export type Rental = Omit<Listing, 'super_built_up_area' | 'balcony' | 'covered_parking' | 'project_id' | 'is_verified'> & {
  title: string;
  deposit: number;
  maintenance: number;
  super_builtup_area: number;
};

export type Project = {
  project_id: string;
  project_url: string;
  city_id: number;
  apartment_name: string;
  developer_name: string;
  locality: string;
  project_status: string;
  total_units: number;
  total_towers: number;
  total_floors: number;
  launch_date: string;
  possession_date: string;
  rera_number: string;
  min_area_sqft: number;
  max_area_sqft: number;
  total_listings: number;
  price_min: number;
  price_max: number;
  amenities: string[];
  latitude: number;
  longitude: number;
};

export const SQM_TO_SQFT = 10.7639;

/**
 * Areas below this are square metres, not the documented square feet.
 * 337 listings - every one of them website=magichomes - serialise area in m².
 * The two populations do not overlap: metres run 34..276 and feet run
 * 292..2965, and the split agrees exactly with the one the server's own
 * sort_by=carpet_area ordering implies.
 */
export const AREA_SQM_THRESHOLD = 284;

/**
 * Project prices are quoted the Indian way - lakh below a crore, crore at or
 * above - not in rupees. The two bands are 32.0..99.9 (lakh) and 1.00..3.78
 * (crore), so a value of 10 or more is lakh and anything under is crore.
 */
export const PRICE_LAKH_BAND_MIN = 10;

export type FixedListing = Listing & {
  carpet_area_sqft: number;
  super_built_up_area_sqft: number;
  area_unit_corrected: boolean;
  latitude_fixed: number;
  longitude_fixed: number;
  coords_swapped: boolean;
  price_per_sqft: number;
};

export function fixListing(r: Listing): FixedListing {
  const areaIsSqm = r.carpet_area < AREA_SQM_THRESHOLD;
  const sbIsSqm = r.super_built_up_area < AREA_SQM_THRESHOLD;
  // Chennai is near 13°N 80°E. Nine records carry the pair the other way round,
  // which puts them in the Bay of Bengal.
  const coordsSwapped = r.latitude > 60 && r.longitude < 30;
  const carpet = areaIsSqm ? Math.round(r.carpet_area * SQM_TO_SQFT) : r.carpet_area;
  return {
    ...r,
    carpet_area_sqft: carpet,
    super_built_up_area_sqft: sbIsSqm ? Math.round(r.super_built_up_area * SQM_TO_SQFT) : r.super_built_up_area,
    area_unit_corrected: areaIsSqm || sbIsSqm,
    latitude_fixed: coordsSwapped ? r.longitude : r.latitude,
    longitude_fixed: coordsSwapped ? r.latitude : r.longitude,
    coords_swapped: coordsSwapped,
    price_per_sqft: r.price / carpet,
  };
}

export type FixedRental = Rental & {
  deposit_inr: number;
  deposit_months: number | null;
  deposit_unit_corrected: boolean;
};

export function fixRental(r: Rental): FixedRental {
  // zerobroker serialises deposit as a count of months' rent (2..10). Every
  // other record's deposit is an exact 2x..10x multiple of price, so the two
  // are the same quantity in different units.
  const inMonths = r.deposit > 0 && r.deposit <= 60 && r.deposit < r.price / 100;
  return {
    ...r,
    deposit_inr: inMonths ? r.deposit * r.price : r.deposit,
    deposit_months: inMonths ? r.deposit : null,
    deposit_unit_corrected: inMonths,
  };
}

export type FixedProject = Project & {
  price_min_inr: number;
  price_max_inr: number;
  price_unit_min: 'lakh' | 'crore';
  price_unit_max: 'lakh' | 'crore';
};

export const priceToInr = (v: number) =>
  Math.round(v >= PRICE_LAKH_BAND_MIN ? v * 1e5 : v * 1e7);

export function fixProject(p: Project): FixedProject {
  return {
    ...p,
    price_min_inr: priceToInr(p.price_min),
    price_max_inr: priceToInr(p.price_max),
    price_unit_min: p.price_min >= PRICE_LAKH_BAND_MIN ? 'lakh' : 'crore',
    price_unit_max: p.price_max >= PRICE_LAKH_BAND_MIN ? 'lakh' : 'crore',
  };
}

// ---------------------------------------------------------------- display ---

export const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

/** Indian short form: 37800000 -> "₹3.78 Cr". */
export function inrShort(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${n < 0 ? '-' : ''}₹${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${n < 0 ? '-' : ''}₹${(abs / 1e5).toFixed(2)} L`;
  return inr(n);
}

export const sqft = (n: number) => `${new Intl.NumberFormat('en-IN').format(n)} ft²`;

export const REFERENCE = new Date('2026-09-10T00:00:00+05:30');

/** posted_at is genuinely UTC - see findings.md - so IST is a straight shift. */
export const istString = (iso: string) =>
  new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().replace('T', ' ').slice(0, 16) + ' IST';
