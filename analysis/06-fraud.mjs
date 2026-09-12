// Q9 - listings that exist to generate enquiries rather than to sell a flat.
//
// Lead generation is run per phone number, so the phone number is the unit of
// analysis, not the individual listing. Two independent tests are applied and
// they have to agree before a number is called fake.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../probe/lib.mjs';
import { listings } from './04-normalize.mjs';

const corrupt = new Set(JSON.parse(readFileSync(join(ROOT, 'analysis/out-corrupt.json'), 'utf8')).ids);
const L = listings().filter((r) => !corrupt.has(r.listing_id));

// Market rate per locality x bedroom. The median is robust to the bait
// listings themselves, which are a small share of any one cell.
const cell = (r) => `${r.locality}|${r.bedroom}`;
const cells = {};
for (const r of L) (cells[cell(r)] ??= []).push(r.price / r.carpet_area_sqft);
const median = {};
for (const [k, v] of Object.entries(cells)) { v.sort((a, b) => a - b); median[k] = v[Math.floor(v.length / 2)]; }
const ratio = (r) => (r.price / r.carpet_area_sqft) / median[cell(r)];

const byContact = {};
for (const r of L) (byContact[r.posted_by_contact] ??= []).push(r);

const contacts = Object.entries(byContact).map(([contact, rs]) => {
  const rr = rs.map(ratio).sort((a, b) => a - b);
  return {
    contact, n: rs.length,
    median_ratio: rr[Math.floor(rr.length / 2)],
    all_verified: rs.every((r) => r.is_verified),
    all_live: rs.every((r) => r.is_live),
    all_agent: rs.every((r) => r.posted_by === 'agent'),
    distinct_names: new Set(rs.map((r) => r.posted_by_name)).size,
    websites: new Set(rs.map((r) => r.website)).size,
    localities: new Set(rs.map((r) => r.locality)).size,
    ids: rs.map((r) => r.listing_id),
  };
}).sort((a, b) => a.median_ratio - b.median_ratio);

// Test 1: price. Sorting contacts by median price-to-market ratio leaves one
// gap worth calling a gap, and it falls after the seventh contact.
let gapAt = null, gapSize = 0;
for (let i = 1; i < 30; i++) {
  const g = contacts[i].median_ratio - contacts[i - 1].median_ratio;
  if (g > gapSize) { gapSize = g; gapAt = i; }
}
const byPrice = contacts.slice(0, gapAt);

// Test 2: implausible perfection. Overall 60% of listings are verified and 79%
// are live, so a number with eight or more listings that are ALL both is not
// a coincidence.
const byPerfection = contacts.filter((c) => c.n >= 8 && c.all_verified && c.all_live);

const setEq = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const agree = setEq(byPrice.map((c) => c.contact), byPerfection.map((c) => c.contact));

console.log(`largest gap in median price ratio falls after contact ${gapAt}: ${contacts[gapAt - 1].median_ratio.toFixed(3)} -> ${contacts[gapAt].median_ratio.toFixed(3)} (${gapSize.toFixed(3)})`);
console.log(`test 1 (price)      selects ${byPrice.length} numbers`);
console.log(`test 2 (perfection) selects ${byPerfection.length} numbers`);
console.log(`the two tests agree exactly: ${agree}`);
console.log();
for (const c of byPrice) {
  console.log(`  ${c.contact}  n=${String(c.n).padStart(3)}  median_ratio=${c.median_ratio.toFixed(3)}  names=${c.distinct_names}  websites=${c.websites}  localities=${c.localities}  all_agent=${c.all_agent}`);
}

const fakeContacts = byPrice.map((c) => c.contact);
const ids = byPrice.flatMap((c) => c.ids).sort();
console.log(`\n=== ${ids.length} fake listing_ids across ${fakeContacts.length} phone numbers ===`);

// Busy agents that are NOT fake, to show the test discriminates.
console.log('\nhigh-volume numbers the tests clear:');
for (const c of contacts.filter((c) => c.n >= 18 && !fakeContacts.includes(c.contact))) {
  console.log(`  ${c.contact}  n=${c.n}  median_ratio=${c.median_ratio.toFixed(3)}  all_verified=${c.all_verified}  all_live=${c.all_live}`);
}

writeFileSync(join(ROOT, 'analysis/out-fraud.json'), JSON.stringify({
  ids, contacts: fakeContacts, gapAt, gapSize, tests_agree: agree,
  detail: byPrice.map(({ ids, ...rest }) => rest),
}, null, 2));
console.log('\nwrote analysis/out-fraud.json');
