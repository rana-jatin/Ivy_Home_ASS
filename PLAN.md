# Ivy Homes Assignment — Implementation Plan for Claude Code

Deadline: 23:59 IST, Mon 14 Sep 2026. Register FIRST (closes Sat 13 Sep 23:59 IST).
Prime directive: the API is the source of truth; API_REFERENCE.md is adversarial.
Never trust a documented claim you haven't reproduced. Precision > recall on findings.

## Repo layout

```
/probe/          # one-off recon scripts, keep them — they're evidence of process
/data/raw/       # immutable JSON snapshots of every full pull (commit these)
/analysis/       # one script per question: q1.py ... q10.py, each prints answer + evidence
/frontend/       # the web app
/findings.md     # running log: hypothesis → test → result (incl. negatives, for README)
submission.json
README.md
```

Commit at the end of every phase and every confirmed finding. Message format:
`probe: token expires at 20min, docs say 24h` — the history is graded.

## Phase 0 — Recon (do before writing any app code)

1. `GET /health` — record the server clock and its offset. This is the timezone
   ground truth for Q8.
2. Auth probes:
   - API key as query param (documented) vs `X-API-Key` / `Authorization` header. Try all.
   - Login, then hit an authed endpoint every 60s and log the first 401.
     Empirically measure token TTL. Docs say 24h — the statement's "still working
     30 minutes later" hint says otherwise. Check the login response for
     undocumented fields (refresh_token?).
   - Probe `/auth/refresh`, `/auth/logout` existence.
3. Endpoint existence sweep (expect 404s = findings, and undocumented ones):
   - `/v1/listing/{id}` (singular, as documented) vs `/v1/listings/{id}`
   - `/v1/listings/{id}/similar`
   - `/v1/favourites` vs `/v1/favorites`
   - `/v1/analytics/summary`; also probe `/v1/analytics/*` variants, `/v1/localities`,
     `/v1/cities`, `/v1/projects/{id}/listings`
4. Pagination truth test: request `limit=200`, `limit=201`, `page=0`, and a page
   past the end. Record exactly what the response metadata says (page vs offset,
   actual page size vs requested, has_more). Compare `total` against records
   actually retrieved by paging to exhaustion. Docs say `total` is exact — verify.
5. Filter/sort truth tests: for each documented filter (`locality`, `bhk`,
   `property_type`, `min_price`, `max_price`, `furnishing`, `project_id`) and each
   `sort_by`, make one filtered call and verify against the full dataset. Silently
   ignored params = `filters`/`sorting` findings. Note `bhk` may not be the real
   param name (schema field is `bedroom`).
6. Capture one real object from each endpoint. Diff its fields against the
   documented schema. Expect `is_live` (Q3 references it; docs don't) and possibly
   other drift. Every schema difference is a finding.

## Phase 1 — Full pull

- Page every collection endpoint (listings, rentals, projects) to exhaustion with
  NO filters, trusting per-page metadata, not `total`. ~150 requests total.
- Save each page raw to /data/raw/ with timestamp. All analysis runs offline on
  these files. Never re-read the API one record at a time.

## Phase 2 — Forensics (one script per question, each emits answer + evidence IDs)

- **Q1 total_listing_records**: count of the exhaustive pull. If ≠ `total`, that's
  a `pagination` or `completeness` finding.
- **Q3 active_listings**: count `is_live == true`. The presence of non-live records
  contradicts "inactive listings are excluded" → `completeness` finding.
- **Q2 unique_properties**: cluster records by (rounded lat/lon, apartment_name
  normalized, bedroom, floor, carpet_area). Expect cross-posting across `website`
  values with different listing_id prefixes. Inspect near-miss clusters manually —
  the dedupe rule that fits most of the data will miss a deliberate subset
  (slightly perturbed coords/areas). `duplicates` finding with up to 20 IDs.
- **Q4 corrupt_listing_ids**: impossibility checks — floor > total_floors,
  carpet_area > super_built_up_area, price ≤ 0, area ≤ 0, bathroom/bedroom
  absurdities, lat/lon outside the city bounding box, possession/posted dates that
  can't exist. Keep the rule list explicit; only include records that CANNOT exist,
  not merely weird ones. `data_quality` finding.
- **Q9 fake_listing_ids**: lead-gen fingerprints — one phone number across many
  listings (build a contact-frequency table first), prices far below locality
  median for the spec, templated/identical descriptions, round-number everything.
  Cross-check: fakes may also be the too-good outliers. `fraud` finding, evidence =
  the shared phone numbers + IDs.
- **Q6 avg_price_per_sqft_2bhk**: FIRST resolve units. Plot price/carpet_area
  distribution per `website` and per locality. A bimodal cluster ~10.7x apart =
  sqm vs sqft on a subset; ~100x = lakhs vs rupees. Convert, exclude Q4+Q9 IDs and
  non-live, then compute mean(price/area) to 2dp. Verify the residuals — the unit
  rule will have exceptions. `units` finding with evidence IDs.
- **Q8 listings_last_7_days**: decide what timezone `posted_at` is really in.
  Tests: health clock offset; posting-hour histogram (human posting activity peaks
  daytime local — if the `Z` timestamps peak 03:00–17:00 "UTC", they're IST
  mislabeled); any record with posted_at in the future relative to health clock.
  Then count in [2026-09-03T00:00 IST, 2026-09-10T00:00 IST). `timestamps` finding.
- **Q5 total_monthly_rent**: assigned-locality rentals, but check rent units first
  (annual vs monthly, deposit-in-months) via rent/deposit ratios and rent vs sale
  price sanity. Sum after correction.
- **Q7 costliest_project**: max price_max — after unit verification on projects
  (statement explicitly flags project prices/areas). Also sanity-check min ≤ max,
  min_area ≤ max_area (violations feed Q4-style findings under data_quality).
- **Q10 projects_with_wrong_listing_count**: group listings by project_id from the
  full pull, diff against each project's total_listings. Decide whether "listings"
  means all records or is_live records — test both, pick the one that makes MOST
  projects correct; the remainder is the answer. `consistency` finding.
- Cross-check `/v1/analytics/summary` numbers against computed values →
  `consistency` findings for each disagreement.

## Phase 3 — Frontend (thin, correct, defensive)

Stack: React + Vite (or Next). Deploy to Vercel. Don't gold-plate.

1. **Login**: real auth flow. Store token + issue-time; intercept 401 →
   transparent re-login (creds in memory/session) and retry. This is the
   30-minute requirement.
2. **Browse**: pull data via API but apply ALL filters client-side (server filters
   are proven unreliable in Phase 0). Pagination client-side over verified data.
3. **Detail page**: routed by listing_id. Handle the singular/plural path reality
   found in Phase 0. Render seller `description` as plain text — it's untrusted
   input (XSS-safe), and the statement hints at it.
4. **Favourites**: use the real path found in recon; verify persistence across
   reload + re-login per user.
5. **Rentals & projects**: display with CORRECTED units (apply the Phase 2 unit
   rules; show a badge like "area normalized from m²" where corrected).
6. **Insights screen**: analytics summary (corrected where it lies) + your
   discoveries as a human-readable dashboard: duplicate clusters, flagged
   fake/corrupt listings (visibly badged in the browse list too), unit
   corrections, timezone note. This is where forensics become UI — it's the
   highest-leverage screen for stage 2 review.

## Phase 4 — Findings & submission

- Convert findings.md into `findings` objects. Rules:
  - Only reproduced discrepancies. F1 punishes padding.
  - Evidence (≤20 IDs) required for any record-level claim.
  - Endpoint paths exactly per spec (`{id}` placeholder, `*` for global).
  - Expected categories to cover: auth (key transport, token TTL), pagination,
    units, filters, sorting, timestamps, duplicates, completeness (is_live),
    data_quality, fraud, consistency (project counts, analytics), missing_endpoint,
    undocumented_endpoint.
- README: how to run; the distrust methodology; **the checks that came back clean**
  (pull from findings.md — this section is explicitly graded and can't be
  generated); two-more-days section.
- Validate submission.json shape against the spec exactly. Answers use the
  post-correction data (units, Q4/Q9 exclusions for Q6).

## Guardrails

- Stay well under 1200 req/min; the full solution needs ~200 requests total.
- Read every error body — they're written to be informative.
- Never share the key; it goes in submission.json only (per spec).
- If something looks broken vs merely lying, email vivek@ivy.homes rather than
  guessing.
