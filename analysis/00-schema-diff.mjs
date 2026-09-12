// Phase 0.6 — every field the API serves vs every field the reference documents.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../probe/lib.mjs';

const load = (n) => JSON.parse(readFileSync(join(ROOT, `data/${n}.json`), 'utf8'));
const listings = load('listings'), rentals = load('rentals'), projects = load('projects');

// Fields as printed in API_REFERENCE.md's example objects.
const documented = {
  listings: ['listing_id','listing_url','website','city_id','apartment_name','locality','property_type','bedroom','bathroom','balcony','floor','total_floors','furnishing','facing_direction','covered_parking','price','carpet_area','super_built_up_area','latitude','longitude','posted_by','posted_by_name','posted_by_contact','project_id','description','posted_at','is_verified'],
  rentals: ['listing_id','listing_url','website','city_id','title','apartment_name','locality','property_type','bedroom','bathroom','floor','total_floors','furnishing','facing_direction','price','deposit','maintenance','carpet_area','super_builtup_area','latitude','longitude','posted_by','posted_by_name','posted_by_contact','description','posted_at'],
  projects: ['project_id','project_url','city_id','apartment_name','developer_name','locality','project_status','total_units','total_towers','total_floors','launch_date','possession_date','rera_number','min_area_sqft','max_area_sqft','total_listings','price_min','price_max','amenities','latitude','longitude'],
};

const report = {};
for (const [name, recs] of [['listings', listings], ['rentals', rentals], ['projects', projects]]) {
  const seen = new Map(); // field -> {count, types, nulls, sample}
  for (const r of recs) {
    for (const [k, v] of Object.entries(r)) {
      if (!seen.has(k)) seen.set(k, { present: 0, nulls: 0, types: new Set(), sample: undefined });
      const s = seen.get(k);
      s.present++;
      if (v === null) s.nulls++;
      else { s.types.add(Array.isArray(v) ? 'array' : typeof v); if (s.sample === undefined) s.sample = v; }
    }
  }
  const actual = [...seen.keys()].sort();
  const doc = documented[name];
  const undocumentedFields = actual.filter((f) => !doc.includes(f));
  const missingFields = doc.filter((f) => !actual.includes(f));
  const optional = actual.filter((f) => seen.get(f).present < recs.length);

  report[name] = {
    records: recs.length,
    undocumented_fields: undocumentedFields.map((f) => ({ field: f, present_in: seen.get(f).present, nulls: seen.get(f).nulls, types: [...seen.get(f).types], sample: seen.get(f).sample })),
    documented_but_absent: missingFields,
    not_on_every_record: optional.map((f) => ({ field: f, present_in: seen.get(f).present })),
    all_fields: actual.map((f) => ({ field: f, types: [...seen.get(f).types], nulls: seen.get(f).nulls })),
  };

  console.log(`\n=== ${name} (${recs.length} records) ===`);
  console.log('undocumented fields:', undocumentedFields.length ? JSON.stringify(report[name].undocumented_fields, null, 2) : 'none');
  console.log('documented but absent:', missingFields.length ? missingFields.join(', ') : 'none');
  console.log('fields not on every record:', optional.length ? JSON.stringify(report[name].not_on_every_record) : 'none');
}

writeFileSync(join(ROOT, 'analysis/out-schema-diff.json'), JSON.stringify(report, null, 2));
console.log('\nwrote analysis/out-schema-diff.json');
