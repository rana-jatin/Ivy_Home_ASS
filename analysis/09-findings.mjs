// Build the findings array. Every entry here was reproduced against the running
// API; the how_found line names the probe or analysis script that did it.
// Evidence ids are pulled from the analysis outputs, never hand-copied.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../probe/lib.mjs';
import { listings, rentals, projects, AREA_SQM_THRESHOLD, PRICE_LAKH_BAND_MIN } from './04-normalize.mjs';

const L = listings(), R = rentals(), P = projects();
const read = (f) => JSON.parse(readFileSync(join(ROOT, `analysis/${f}`), 'utf8'));
const corrupt = read('out-corrupt.json'), fraud = read('out-fraud.json'), dup = read('out-duplicates.json');
const take = (a, n = 20) => a.slice(0, n);

const F = [];
const add = (endpoint, category, documented, actual, how_found, impact, evidence = []) =>
  F.push({ endpoint, category, documented, actual, how_found, impact, evidence });

// ---------------------------------------------------------------- auth ----
add('*', 'auth',
  'every request must carry the API key as a query parameter, GET /v1/listings?api_key=IVY26-...',
  'the query parameter is rejected with 401 "send your key in the X-API-Key request header, not as a query parameter"; the key is only accepted in the X-API-Key header',
  'first call of the recon pass, probe/01-health-and-auth.mjs, tried the key as a query param, as X-API-Key, as Authorization and as a bearer value',
  'nothing works at all until this is fixed - every documented example fails with 401');

add('/auth/login', 'auth',
  'the response carries the session token as "token"',
  'the token field is "access_token"; the response also carries "refresh_token", "refresh_url" and "token_type"',
  'read the login response keys instead of assuming the documented shape, probe/01-health-and-auth.mjs',
  'a client written from the docs reads undefined and sends "Bearer undefined" on every subsequent request');

add('/auth/login', 'auth',
  'tokens are valid for 24 hours (expires_in 86400), so a single login is enough for one working session',
  'expires_in is 900 and the access token really does stop working at 15 minutes; polling an authed endpoint every 60s, the last 200 was at 850s and the first 401 at 911s',
  'probe/02-token-ttl-soak.mjs held one token and polled /v1/listings every 60 seconds until it broke',
  'an app built on the documented lifetime is dead 15 minutes after login, which is exactly the case the brief asks to survive for 30');

add('/auth/login', 'auth',
  'there is no refresh flow',
  'POST /auth/refresh exists, takes a refresh_token in the body and returns a fresh access token; the 401 body from an expired token names it',
  'probed /auth/refresh in the recon sweep and then used it at the end of the TTL soak to restore access',
  'the only supported way to keep a session alive past 15 minutes, and the docs say it does not exist');

add('/auth/logout', 'auth',
  'invalidates the current token server side',
  'returns 200 with a body saying tokens are stateless and should be discarded client side, and the same token keeps working afterwards',
  'probe/13-session-semantics.mjs called logout and then reused the token',
  'logging out does not end the session; a client that relies on server-side invalidation leaves a working token behind');

add('/auth/login', 'auth',
  'the user object carries an email and a name',
  'the user object carries only email; there is no name field',
  'compared the login response against the documented example, probe/01-health-and-auth.mjs',
  'minor - a UI that greets the user by name renders undefined');

// ---------------------------------------------------------- pagination ----
add('*', 'pagination',
  'every collection endpoint takes page (1-indexed) and limit',
  'page is accepted and silently ignored; paging is done with offset, which the response echoes back. page=1, page=2 and page=0 all return the same first window',
  'probe/06-pagination.mjs asked for page=2 and compared the returned ids and the echoed offset against page=1',
  'following the documented recipe returns page one forever - a client reads the same 20 records N times and believes it has read everything');

add('*', 'pagination',
  'collection responses are shaped total, page, page_size, results',
  'they are shaped limit, offset, count, total, has_more, results; there is no page or page_size field',
  'read one response body before writing the client, probe/03-endpoint-sweep.mjs',
  'a client written from the documented shape cannot find its own page size or tell whether more records remain');

add('*', 'pagination',
  'limit has a maximum of 200',
  'limit is clamped to 50; requesting 100, 200, 500 or 1000 all return 50 records and the response echoes limit=50. limit=0 and limit=-1 are 422',
  'probe/06-pagination.mjs walked the limit values and read the echoed limit rather than trusting the request',
  'harmless if you read the echo, wrong if you compute page counts from the limit you asked for');

add('*', 'pagination',
  'total is the exact number of records matching your filters; to fetch every record, read total, divide by your limit, and request that many pages',
  'total understates the collection. Paging on has_more to exhaustion yields 4100 listings against a total of 3923, 1550 rentals against 1483, and 460 projects against 440. Records continue to be served at offsets beyond total, with has_more still true',
  'probe/06-pagination.mjs requested offset=total and got a full window back; probe/07-find-the-end.mjs walked outward until has_more went false, and probe/08-full-pull.mjs paged each collection on has_more',
  'the documented recipe silently drops 177 listings, 67 rentals and 20 projects - 4.3% of the listing data - and every count computed from it is wrong');

// ----------------------------------------------------- missing endpoint ----
add('/v1/listing/{listing_id}', 'missing_endpoint',
  'GET /v1/listing/{listing_id} returns a single listing',
  '404. The singular path does not exist; single listings are served from GET /v1/listings/{listing_id}, which returns a record identical to the one in the collection',
  'probe/03-endpoint-sweep.mjs requested both spellings with a listing_id taken from a real response',
  'the detail page 404s until the path is corrected');

add('/v1/listings/{listing_id}/similar', 'missing_endpoint',
  'up to ten comparable listings - same locality, same bedroom count, price within 15%',
  '404 under both /v1/listings/{id}/similar and /v1/listing/{id}/similar. The endpoint does not exist at any spelling probed',
  'probe/03-endpoint-sweep.mjs',
  'a "you may also like" strip cannot be built from the API; it has to be computed client side');

add('/v1/favourites', 'missing_endpoint',
  'GET, POST and DELETE /v1/favourites/{id} let a logged-in user save listings',
  '404, and so is the American spelling /v1/favorites. Saved listings live at /v1/saved',
  'probe/03-endpoint-sweep.mjs tried both spellings plus /v1/saved-listings and /v1/users/me/favourites',
  'the saved-listings feature cannot be built from the documented path');

add('/v1/analytics/summary', 'missing_endpoint',
  'pre-computed aggregates for your city - total_listings, median_price, median_price_per_sqft, by_locality, by_bhk',
  '404. No /v1/analytics path exists; the sweep also tried /v1/analytics, /v1/analytics/localities, /v1/analytics/price-trends, /v1/analytics/overview and /v1/stats/summary',
  'probe/03-endpoint-sweep.mjs',
  'the insights screen the brief asks for has to be computed from the raw collections, and every number on it is the client own work');

add('/v2/listings', 'missing_endpoint',
  '/llms.txt, served by this same API, advertises a v2 surface: /v2/listings, /v2/listings/search, /v2/insights/summary and /v2/valuation/{listing_id}',
  'all of them 404, with a body that says there is no /v2 and that llms.txt announced it early',
  'probe/05-v2-and-aux.mjs followed every link in /llms.txt',
  'a second documentation file, served by the service itself, advertises four endpoints that were never built - including the analytics summary that the main reference also promises');

// ------------------------------------------------ undocumented endpoint ----
add('/v1/saved', 'undocumented_endpoint',
  'not documented; the reference describes /v1/favourites instead',
  'GET /v1/saved returns a count and full listing objects, POST /v1/saved creates with a listing_id body key and 201, DELETE /v1/saved/{listing_id} removes. The documented body key id is rejected 422 naming listing_id as the required field',
  'probe/04-undocumented.mjs walked the method and body shapes; probe/13-session-semantics.mjs confirmed the list is per user and survives a re-login',
  'this is the real saved-listings API, including a request body key that differs from the documented one');

add('/v1/me', 'undocumented_endpoint',
  'not documented',
  'returns the caller user, city_id, city, assigned_locality and reference_date',
  'probe/03-endpoint-sweep.mjs guessed it while sweeping for session endpoints',
  'it states the assigned locality and the reference date that are otherwise only supplied by email - worth reading instead of hard-coding them');

add('/v1/localities', 'undocumented_endpoint',
  'not documented',
  'returns the city and a per-locality listing_count for all ten localities of the key city',
  'probe/03-endpoint-sweep.mjs',
  'its counts are correct and sum to exactly 4100, so it is an independent check on a full pull - and it contradicts the total field on /v1/listings');

add('/', 'undocumented_endpoint',
  'not documented',
  'a service index returning service, version, docs, health, register and a for_agents pointer to /llms.txt, including a note that the reference was written against an older build and never reviewed',
  'probe/03-endpoint-sweep.mjs requested the root',
  'the API says in its own root response that its documentation is unreliable');

// ------------------------------------------------------------- filters ----
add('/v1/listings', 'filters',
  'min_price and max_price filter on price in rupees, inclusive',
  'both are accepted and silently ignored. min_price=20000000 returns total=3923, the unfiltered count, and the first record back is priced 6,610,000',
  'probe/09-params.mjs called each documented filter and checked the returned records against the predicate as well as watching total',
  'a price filter that appears to work - 200, plausible-looking results - but returns the whole collection. Price filtering has to be done client side');

add('/v1/listings', 'filters',
  'furnishing filters on unfurnished, semi-furnished or fully-furnished',
  'accepted and silently ignored on /v1/listings; total is unchanged and the first record back is semi-furnished when fully-furnished was asked for. The same parameter does work on /v1/rentals',
  'probe/09-params.mjs ran the same parameter against both endpoints',
  'the brief requires a furnishing filter that actually filters, so it has to be client side - and the inconsistency between the two endpoints is invisible from the docs');

add('/v1/listings', 'filters',
  'project_id selects a project listings - the projects section states that total_listings always agrees with what GET /v1/listings?project_id=... returns',
  'project_id is accepted and silently ignored; total is unchanged and the first record back belongs to a different project',
  'probe/09-params.mjs',
  'the documented way to cross-check a project listing count cannot be run at all');

add('/v1/listings', 'filters',
  'the documented parameter list is the accepted parameter list',
  'unknown query parameters are accepted silently with 200 and no effect - an invented parameter is as welcome as a real one. Only sort_by validates its value, with 400 on an unknown field',
  'probe/09-params.mjs sent a deliberately invented parameter alongside the real ones and compared totals',
  'there is no way to tell a typo, a wrong parameter name or an unimplemented filter from a working one except by checking the records that come back');

// ------------------------------------------------------------- sorting ----
add('*', 'sorting',
  'sort_by=posted_at orders by the posting timestamp',
  'it orders by the IST calendar date only. Within one date the order is arbitrary: a full sorted pull of 4100 listings has 1902 places where the next timestamp is earlier than the previous one, with drops of up to 23.45 hours and never more. Bucketing by IST date reproduces the server order with 0 violations in 4100; bucketing by UTC date gives 865',
  'probe/11-sorted-pulls.mjs pulled the whole collection in sort order and analysis/02-timestamps.mjs tested each candidate sort key against that order',
  'a newest-first list is only newest-day-first, so the first page is not the most recent listings. The same fact makes the sort order a reliable oracle for the IST date, which is what settled the timezone question');

// --------------------------------------------------------------- units ----
{
  const sqm = L.filter((r) => r.carpet_area < AREA_SQM_THRESHOLD);
  add('/v1/listings', 'units',
    'area is square feet, integer, everywhere in the API',
    `carpet_area and super_built_up_area are square metres on ${sqm.length} of 4100 records, all of them website=magichomes. Their values run 34..276 where every other record runs 292..2965, and multiplying by 10.7639 places each one exactly where the server own sort_by=carpet_area order says it belongs`,
    'sort_by=carpet_area looked broken - descending began 276, 2965, 2947. It is not broken: the server sorts on the true stored value while serialising a mixed-unit view, so analysis/01-units.mjs solved for the per-record unit that keeps the sorted pull monotonic, using intervals rather than points because the metre values are rounded',
    'every area-derived number is wrong by 10.76x on 8% of the collection: price per square foot, any area filter, and any sort the client does itself. It is a small enough share that a spot check passes and a mean does not',
    take(sqm.map((r) => r.listing_id)));
}
{
  const crore = P.filter((p) => p.price_max < PRICE_LAKH_BAND_MIN);
  add('/v1/projects', 'units',
    'price_min and price_max are in rupees, and money is Indian rupees, integer, everywhere in the API',
    'they are neither rupees nor integers. They are quoted the way Indian property is quoted - in lakh below a crore and in crore at or above it - so price_max 99.8 means 9,980,000 and price_max 1.01 means 10,100,000. Sorting by price_max ascending walks 70.2 up to 99.8 and then restarts at 1.01 and walks up to 3.78',
    'the single descent in each sorted pull marks the lakh/crore boundary; analysis/01-units.mjs splits there and confirms the converted values are monotonic in the server own order with 0 violations for both price_min and price_max',
    'reading the field as documented understates every project price by a factor of ten million or one hundred thousand, and picks the wrong costliest project - the raw maximum, 99.8, is a 9,980,000 project while the real maximum is 3.78 crore',
    take(crore.map((p) => p.project_id)));
}
{
  const months = R.filter((r) => r.deposit_unit_corrected);
  add('/v1/rentals', 'units',
    'deposit is the security deposit in rupees',
    `on ${months.length} of 1550 records, all of them website=zerobroker, deposit is a number of months rent instead - whole values from 2 to 10. Every other record has a deposit that is an exact 2x to 10x multiple of price, so the two populations are the same quantity in different units`,
    'the deposit-to-price ratio is cleanly bimodal - a cluster at 0.0001 to 0.0007 and a cluster at exactly 2 to 10 - and the low cluster is entirely one website',
    'a deposit rendered as documented reads as 5 rupees against a 32,500 rupee rent. Any deposit total or deposit-to-rent ratio over the collection is wrong',
    take(months.map((r) => r.listing_id)));
}

// -------------------------------------------------------- completeness ----
{
  const dead = L.filter((r) => !r.is_live);
  add('/v1/listings', 'completeness',
    'returns active sale listings; inactive, expired and withdrawn listings are excluded server side, so anything this endpoint returns is safe to show to a user',
    `every record carries an undocumented is_live field and ${dead.length} of 4100 have it false. They are returned with no filter applied, and there is no parameter that excludes them - is_live=true is accepted and ignored like every other unknown parameter`,
    'analysis/00-schema-diff.mjs diffed every field of every record against the documented object and found is_live as the only addition; probe/09-params.mjs then confirmed it cannot be filtered on',
    'the endpoint is not safe to show to a user as the docs claim, and any count of active listings taken from it is 867 too high unless the client filters on a field the docs do not mention',
    take(dead.map((r) => r.listing_id)));
}
{
  const dead = R.filter((r) => !r.is_live);
  add('/v1/rentals', 'completeness',
    'the documented rental object has no is_live field and nothing is said about inactive rentals',
    `rentals carry the same undocumented is_live field and ${dead.length} of 1550 are false`,
    'analysis/00-schema-diff.mjs',
    'same trap as on listings: a rentals list built from the docs shows 258 records that are not live',
    take(dead.map((r) => r.listing_id)));
}

// ---------------------------------------------------------- duplicates ----
add('/v1/listings', 'duplicates',
  'every listing_id is globally unique, and each listing corresponds to exactly one physical property',
  `the first half is true - 4100 distinct ids in 4100 records. The second is not: those records describe ${dup.distinct_properties} properties, so ${dup.duplicate_records} of them re-post a flat that is already listed. Cross-posts are spread across the five websites with price, seller, description, posted_at, super_built_up_area and coordinates all jittered, and apartment_name re-cased, hyphenated or suffixed Phase 1`,
  'matched on what a cross-post cannot change - bedroom, bathroom, balcony, floor, total_floors, property_type, furnishing, facing, parking and carpet_area within 2% - plus position. Pair distances cliff at 150m: 1161 matching pairs below it and none at all between 150m and 500m',
  'a user browsing the list sees the same flat several times at different prices from different sellers, and any per-property statistic is inflated by a quarter',
  dup.evidence_ids.slice(0, 20));

// -------------------------------------------------------- data quality ----
add('/v1/listings', 'data_quality',
  'listings are real records, and is_verified means the operations team has checked the listing',
  `${corrupt.ids.length} records describe something that cannot exist, in seven classes of exactly nine records each with no record in two classes: negative price, carpet_area larger than super_built_up_area, floor above total_floors, latitude and longitude transposed so the record sits out in the Bay of Bengal, posted_at dated into the future as far as 2027-07-03, zero bedrooms and zero bathrooms on an apartment or a villa, and a price about a thousandth of any possible price - 7 to 12 rupees per square foot against a market median of 9,671`,
  'explicit impossibility rules in analysis/05-corrupt.mjs, then an automated detached-tail-cluster scan over every numeric field and derived ratio to check that no eighth class was missed. Rules that only found unusual records - bedroom 0 on a plot, floor 0, total_floors 0 on a plot - were tested and rejected',
  'these render as ordinary listings - a negative price, a flat on floor 35 of a 31-storey building, a pin in the sea - and they poison any mean taken over the collection',
  take(corrupt.ids));

// --------------------------------------------------------------- fraud ----
add('/v1/listings', 'fraud',
  'posted_by_contact is the seller verified contact number, and is_verified means the operations team has checked the listing',
  `${fraud.ids.length} listings across ${fraud.contacts.length} phone numbers exist to generate enquiries. Each number posts 15 or 16 listings under 3 to 6 different seller names, across 4 or 5 websites and 7 to 10 localities, priced at about half the going rate for that locality and bedroom count - and every single one is both is_verified and is_live`,
  'the phone number is the unit of analysis, not the listing. Sorting numbers by median price against the locality-and-bedroom market rate leaves exactly one gap worth the name, after the seventh number: 0.570 to 0.716. A second, independent test - being all-verified and all-live with 8 or more listings, against base rates of 60% and 79% - selects the same seven numbers. Busy agents with 20 to 30 listings each are cleared by both tests',
  'the cheapest listings in every locality are bait, so a price-sorted browse leads with them and a price-per-square-foot average that includes them is dragged down. is_verified does not mean what the docs say it means',
  fraud.contacts.concat(take(fraud.ids, 13)));

// --------------------------------------------------------- consistency ----
{
  const liveByProject = {};
  for (const r of L) if (r.project_id && r.is_live) liveByProject[r.project_id] = (liveByProject[r.project_id] ?? 0) + 1;
  const wrong = P.filter((p) => (liveByProject[p.project_id] ?? 0) !== p.total_listings);
  add('/v1/projects', 'consistency',
    'total_listings is recomputed whenever a listing is added or withdrawn, so it always agrees with what GET /v1/listings?project_id=... returns',
    `it disagrees for ${wrong.length} of 460 projects. Counting live listings per project is the reading that fits best, making ${P.length - wrong.length} projects agree; counting every record makes only 124 agree. So the remainder is a real disagreement and not a choice of definition. The documented cross-check cannot be run in any case, because project_id does not filter`,
    'analysis/08-answers.mjs grouped the full pull by project_id and tested every reading of listings - all records, live only, excluding fakes, excluding corrupt, and distinct properties after de-duplication - against the reported number',
    'a project page that prints total_listings next to the listings it can actually show contradicts itself on a quarter of projects',
    take(wrong.map((p) => p.project_id)));
}

add('/v1/listings', 'consistency',
  'total is the exact number of records matching your filters',
  'the undocumented /v1/localities reports a per-locality listing_count over the same city and the same data. Those counts are right - they match an exhaustive pull for all ten localities - and they sum to 4100, against the 3923 that /v1/listings reports as its total',
  'compared /v1/localities against the exhaustive pull in analysis/08-answers.mjs, after probe/07-find-the-end.mjs showed that total was short',
  'two endpoints of one service disagree about how much data the service holds, and the undocumented one is the one telling the truth',
  ['velachery', 'guindy', 'omr', 'anna nagar', 'thoraipakkam']);

add('/llms.txt', 'consistency',
  'a second documentation file served by this API states, for Chennai, 3,916 listing records, 3,266 distinct properties, 3,000 live listings and 107 projects whose listing count is off, counted from a full crawl on the reference date',
  `an actual full crawl on this key gives 4100 records, ${dup.distinct_properties} distinct properties, ${L.filter((r) => r.is_live).length} live listings and 119 projects whose count is off. All four figures are wrong`,
  'pulled every collection to exhaustion and compared, analysis/08-answers.mjs. The file itself admits it was generated from the same changelog by the same assistant and reviewed by the same nobody',
  'an agent that reads llms.txt to save itself a crawl - which is what the file is for - gets four wrong numbers and no warning',
  ['velachery', 'guindy', 'omr']);

writeFileSync(join(ROOT, 'analysis/out-findings.json'), JSON.stringify(F, null, 2));
const byCat = F.reduce((a, f) => { a[f.category] = (a[f.category] ?? 0) + 1; return a; }, {});
console.log(`${F.length} findings`);
console.log(JSON.stringify(byCat, null, 2));
const recordLevel = ['units', 'duplicates', 'completeness', 'data_quality', 'fraud', 'consistency'];
console.log('record-level findings with no evidence:', F.filter((f) => recordLevel.includes(f.category) && f.evidence.length === 0).length);
console.log('evidence lists over 20:', F.filter((f) => f.evidence.length > 20).length);
const cats = new Set(['auth', 'pagination', 'units', 'filters', 'sorting', 'timestamps', 'duplicates', 'completeness', 'data_quality', 'fraud', 'consistency', 'missing_endpoint', 'undocumented_endpoint']);
console.log('invalid categories:', F.filter((f) => !cats.has(f.category)).map((f) => f.category));
console.log('wrote analysis/out-findings.json');
