// A look at every field's value distribution before forming any hypothesis.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../probe/lib.mjs';
const load = (n) => JSON.parse(readFileSync(join(ROOT, `data/${n}.json`), 'utf8'));

function profile(recs, name) {
  console.log(`\n########## ${name} (${recs.length}) ##########`);
  const keys = Object.keys(recs[0]);
  for (const k of keys) {
    const vals = recs.map((r) => r[k]);
    const nulls = vals.filter((v) => v === null || v === undefined).length;
    const nn = vals.filter((v) => v !== null && v !== undefined);
    if (typeof nn[0] === 'number') {
      const s = [...nn].sort((a, b) => a - b);
      const q = (p) => s[Math.floor((s.length - 1) * p)];
      const neg = nn.filter((v) => v < 0).length, zero = nn.filter((v) => v === 0).length;
      console.log(`${k.padEnd(24)} num  min=${String(q(0)).padEnd(12)} p50=${String(q(0.5)).padEnd(12)} max=${String(q(1)).padEnd(12)} nulls=${String(nulls).padEnd(5)} neg=${String(neg).padEnd(4)} zero=${zero}`);
    } else if (typeof nn[0] === 'boolean') {
      console.log(`${k.padEnd(24)} bool true=${nn.filter(Boolean).length} false=${nn.filter((v) => v === false).length} nulls=${nulls}`);
    } else if (Array.isArray(nn[0])) {
      console.log(`${k.padEnd(24)} arr  lens ${Math.min(...nn.map((a) => a.length))}..${Math.max(...nn.map((a) => a.length))} nulls=${nulls}`);
    } else {
      const u = new Set(nn.map(String));
      const short = u.size <= 14 ? ` values=${JSON.stringify([...u])}` : ` distinct=${u.size} e.g. ${JSON.stringify([...u].slice(0, 3))}`;
      console.log(`${k.padEnd(24)} str  nulls=${String(nulls).padEnd(5)}${short}`.slice(0, 190));
    }
  }
}

const listings = load('listings'), rentals = load('rentals'), projects = load('projects');
profile(listings, 'listings');
profile(rentals, 'rentals');
profile(projects, 'projects');

console.log('\n########## cross-cuts ##########');
const by = (recs, f) => recs.reduce((a, r) => { a[r[f]] = (a[r[f]] ?? 0) + 1; return a; }, {});
console.log('listings by website:', JSON.stringify(by(listings, 'website')));
console.log('listings is_live by website:', JSON.stringify(listings.reduce((a, r) => { a[r.website] ??= { live: 0, dead: 0 }; a[r.website][r.is_live ? 'live' : 'dead']++; return a; }, {})));
console.log('listing_id prefixes:', JSON.stringify(by(listings, 'listing_id'.replace('listing_id', 'website'))));
console.log('id prefix sample:', JSON.stringify([...new Set(listings.map((r) => r.listing_id.split('-')[0]))]));
console.log('rentals id prefix sample:', JSON.stringify([...new Set(rentals.map((r) => r.listing_id.slice(0, 1)))]));
console.log('listings by locality:', JSON.stringify(by(listings, 'locality')));
console.log('listings by bedroom:', JSON.stringify(by(listings, 'bedroom')));
console.log('listings with project_id null:', listings.filter((r) => r.project_id === null).length);
console.log('distinct project_id in listings:', new Set(listings.map((r) => r.project_id).filter(Boolean)).size, '| projects endpoint has', projects.length);
console.log('distinct posted_by_contact:', new Set(listings.map((r) => r.posted_by_contact)).size);
console.log('distinct descriptions:', new Set(listings.map((r) => r.description)).size);
console.log('distinct apartment_name:', new Set(listings.map((r) => r.apartment_name)).size);
