# Working log — hypothesis, test, result

Kept in order. Negative results are kept deliberately: they are most of the
work, and the ones that came back clean are what stopped the findings list
from filling up with guesses.

City: **chennai** (city_id 4). Assigned locality: **velachery**.
Reference moment: `2026-09-10T00:00:00+05:30`, which `/health` and `/v1/me`
both state directly.

---

## Phase 0 — recon

### The very first call disagreed with the very first instruction

`GET /v1/listings?api_key=...` → `401 {"detail": "send your key in the X-API-Key
request header, not as a query parameter"}`.

That set the tone. The API answers in complete sentences when you get something
wrong, so from here on every probe reads the error body rather than just the
status. **Finding: auth.**

### Login

Documented response is `{token, token_type, expires_in: 86400, user:{email,name}}`.
Actual response is `{access_token, refresh_token, token_type, expires_in: 900,
refresh_url, user:{email}}`.

Four discrepancies in one body: the token field is named differently, the
lifetime is 96x shorter, there is a refresh flow the docs say does not exist,
and `user.name` is absent. The tokens are opaque, not JWTs, so `expires_in` is
the only claim available — and it is a claim, not a measurement.

**Hypothesis:** `expires_in: 900` is true and the documented 24 hours is not.
**Test:** hold one token, hit `/v1/listings` every 60 seconds, log the first 401.
**Result:** last 200 at **850s**, first 401 at **911s**, with the body
`access token expired - POST /auth/refresh with your refresh_token`. Then
refresh, and the new token works. **Findings: auth ×4.**

This is the whole "still working thirty minutes after you logged in"
requirement. It is not a long-token problem, it is a refresh problem.

### Endpoint sweep

Probed every documented path plus plausible variants.

| Documented | Reality |
| --- | --- |
| `/v1/listing/{id}` | 404 — the real one is `/v1/listings/{id}` |
| `/v1/listings/{id}/similar` | 404, both spellings |
| `/v1/favourites` | 404, and `/v1/favorites` too — it is `/v1/saved` |
| `/v1/analytics/summary` | 404, and every `/v1/analytics/*` variant |

Undocumented and alive: `/v1/saved`, `/v1/me`, `/v1/localities`, `/`,
`/llms.txt`, `/llms-full.txt`, `/sitemap.xml`, `/robots.txt`, `/humans.txt`.
**Findings: missing_endpoint ×4, undocumented_endpoint ×4.**

`/v1/saved` also takes a different request body from the documented one:
`{"listing_id": ...}`, not `{"id": ...}`, which 422s.

`/llms.txt` advertises a whole `/v2` surface. All of it 404s with
`there is no /v2; llms.txt announced it early`. **Finding: missing_endpoint.**

`robots.txt` disallows `/answers/`, `/ground-truth/` and `/hypotheses/`, with
comments saying there is nothing there. I did not request them. They are a
joke, but a Disallow is still a Disallow, and the comment in the file about
listing a path being the surest way to get it read is clearly aimed at whoever
reads it.

### Pagination

Documented: `page` (1-indexed) and `limit` (max 200), response
`{total, page, page_size, results}`, and "read `total`, divide by your `limit`,
and request that many pages."

Every part of that is wrong.

- Response is `{limit, offset, count, total, has_more, results}`.
- `page=1`, `page=2`, `page=0` all return **the same records** and echo
  `offset: 0`. Paging is by `offset`. Silently ignored, 200 every time.
- `limit=200` returns 50 records and echoes `limit: 50`. The cap is 50.
- **`offset=total` still returns a full window**, with `has_more: true`.

That last one is the important one. `total` is not the size of the collection.

**Test:** walk outward from `total` until `has_more` goes false, then page the
whole thing on `has_more`.
**Result:** 4100 listings (total says 3923), 1550 rentals (1483), 460 projects
(440). All ids unique within each pull; no record served twice.
**Findings: pagination ×4.**

Cross-check found later: the undocumented `/v1/localities` reports per-locality
counts that sum to exactly **4100** and match the pull for all ten localities.
Two endpoints of one service, and the undocumented one is the honest one.
**Finding: consistency.**

### Parameter contract

One call per documented parameter, checking the returned records against the
predicate rather than trusting the status code.

| Parameter | `/v1/listings` | `/v1/rentals` | `/v1/projects` |
| --- | --- | --- | --- |
| `locality` | works | works | works |
| `bhk` | works | works | — |
| `property_type` | works | — | — |
| `project_status` | — | — | works |
| `min_price` / `max_price` | **ignored** | — | — |
| `furnishing` | **ignored** | works | — |
| `project_id` | **ignored** | — | — |

An invented parameter (`totally_made_up_param=xyzzy`) is accepted just as
happily, so there is no way to distinguish a typo from a working filter except
by checking the records. Only `sort_by` validates its value (400).

Worth noting: `bhk` works even though the schema field is `bedroom`, and
`bedroom=2` is the one that gets ignored. The docs are right about `bhk`.
**Findings: filters ×4.**

---

## Phase 1 — the full pull

82 + 31 + 10 requests, walking on `has_more`. Everything after this is offline.
Total API usage for the whole assignment was around 460 requests against a
1200/minute limit, so the limit was never a consideration.

Schema diff of every field of every record against the documented objects:
`is_live` is the only undocumented field, on listings and rentals. Nothing
documented is missing. **Findings: completeness ×2** — the listings endpoint
claims inactive listings are "excluded server side" and returns 867 of them.

---

## Phase 2 — the things that do not live in any single response

### The sort order is an oracle

`sort_by=carpet_area&order=desc` returns `276, 2965, 2947, 2891…`. That looks
like a broken sort. It is not.

**Hypothesis:** the server sorts on the true stored value and serialises a
mixed-unit view. If so, the sorted pull is a ground-truth *ordering* of the real
numbers, and I can solve for each record's unit by asking which reading keeps
the sequence monotonic.

This turned out to be the single most useful idea in the assignment, because it
converts three unanswerable questions into arithmetic.

**Areas.** 276 m² = 2971 ft², which is exactly where it belongs. Solving the
whole 4100-record sorted pull — with intervals rather than points, because the
metre values are rounded — gives **337 records in square metres, every one of
them `website: magichomes`**. Independently, the raw values fall in two clean
bands with a gap at 276 → 292, and the threshold rule picks exactly the same
337. **Finding: units.**

**Project prices.** Sorted ascending, `price_max` walks 70.2 → 99.8, then drops
once to 1.01 and walks to 3.78. One descent, in both `price_min` and
`price_max`. That is the lakh/crore boundary: Indian property is quoted in lakh
below a crore and crore above it, and the API serialises it that way while the
docs say "rupees, integer, everywhere". Converting on that rule reproduces the
server's own order with **0 violations** in both fields. **Finding: units.**

The costliest project is therefore P40224 at ₹3.78 crore. Read as documented it
would be P40160 at 99.8 rupees.

**Timezone.** `sort_by=posted_at` has 1902 descents in 4100 records — but no
drop exceeds 24 hours, which says the sort key is a *date*. Which date?

| Bucket by | Records out of order |
| --- | --- |
| UTC date | 865 |
| **IST date** | **0** |
| offset +8 | 2033 |
| offset −5:30 | 1700 |

Zero out of 4100. The server buckets by the IST calendar date of the stored
instant, which is only consistent if the serialised `Z` values are **genuine
UTC**. If they were IST mislabelled as `Z`, bucketing by the value's own date
would be the clean one, and that is the 865 row. So `posted_at` is exactly what
the docs claim, and Q8 is a straight conversion. **Finding: sorting** (the sort
is date-granular, not instant-granular) — but **no timestamps finding**, because
on this point the documentation is right.

### Dead end: the posting-hour histogram

The obvious way to catch a mislabelled timezone is to look for the human daily
rhythm — people post flats in the daytime, so if the "UTC" hours peak at
03:00–17:00 they are really IST.

Both histograms are flat. 4100 listings spread 140–205 per hour in UTC and
145–200 in IST; 00:00–05:59 holds 1030 records where uniform would be 1025.
There is no rhythm to find in either frame, so the test cannot distinguish
them. I had the right hypothesis and the wrong instrument; the sort-order test
above is what actually settled it.

### Rentals: deposit

`deposit` has a minimum of 2. Deposit-to-rent ratio is cleanly bimodal: one
cluster at 0.0001–0.0007, one at exactly 2–10. The high cluster is whole
multiples of monthly rent, which is how Indian deposits are quoted. The low
cluster is 301 records, **all `zerobroker`**, carrying the month count itself.
**Finding: units.**

Checked and clean: `price` on rentals is genuinely the monthly rent in rupees.
The 2–10 month multiple on every other record confirms it, and 8,000–93,200 is
the right range for Chennai. No correction needed for Q5.

### Q4 — records that cannot exist

Explicit impossibility rules only; "unusual" is not "impossible".

| Class | Count |
| --- | --- |
| negative price | 9 |
| carpet_area > super_built_up_area | 9 |
| floor > total_floors | 9 |
| latitude/longitude transposed (record lands in the Bay of Bengal) | 9 |
| posted_at in the future, up to 2027-07-03 | 9 |
| zero bedrooms **and** zero bathrooms on an apartment or villa | 9 |
| price ≈ 1/1000 of any possible price (₹7–12/ft² vs a median of ₹9,671) | 9 |

**63 ids, no record in two classes.** Seven groups of exactly nine is not a
coincidence, so after finding the first five I went looking for the rest
deliberately: an automated detached-tail-cluster scan over every numeric field
and every derived ratio. It returned these seven and no eighth.

Rejected, because they are odd rather than impossible: `bedroom == 0` (138 of
the 147 are plots, which legitimately have none — the other 9 are the group
above), `total_floors == 0` (all plots), `floor == 0` (ground floor).

The ×1000 price group is worth a note: multiplying those 9 by 1000 lands them
at ₹7,015–11,572/ft², dead centre of the market. That is a unit error in shape.
I filed them under `data_quality` rather than `units` because, unlike the three
real unit findings, they do not follow a website — they are spread across all
five, which is the signature of the injected corruption, not of a site's
serialisation convention.

### Q9 — lead generation

**The unit of analysis is the phone number, not the listing.** 692 numbers over
4100 listings.

Test 1, price: score every listing against the median ₹/ft² for its locality
and bedroom count, take each number's median, sort. There is exactly one gap
worth the name, after the seventh number: **0.570 → 0.716**.

Test 2, implausible perfection: 60% of listings are verified and 79% are live.
A number with 8+ listings that are *all* both is not chance.

The two tests select **the same seven numbers**, 110 listings. Each posts 15–16
listings under 3–6 different seller names across 4–5 websites and 7–10
localities, at roughly half the going rate, all verified, all live.

Five numbers with 20–30 listings each are cleared by both tests — busy agents,
median ratio 0.98–1.09, mixed verified and live. The tests discriminate.

### Dead end: one name, three roles

332 phone numbers post as `agent`, `owner` **and** `builder` under a single
seller name — the same person claiming to be all three parties. That looks
exactly like a broker laundering their identity, and it covers 2,202 listings.

It is the norm. 680 of 692 numbers have exactly one name, and multi-role
posting is how the whole dataset is generated. Their prices sit at market. If I
had filed this the findings list would have been 2,202 records of noise. Not a
finding.

### Dead end: templated descriptions

Classic bait-listing tell: the same description copy-pasted across many
listings. There is exactly **one** repeated description in 4100. The
descriptions are individually generated. Dead.

### Q2 — distinct properties

The same flat is cross-posted across the five sites with everything a human
would retype jittered: price, seller, description, `posted_at`,
`super_built_up_area` and the coordinates all move, and `apartment_name` is
re-cased, re-spaced, hyphenated, or given a `Phase 1` / `Apartments` / `The`
affix.

Matching on a normalised name is the rule that fits most of the data. It misses
**313 of 836 clusters** — `Brigade-Sanctuary` vs `BRIGADE SANCTUARY`,
`sobha serenity` vs `Sobha Serenity Phase 1`. This is precisely the "the first
rule that fits will usually fit most of the data; look hard at what it gets
wrong" case in the brief.

So match on what a cross-post *cannot* change: bedroom, bathroom, balcony,
floor, total_floors, property_type, furnishing, facing, parking, carpet_area
within 2% — plus position. Pair distances cliff hard: **1161 matching pairs
under 150m and none at all between 150m and 500m.**

**Result: 4100 records describe 3116 properties.** 984 are re-posts.

Two things I had to check rather than assume:

- **`locality` carries no geography.** Every one of the ten localities spans the
  full 35 km × 35 km city box with the same centre. The labels are labels. So
  locality is not used for blocking — blocking on it would be blocking on
  nothing, and it is only by luck that it barely changes the answer.
- **Chance collisions are real.** With coordinates scattered over a 35 km box,
  ~490 pairs land within 150m of each other by accident. Three records formed a
  cluster on position and bedroom/floor/type/area alone but disagreed on
  balcony, furnishing, facing, parking and total_floors. Requiring the full
  physical signature drops it from 1163 links to 1161, and the two it drops are
  the coincidence.

### Q10 — project listing counts

Tested every reading of "how many listings a project has":

| Reading | Projects that agree |
| --- | --- |
| every record | 124 |
| **live records only** | **341** |
| excluding fakes | 118 |
| live, excluding fakes | 293 |
| live, excluding fakes and corrupt | 269 |
| distinct properties, live only | 336 |

"Live records" wins decisively, so the 119 that still disagree are a real
disagreement and not an artefact of my definition. **Finding: consistency.**

The documented cross-check — "it always agrees with what
`GET /v1/listings?project_id=...` returns" — cannot be run at all, because
`project_id` does not filter.

### `/llms.txt` versus the crawl

The file states, for Chennai: 3,916 records, 3,266 distinct, 3,000 live, 107
bad project counts, "counted from a full crawl on the reference date".

Measured: **4100 / 3116 / 3233 / 119**. Four for four wrong. The file also
admits it was generated from the same changelog by the same assistant and
"reviewed by the same nobody". **Finding: consistency.**

I did not fetch `/llms-full.txt` into context beyond saving it; it is 373 KB of
the same source and there is no reason to trust any figure in it.

---

## Checked and clean

Things I tested that turned out to match the documentation, or turned out not
to be there at all. These are not findings and are not in `submission.json`.

- **`posted_at` really is UTC with a `Z` suffix**, as documented — proven by the
  IST-date sort test above, not assumed.
- **`listing_id` really is globally unique** — 4100 distinct in 4100 records.
  Only the "one listing = one property" half of that sentence is false.
- **`bhk`, `locality`, `property_type`, `project_status` all filter correctly.**
- **`sort_by` = `price`, `bedroom`, `carpet_area` on listings, and `price_min`,
  `price_max`, `launch_date`, `total_units` on projects, all sort correctly.**
  `carpet_area` only *looks* broken; the disorder is the units, not the sort.
- **Rental `price` is the monthly rent in rupees**, as documented.
- **Rental and project areas are not mixed-unit.** Only listings are.
- **`min_area_sqft ≤ max_area_sqft` and `price_min ≤ price_max`** hold for all
  460 projects after unit conversion. Launch and possession dates are all valid
  ISO dates and possession never precedes launch.
- **The lowercase convention holds** for `locality`, `furnishing`,
  `property_type` and `project_status`.
- **`GET /v1/listings/{id}` returns a record byte-identical to the collection's.**
- **Paging is stable** — the same window requested twice returns the same ids in
  the same order.
- **`listing_url`, `listing_id` and `website` are mutually coherent** on all
  4100 records. No mismatched hosts, no id/url drift.
- **`posted_by_contact` is uniformly formatted** — every one is 13 characters,
  `+9120########`. No malformed numbers.
- **Rentals contain no impossible records.** Every Q4 rule fires on zero
  rentals. The corruption is confined to `/v1/listings`.
- **Saved listings are genuinely per-user and survive a re-login** — demo1 and
  demo2 do not see each other's lists.
- **No rate limiting encountered.** ~460 requests total against 1200/minute.
- **`/health` carrying `+05:30` is not a discrepancy** — the brief's own example
  says so, so it is not filed.
