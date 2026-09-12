// The one correction layer. Everything downstream - answers, findings and the
// frontend - reads units through this module so they cannot drift apart.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../probe/lib.mjs';

export const SQM_TO_SQFT = 10.7639;
// Below this, carpet_area / super_built_up_area are square metres. Derived from
// the server's own sort order, which puts the two populations in a clean gap
// at 276 -> 292 sqft; see analysis/01-units.mjs.
export const AREA_SQM_THRESHOLD = 284;

export const loadRaw = (n) => JSON.parse(readFileSync(join(ROOT, `data/${n}.json`), 'utf8'));

export function normListing(r) {
  const areaIsSqm = r.carpet_area < AREA_SQM_THRESHOLD;
  const sbIsSqm = r.super_built_up_area < AREA_SQM_THRESHOLD;
  // Chennai sits near 13N 80E; a few records carry the pair the other way round.
  const coordsSwapped = r.latitude > 60 && r.longitude < 30;
  return {
    ...r,
    carpet_area_sqft: areaIsSqm ? Math.round(r.carpet_area * SQM_TO_SQFT) : r.carpet_area,
    super_built_up_area_sqft: sbIsSqm ? Math.round(r.super_built_up_area * SQM_TO_SQFT) : r.super_built_up_area,
    area_unit_corrected: areaIsSqm || sbIsSqm,
    latitude_fixed: coordsSwapped ? r.longitude : r.latitude,
    longitude_fixed: coordsSwapped ? r.latitude : r.longitude,
    coords_swapped: coordsSwapped,
  };
}

export function normRental(r) {
  // zerobroker serialises deposit as a number of months' rent, not rupees.
  const depositInMonths = r.deposit > 0 && r.deposit <= 60 && r.deposit < r.price / 100;
  return {
    ...r,
    deposit_inr: depositInMonths ? r.deposit * r.price : r.deposit,
    deposit_unit_corrected: depositInMonths,
    monthly_rent_inr: r.price,
  };
}

// A project price of x is x lakh when x >= 1 crore cannot be meant, i.e. when
// the value sits in the lakh band (>= 10, which is 10 lakh and up) and in crore
// when it sits in the crore band (< 10). The two bands do not overlap in this
// dataset: lakh values run 32.0..99.9 and crore values run 1.00..3.78.
export const PRICE_LAKH_BAND_MIN = 10;
export function priceToInr(v) {
  if (v === null || v === undefined) return null;
  return Math.round(v >= PRICE_LAKH_BAND_MIN ? v * 1e5 : v * 1e7);
}

export function normProject(r) {
  return {
    ...r,
    price_min_inr: priceToInr(r.price_min),
    price_max_inr: priceToInr(r.price_max),
    price_unit_min: r.price_min >= PRICE_LAKH_BAND_MIN ? 'lakh' : 'crore',
    price_unit_max: r.price_max >= PRICE_LAKH_BAND_MIN ? 'lakh' : 'crore',
  };
}

export const REFERENCE = new Date('2026-09-10T00:00:00+05:30');
export const istDate = (iso) => new Date(new Date(iso).getTime() + 5.5 * 3.6e6).toISOString().slice(0, 10);

export const listings = () => loadRaw('listings').map(normListing);
export const rentals = () => loadRaw('rentals').map(normRental);
export const projects = () => loadRaw('projects').map(normProject);
