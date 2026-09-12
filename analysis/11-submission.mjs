// Assemble submission.json from the analysis outputs and validate its shape
// against the spec before writing it. Nothing here is typed by hand except the
// candidate block.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, E } from '../probe/lib.mjs';

const read = (f) => JSON.parse(readFileSync(join(ROOT, `analysis/${f}`), 'utf8'));
const answers = read('out-answers.json');
const findings = read('out-findings.json');

const candidate = {
  name: 'Jatin Rana',
  email: 'jatinrana1230987@gmail.com',
  repo_url: 'https://github.com/jatinrana/ivy-homes-chennai',
  demo_url: 'https://ivy-homes-chennai.vercel.app',
};

const submission = { api_key: E.IVY_API_KEY, candidate, answers, findings };

// ---------------------------------------------------------------- checks ---
const problems = [];
const need = (cond, msg) => { if (!cond) problems.push(msg); };

need(/^IVY26-/.test(submission.api_key), 'api_key does not look like a key');
for (const k of ['name', 'email', 'repo_url', 'demo_url']) need(!!candidate[k], `candidate.${k} is empty`);

const shape = {
  total_listing_records: 'number',
  unique_properties: 'number',
  active_listings: 'number',
  corrupt_listing_ids: 'array',
  total_monthly_rent: 'number',
  avg_price_per_sqft_2bhk: 'number',
  costliest_project: 'object',
  listings_last_7_days: 'number',
  fake_listing_ids: 'array',
  projects_with_wrong_listing_count: 'number',
};
for (const [k, t] of Object.entries(shape)) {
  const v = answers[k];
  const actual = Array.isArray(v) ? 'array' : typeof v;
  need(actual === t, `answers.${k} should be ${t}, is ${actual}`);
}
need(Object.keys(answers).length === Object.keys(shape).length,
  `answers has ${Object.keys(answers).length} keys, spec has ${Object.keys(shape).length}`);
need(typeof answers.costliest_project?.project_id === 'string' && answers.costliest_project.project_id.length > 0,
  'costliest_project.project_id missing');
need(Number.isInteger(answers.costliest_project?.price_max_inr), 'costliest_project.price_max_inr must be an integer rupee value');
need(Number.isInteger(answers.total_monthly_rent), 'total_monthly_rent must be an integer');
// binary floating point means 10010.62 * 100 is not exactly 1001062, so compare
// the value against its own 2-decimal rounding rather than testing the product
need(Math.abs(answers.avg_price_per_sqft_2bhk - Number(answers.avg_price_per_sqft_2bhk.toFixed(2))) < 1e-9,
  'avg_price_per_sqft_2bhk must be to 2 decimals');

for (const key of ['corrupt_listing_ids', 'fake_listing_ids']) {
  const a = answers[key];
  need(a.every((x) => typeof x === 'string'), `${key} must be strings`);
  need(new Set(a).size === a.length, `${key} has duplicates`);
  need(a.every((x, i) => i === 0 || a[i - 1] <= x), `${key} is not sorted`);
}
need(answers.corrupt_listing_ids.every((x) => !answers.fake_listing_ids.includes(x)),
  'a listing is claimed as both corrupt and fake');

const CATEGORIES = new Set(['auth', 'pagination', 'units', 'filters', 'sorting', 'timestamps',
  'duplicates', 'completeness', 'data_quality', 'fraud', 'consistency', 'missing_endpoint', 'undocumented_endpoint']);
const NEEDS_EVIDENCE = new Set(['units', 'duplicates', 'completeness', 'data_quality', 'fraud', 'consistency']);
findings.forEach((f, i) => {
  for (const k of ['endpoint', 'category', 'documented', 'actual', 'how_found', 'impact']) {
    need(typeof f[k] === 'string' && f[k].length > 0, `findings[${i}].${k} is empty`);
  }
  need(CATEGORIES.has(f.category), `findings[${i}].category "${f.category}" is not in the list`);
  need(Array.isArray(f.evidence), `findings[${i}].evidence must be an array`);
  need(f.evidence.length <= 20, `findings[${i}].evidence has ${f.evidence.length} entries, max is 20`);
  need(!NEEDS_EVIDENCE.has(f.category) || f.evidence.length > 0,
    `findings[${i}] is a ${f.category} claim about records with no evidence`);
  // path params must be written as {id}
  need(!/\/(?:100|MAG|DWE|SQU|ZER)-\d+|\/P4\d{4}|\/R4\d{6}/.test(f.endpoint),
    `findings[${i}].endpoint "${f.endpoint}" contains a literal id instead of {id}`);
});

if (problems.length) {
  console.error('submission.json is NOT valid:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

writeFileSync(join(ROOT, 'submission.json'), JSON.stringify(submission, null, 2) + '\n');
console.log('submission.json written and validated');
console.log(`  answers: ${Object.keys(answers).length} keys`);
console.log(`  findings: ${findings.length}`);
console.log(`  corrupt ids: ${answers.corrupt_listing_ids.length}, fake ids: ${answers.fake_listing_ids.length}`);
const byCat = findings.reduce((a, f) => { a[f.category] = (a[f.category] ?? 0) + 1; return a; }, {});
console.log('  by category: ' + Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(', '));
