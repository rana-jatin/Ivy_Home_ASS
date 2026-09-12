// Does the app agree with the answers?
//
// The frontend re-derives corrupt / fake / duplicate in the browser instead of
// shipping a list of ids. That is only worth doing if it lands on the same
// numbers, so this bundles the app's own modules and runs them over the same
// snapshot the answers were computed from. A disagreement here means the app
// is showing a user something submission.json does not claim.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../probe/lib.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'ivy-parity-'));
const entry = join(tmp, 'entry.ts');
writeFileSync(entry, `
export { fixListing, fixRental, fixProject } from ${JSON.stringify(join(ROOT, 'frontend/src/lib/corrections.ts'))};
export { computeFlags } from ${JSON.stringify(join(ROOT, 'frontend/src/lib/flags.ts'))};
export { selectListings, SORTS } from ${JSON.stringify(join(ROOT, 'frontend/src/lib/browse.ts'))};
`);
const out = join(tmp, 'bundle.mjs');
// esbuild comes with vite; use its API rather than shelling out to npx.
const esbuild = await import(pathToFileURL(join(ROOT, 'frontend/node_modules/esbuild/lib/main.js')).href);
await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning' });

const app = await import(pathToFileURL(out).href);
const load = (n) => JSON.parse(readFileSync(join(ROOT, `data/${n}.json`), 'utf8'));
const listings = load('listings').map(app.fixListing);
const rentals = load('rentals').map(app.fixRental);
const projects = load('projects').map(app.fixProject);
const flags = app.computeFlags(listings);

const answers = JSON.parse(readFileSync(join(ROOT, 'analysis/out-answers.json'), 'utf8'));
const eqSet = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// The listings screen's "one per property" view. With nothing filtered out it
// must show exactly unique_properties records, and the copy it keeps must be
// the one the chosen sort puts first - a hidden duplicate that sorts ahead of
// the kept one means a user sorting by price is shown the dearer copy.
const query = (over) => ({
  locality: '', bedroom: '', furnishing: '', propertyType: '', minPrice: '', maxPrice: '',
  quality: 'all', sort: 'posted_desc', dedupe: false, ...over,
});
const onePerProperty = app.selectListings(listings, flags, query({ dedupe: true })).length;
let outranked = 0;
for (const quality of ['clean', 'all', 'flagged']) {
  for (const [sort, cmp] of Object.entries(app.SORTS)) {
    const visible = new Map(app.selectListings(listings, flags, query({ quality, sort })).map((r) => [r.listing_id, r]));
    for (const kept of app.selectListings(listings, flags, query({ quality, sort, dedupe: true }))) {
      const ahead = (flags.duplicatesOf.get(kept.listing_id) ?? [])
        .some((id) => visible.has(id) && cmp(visible.get(id), kept) < 0);
      if (ahead) outranked++;
    }
  }
}

const checks = [
  ['total_listing_records', listings.length, answers.total_listing_records],
  ['unique_properties', flags.distinctProperties, answers.unique_properties],
  ['active_listings', listings.filter((r) => r.is_live).length, answers.active_listings],
  ['corrupt_listing_ids', [...flags.corrupt.keys()].sort(), answers.corrupt_listing_ids],
  ['fake_listing_ids', [...flags.fakeIds].sort(), answers.fake_listing_ids],
  ['costliest_project',
    [...projects].sort((a, b) => b.price_max_inr - a.price_max_inr)[0].price_max_inr,
    answers.costliest_project.price_max_inr],
  ['rentals deposit corrections', rentals.filter((r) => r.deposit_unit_corrected).length, 301],
  ['listings area corrections', listings.filter((r) => r.area_unit_corrected).length, 337],
  ['one per property, unfiltered', onePerProperty, answers.unique_properties],
  ['kept copy outranked by hidden', outranked, 0],
];

let bad = 0;
for (const [name, got, want] of checks) {
  const ok = Array.isArray(got) ? eqSet(got, want) : got === want;
  if (!ok) bad++;
  const show = (v) => (Array.isArray(v) ? `${v.length} ids` : String(v));
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name.padEnd(28)} app=${show(got).padEnd(12)} answers=${show(want)}`);
}
console.log(bad === 0 ? '\nthe app and submission.json agree on every check' : `\n${bad} MISMATCH`);
process.exit(bad === 0 ? 0 : 1);
