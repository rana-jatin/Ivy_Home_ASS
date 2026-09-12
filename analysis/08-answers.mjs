// The ten answers, each computed from the offline snapshot through the shared
// correction layer, and each printing the evidence it stands on.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, E } from '../probe/lib.mjs';
import { listings, rentals, projects, REFERENCE } from './04-normalize.mjs';

const L = listings(), R = rentals(), P = projects();
const read = (f) => JSON.parse(readFileSync(join(ROOT, `analysis/${f}`), 'utf8'));
const corruptIds = read('out-corrupt.json').ids;
const fakeIds = read('out-fraud.json').ids;
const dup = read('out-duplicates.json');
const corrupt = new Set(corruptIds), fake = new Set(fakeIds);
const LOCALITY = E.IVY_LOCALITY;

const answers = {};
const say = (k, v, why) => { answers[k] = v; console.log(`${k.padEnd(34)} ${JSON.stringify(v)}\n${' '.repeat(34)} ${why}\n`); };

// 1 -------------------------------------------------------------------------
say('total_listing_records', L.length,
  `paged /v1/listings on has_more to exhaustion; total said ${JSON.parse(readFileSync(join(ROOT, 'data/raw/pull-audit.json'), 'utf8')).result.listings.declared_total}, which is an undercount`);

// 2 -------------------------------------------------------------------------
say('unique_properties', dup.distinct_properties,
  `${dup.duplicate_records} of the ${L.length} records are re-posts; matched on physical signature + position within ${dup.radius_m}m`);

// 3 -------------------------------------------------------------------------
const live = L.filter((r) => r.is_live);
say('active_listings', live.length,
  `is_live true; the remaining ${L.length - live.length} are served despite the docs saying inactive listings are excluded`);

// 4 -------------------------------------------------------------------------
say('corrupt_listing_ids', corruptIds,
  `${corruptIds.length} ids across 7 classes of impossibility, 9 records each, no overlap`);

// 5 -------------------------------------------------------------------------
const mine = R.filter((r) => r.locality === LOCALITY);
const rent = mine.reduce((a, r) => a + r.monthly_rent_inr, 0);
say('total_monthly_rent', rent,
  `${mine.length} rentals in ${LOCALITY}; price is genuinely monthly (deposit is a 2-10x multiple of it), so no correction applies`);

// 6 -------------------------------------------------------------------------
const pool = L.filter((r) => r.is_live && r.bedroom === 2 && !corrupt.has(r.listing_id) && !fake.has(r.listing_id));
const mean = pool.reduce((a, r) => a + r.price / r.carpet_area_sqft, 0) / pool.length;
const meanRounded = Math.round(mean * 100) / 100;
say('avg_price_per_sqft_2bhk', meanRounded,
  `${pool.length} records (is_live, 2 bedroom, minus ${corruptIds.length} corrupt and ${fakeIds.length} fake); carpet_area converted to sqft where it was square metres`);

// 7 -------------------------------------------------------------------------
const costliest = [...P].sort((a, b) => b.price_max_inr - a.price_max_inr)[0];
say('costliest_project', { project_id: costliest.project_id, price_max_inr: costliest.price_max_inr },
  `price_max ${costliest.price_max} is crore, not the documented rupees; ${costliest.apartment_name}, ${costliest.locality}`);

// 8 -------------------------------------------------------------------------
const from = new Date(REFERENCE.getTime() - 7 * 864e5);
const week = L.filter((r) => { const t = new Date(r.posted_at); return t >= from && t < REFERENCE; });
say('listings_last_7_days', week.length,
  `[${from.toISOString()}, ${REFERENCE.toISOString()}) - posted_at really is UTC, proven by the server's own IST-date ordering`);

// 9 -------------------------------------------------------------------------
say('fake_listing_ids', fakeIds,
  `${fakeIds.length} listings on ${read('out-fraud.json').contacts.length} phone numbers that two independent tests agree on`);

// 10 ------------------------------------------------------------------------
const liveByProject = {};
for (const r of L) if (r.project_id && r.is_live) liveByProject[r.project_id] = (liveByProject[r.project_id] ?? 0) + 1;
const wrong = P.filter((p) => (liveByProject[p.project_id] ?? 0) !== p.total_listings);
say('projects_with_wrong_listing_count', wrong.length,
  `counting live listings makes ${P.length - wrong.length}/${P.length} projects agree; counting every record makes only 124 agree, so live is the intended meaning`);

writeFileSync(join(ROOT, 'analysis/out-answers.json'), JSON.stringify(answers, null, 2));
console.log('wrote analysis/out-answers.json');

// A few cross-checks that are worth seeing next to the answers.
console.log('\n--- cross-checks ---');
const loc = JSON.parse(readFileSync(join(ROOT, 'data/raw/probe-04-undocumented.json'), 'utf8'))['/v1/localities'];
const locSum = loc.results.reduce((a, x) => a + x.listing_count, 0);
console.log(`/v1/localities listing_count sums to ${locSum}; the pull has ${L.length} -> ${locSum === L.length ? 'agrees' : 'DISAGREES'}`);
const perLoc = L.reduce((a, r) => { a[r.locality] = (a[r.locality] ?? 0) + 1; return a; }, {});
const mismatch = loc.results.filter((x) => perLoc[x.locality] !== x.listing_count);
console.log(`per-locality agreement: ${loc.results.length - mismatch.length}/${loc.results.length}`);
console.log(`llms.txt claims Chennai has 3,916 records / 3,266 distinct / 3,000 live / 107 bad project counts`);
console.log(`we measured                 ${L.length} records / ${dup.distinct_properties} distinct / ${live.length} live / ${wrong.length} bad project counts`);
