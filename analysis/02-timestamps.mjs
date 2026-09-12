// What timezone is posted_at really in, and what does sort_by=posted_at sort on?
//
// The sorted pull has 1902 descents at full-timestamp resolution but the drops
// never exceed 24h, which says the sort key is a DATE. Which calendar date?
// Testing each candidate timezone against the server's own ordering decides it.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../probe/lib.mjs';

const load = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
const report = {};

const dateIn = (iso, offsetHours) =>
  new Date(new Date(iso).getTime() + offsetHours * 3.6e6).toISOString().slice(0, 10);

for (const [name, file, idKey] of [['listings', 'data/sorted-listings-by-posted_at.json', 'listing_id'], ['rentals', 'data/sorted-rentals-by-posted_at.json', 'listing_id']]) {
  const recs = load(file);
  console.log(`=== ${name}: what is sort_by=posted_at ordering on? ===`);
  const trials = {};
  for (const [label, off] of [['UTC date (offset 0)', 0], ['IST date (offset +5.5)', 5.5], ['offset +8', 8], ['offset -5.5', -5.5]]) {
    let bad = 0;
    let prev = '';
    for (const r of recs) {
      const d = dateIn(r.posted_at, off);
      if (d < prev) bad++;
      if (d > prev) prev = d;
    }
    trials[label] = bad;
    console.log(`  bucket by ${label.padEnd(24)} -> ${bad} out-of-order records`);
  }
  // full-timestamp monotonicity, for contrast
  let tsBad = 0;
  for (let i = 1; i < recs.length; i++) if (recs[i].posted_at < recs[i - 1].posted_at) tsBad++;
  console.log(`  bucket by full timestamp        -> ${tsBad} out-of-order records`);
  report[`${name}_sort_key`] = { ...trials, full_timestamp: tsBad };
  console.log();
}

// -------- posting-hour histogram: do these look like human activity? --------
for (const [name, file] of [['listings', 'data/listings.json'], ['rentals', 'data/rentals.json']]) {
  const recs = load(file);
  const hUTC = Array(24).fill(0), hIST = Array(24).fill(0);
  for (const r of recs) {
    const d = new Date(r.posted_at);
    hUTC[d.getUTCHours()]++;
    hIST[new Date(d.getTime() + 5.5 * 3.6e6).getUTCHours()]++;
  }
  console.log(`=== ${name} posting-hour histogram (n=${recs.length}) ===`);
  console.log('hour: ' + Array.from({ length: 24 }, (_, i) => String(i).padStart(4)).join(''));
  console.log('UTC:  ' + hUTC.map((c) => String(c).padStart(4)).join(''));
  console.log('IST:  ' + hIST.map((c) => String(c).padStart(4)).join(''));
  const night = (h) => h.slice(0, 6).reduce((a, b) => a + b, 0);
  console.log(`records in 00:00-05:59  UTC: ${night(hUTC)}  IST: ${night(hIST)}   (uniform would be ~${Math.round(recs.length / 4)})`);
  report[`${name}_hours`] = { utc: hUTC, ist: hIST };
  console.log();
}

// ---------------- future postings relative to the reference ----------------
const REFERENCE = new Date('2026-09-10T00:00:00+05:30');
for (const [name, file, idKey] of [['listings', 'data/listings.json', 'listing_id'], ['rentals', 'data/rentals.json', 'listing_id']]) {
  const recs = load(file);
  const future = recs.filter((r) => new Date(r.posted_at) >= REFERENCE);
  const sorted = future.sort((a, b) => a.posted_at.localeCompare(b.posted_at));
  console.log(`${name}: ${future.length} records posted at or after REFERENCE (${REFERENCE.toISOString()})`);
  console.log('   latest:', sorted.at(-1)?.posted_at, sorted.at(-1)?.[idKey]);
  console.log('   spread:', sorted[0]?.posted_at, '->', sorted.at(-1)?.posted_at);
  report[`${name}_future`] = { count: future.length, ids: future.map((r) => r[idKey]), latest: sorted.at(-1)?.posted_at };
}

writeFileSync(join(ROOT, 'analysis/out-timestamps.json'), JSON.stringify(report, null, 2));
console.log('\nwrote analysis/out-timestamps.json');
