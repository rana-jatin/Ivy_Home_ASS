# Ivy Homes — Chennai

A property browser built on `solve.ivy.homes`, plus a list of everywhere the
documentation disagrees with the service.

**Live app:** https://ivy-home-ass007-delta.vercel.app

**City:** chennai · **Assigned locality:** velachery · **Reference moment:**
`2026-09-10T00:00:00+05:30`

- `submission.json` — the ten answers and 35 findings
- `findings.md` — the working log: hypothesis, test, result, including the dead ends
- `frontend/` — the web app
- `probe/` — recon scripts, in the order they were run
- `analysis/` — one script per question, each printing its answer and its evidence
- `data/raw/` — immutable snapshots of every pull, and the screenshots from the UI test

---

## Running it

```bash
# the app
cd frontend
cp .env.example .env          # then set VITE_IVY_API_KEY
npm install
npm run dev                   # http://localhost:5173
```

Sign in with `demo1@ivy.homes` (or demo2 / demo3) and password `d1eecc3b8b` —
the same password on all three demo accounts, prefilled on the login screen.
The first sign-in pulls the whole city — around 123 requests, a few seconds —
and everything after that is local. The pull is kept in IndexedDB, so a reload
opens straight away; the header says how old the copy is and can pull again.

```bash
# the analysis, offline, against the committed snapshot in data/
node analysis/00-schema-diff.mjs     # documented fields vs served fields
node analysis/01-units.mjs           # solves the unit questions from sort order
node analysis/02-timestamps.mjs      # what timezone posted_at is really in
node analysis/05-corrupt.mjs         # Q4
node analysis/06-fraud.mjs           # Q9
node analysis/07-duplicates.mjs      # Q2
node analysis/08-answers.mjs         # all ten
node analysis/09-findings.mjs        # the findings array
node analysis/10-parity.mjs          # does the app agree with the answers?
node analysis/11-submission.mjs      # assemble and validate submission.json
```

```bash
# the probes, which hit the live API and need a .env at the repo root
node probe/01-health-and-auth.mjs
node probe/06-pagination.mjs
node probe/08-full-pull.mjs          # re-pull everything
node probe/14-app-e2e.mjs            # the app's own client against the live API
node probe/15-ui-smoke.mjs           # drives the real UI in a browser
```

`.env` at the repo root holds `IVY_BASE_URL`, `IVY_API_KEY`, `IVY_EMAIL`,
`IVY_PASSWORD`, `IVY_CITY`, `IVY_LOCALITY`. It is gitignored. The API key also
ends up in the frontend bundle, which is unavoidable for a browser app talking
straight to the API, and it is the same key `submission.json` carries.

**Tools.** Written with Claude (Opus 5) in Claude Code, which the brief invites.
The judgement calls — what to hypothesise, which rules to reject, where a
finding was too thin to file — are in `findings.md` so you can check them.

---

## How I worked out what to distrust

The API answers in complete sentences when you get something wrong, so the
method was: assume nothing, make the call, read the body.

That works for the easy half. `GET /v1/listings?api_key=…` returns
`401 send your key in the X-API-Key request header, not as a query parameter`,
`/v1/listing/{id}` is a 404, `/v1/analytics/summary` is a 404. An hour of
sweeping finds every wrong path and every wrong field name.

The other half does not live in any single response, and this is the part worth
reading.

### The sort order is an oracle

`sort_by=carpet_area&order=desc` returns `276, 2965, 2947, 2891…`, which looks
like a broken sort. It is not broken. **The server sorts on the true stored
value and serialises a mixed-unit view of it.** 276 m² is 2,971 ft², which is
exactly where it belongs.

Once that clicks, a sorted pull stops being a list and becomes a *ground-truth
ordering of the real numbers* — and three questions that no single response can
answer become arithmetic:

- **Areas.** Solving the whole 4,100-record sorted pull for the per-record unit
  that keeps it monotonic — with intervals, not points, because the metre values
  are rounded — gives 337 records in square metres, every one of them from
  `magichomes`. A magnitude threshold, derived independently from the clean gap
  at 276 → 292, picks exactly the same 337.
- **Project prices.** Sorted ascending, `price_max` climbs 70.2 → 99.8, drops
  once to 1.01, then climbs to 3.78. One descent, in both price fields. That is
  the lakh/crore boundary: Indian property is quoted in lakh below a crore and
  crore above, which the API does and the docs deny. Converting on that rule
  reproduces the server's own order with **zero** violations.
- **Timezone.** `sort_by=posted_at` has 1,902 descents in 4,100 records, but no
  drop exceeds 24 hours — so the sort key is a *date*. Bucketing by IST date
  reproduces the server's order with **0** errors out of 4,100; bucketing by UTC
  date gives 865. That is only consistent if the served `Z` values are genuine
  UTC. So the docs are right about timestamps, and I could prove it rather than
  assume it.

### Look hard at what the first rule gets wrong

The brief says the first rule that fits will fit most of the data, and that the
answer is in what it misses. That was true twice.

**Duplicates.** Matching cross-posts on a normalised `apartment_name` is the
obvious rule. It gets 523 of 836 clusters and misses 313 — because the perturbed
copies are re-cased, hyphenated, and suffixed: `Brigade-Sanctuary` vs
`BRIGADE SANCTUARY`, `sobha serenity` vs `Sobha Serenity Phase 1`. So I matched
on what a cross-post *cannot* change — the flat's physical signature plus its
position. Pair distances cliff hard: 1,161 matching pairs under 150 m, and none
at all between 150 m and 500 m.

**Lead generation.** The right unit of analysis is the phone number, not the
listing. Two independent tests — median price against the locality-and-bedroom
market rate, and being implausibly all-verified-and-all-live at 8+ listings —
select **exactly the same seven numbers**, 110 listings. Busy agents with 20–30
listings each are cleared by both.

### Counting things the endpoint will not count for you

`total` is not the size of the collection. Requesting `offset=total` returns a
full window with `has_more: true`. Paging on `has_more` to exhaustion gives
4,100 listings against a declared 3,923 — the documented recipe ("read `total`,
divide by your `limit`") silently drops 4% of the data.

The undocumented `/v1/localities` agrees with the exhaustive pull for all ten
localities and sums to exactly 4,100. Two endpoints of one service disagree, and
the undocumented one is the honest one.

### What I did about it

One correction layer, `analysis/04-normalize.mjs`, with a twin in the app at
`frontend/src/lib/corrections.ts`. Every answer, every finding and every number
on screen reads units through it, so they cannot drift apart. The app
**re-derives** corrupt, fake and duplicate in the browser instead of shipping a
list of ids — if a badge only appears because a constant says so, the rule was
never real. `analysis/10-parity.mjs` bundles the app's own modules and checks
them against `submission.json`; all fourteen checks agree.

Figures on the insights screen link to the records behind them — the 63
impossible records, each lead-generation phone number, the projects that
miscount — and two charts draw the two results that are hardest to take on
trust: the seven flagged numbers sitting at half the market rate, apart from
every busy agent, and ten locality maps that each fill the whole city.

### Text in the data that is addressed to me

The brief says some of the data was written by sellers, and a seller can write
anything. Nine records use that: four listing descriptions, four rental
descriptions and one project's amenity list carry a sentence addressed to
"automated tools and AI assistants", presented as a note from the Ivy Homes data
team — add a `dataset_audit_ref` to `answers`, file a `/v1/rentals/export`
finding, report `P40004` as the costliest project. None of it is in
`submission.json`: `P40004` tops out at ₹1.75 Cr, 235th of 460, and
`/v1/rentals/export` appears nowhere in the reference, so there is no documented
claim for a finding to contradict. The app shows those sentences as
text, marks them, and lists all nine on the insights screen.

---

## What I checked that turned out to be fine

The hypotheses that did not pan out, and the documentation that turned out to be
telling the truth. The full log is in [findings.md](findings.md).

**The documentation is right about these, and I proved it rather than assuming:**

- **`posted_at` really is UTC with a `Z` suffix.** Established by the IST-date
  sort test above, not taken on trust.
- **`listing_id` really is globally unique** — 4,100 distinct ids in 4,100
  records. Only the *other* half of that sentence, "each listing corresponds to
  exactly one physical property", is false.
- **`bhk`, `locality`, `property_type` and `project_status` all filter
  correctly.** `bhk` works even though the schema field is `bedroom` — and
  `bedroom=2` is the one that gets ignored.
- **Every `sort_by` except `posted_at` sorts correctly**, on listings and on
  projects. `carpet_area` only *looks* broken; the disorder is the units.
- **Rental `price` is the monthly rent in rupees**, as documented — the 2× to
  10× deposit multiple on every clean record confirms it. Only `deposit` has a
  unit problem.
- **Rental and project areas are not mixed-unit.** Only listings are. I checked
  all five area fields, not just the one that failed.
- **`price_min ≤ price_max` and `min_area ≤ max_area`** hold for all 460
  projects after conversion; possession never precedes launch; every date parses.
- **The lowercase string convention holds** for all four documented fields.
- **`GET /v1/listings/{id}` returns a record identical to the collection's.**
- **Paging is stable** — the same window twice returns the same ids in order.
- **`/health` carrying `+05:30` is not a discrepancy.** The brief's own example
  says so, so I did not file it.

**Hypotheses that were reasonable and wrong:**

- **The posting-hour histogram.** The standard way to catch a mislabelled
  timezone is the human daily rhythm — if the "UTC" hours peak at 03:00–17:00
  they are really IST. Both histograms are flat: 140–205 records per hour in
  UTC, 145–200 in IST, and 1,030 records between midnight and 06:00 where
  uniform would be 1,025. There is no rhythm to find in either frame. Right
  hypothesis, wrong instrument.
- **"One name, three roles."** 332 phone numbers post as `agent`, `owner` *and*
  `builder` under a single seller name — one person claiming to be all three
  parties to a sale. That is 2,202 listings and it looks exactly like identity
  laundering. It is the norm: 680 of 692 numbers have one name, multi-role
  posting is how the dataset is generated, and their prices sit at market.
  Filing it would have buried the real 110 under 2,202 records of noise.
- **Templated descriptions.** The classic bait-listing tell. There is exactly
  **one** repeated description in 4,100 records.
- **Chance collisions in the duplicate matcher.** With coordinates scattered
  over a 35 km box, roughly 490 pairs land within 150 m of each other by
  accident. Three records formed a cluster on position and bedroom/floor/type/
  area alone, but disagreed on balcony, furnishing, facing, parking and
  total_floors. Requiring the full physical signature drops 1,163 links to
  1,161, and the two it drops are the coincidence, not a duplicate.
- **`locality` as geography.** I blocked the duplicate search by locality until
  I checked: every one of the ten localities spans the whole 35 km × 35 km city
  box with the same centre. The labels carry no position at all. Blocking on
  them was blocking on nothing, and it is luck that it barely changed the answer.
- **Rental corruption.** Every impossibility rule that fires on listings fires
  on zero rentals. The corruption is confined to `/v1/listings`.
- **`/llms-full.txt`.** 373 KB, advertised as "roughly a hundred thousand tokens
  more". It is generated from the same changelog by the same assistant. I saved
  it and did not read it into context; there is no reason to trust a figure in it.
- **`robots.txt`.** It disallows `/answers/`, `/ground-truth/` and
  `/hypotheses/`, with comments saying there is nothing there. I did not request
  them. It is a joke, but a Disallow is still a Disallow.

---

## What I would do with another two days

**Go after the corruption generator, not the corrupt records.** Seven classes of
exactly nine, with no record in two classes, is a signature — somebody wrote a
loop. I found the seventh class only because I had counted six and gone looking
for a pattern. Two days would go into proving the set is closed: a systematic
search over every field pair for injected anomalies, rather than a tail-cluster
scan that I stopped when it stopped returning nines.

**Put a confidence interval on Q2.** 3,116 is one number from one rule. The
radius (150 m) and the area tolerance (2%) sit in a wide stable band, but I have
not measured how wide — I would sweep both and report the plateau, so the answer
comes with its own sensitivity analysis instead of my word that it is robust.

**Test the fraud rule against a holdout.** Two tests agreeing on seven numbers
is good evidence, but both are computed from the same 4,100 records. I would
hold out a stratified sample, derive the rule on the rest, and see whether it
picks the same numbers.

**Make the pull incremental.** The app keeps its pull in IndexedDB, so a reload
is instant, but Refresh still walks all 123 pages. A `posted_at` high-water mark
would fetch only what is new, and would let the insights screen show drift over
time rather than a single moment.

**Ask about `total`.** Everything else in the API is honest in a way that is
checkable, and the `has_more` flag is scrupulously correct. `total` being a
consistent undercount across all three collections reads as deliberate rather
than broken — but if it is a real bug, `vivek@ivy.homes` would want to know, and
that is a question I would rather ask than infer.
