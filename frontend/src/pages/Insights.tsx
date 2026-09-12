// The screen /v1/analytics/summary was supposed to provide, computed locally
// because that endpoint 404s - plus everything the data turned out to be
// hiding, which is the part a user would actually want to know.
//
// Every figure in the prose is computed from the pull too. A sentence that
// quotes a number typed in by hand stops being true the moment the data moves,
// and nothing would say so.
//
// Two halves: the market, for someone looking for a flat, and whether the data
// can be trusted, for someone deciding how much to believe the first half.
// Figures link to the records behind them.

import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDataset } from '../api/store';
import ContactScatter from '../components/charts/ContactScatter';
import LocalityMultiples, { KM_PER_DEG_LAT, KM_PER_DEG_LON } from '../components/charts/LocalityMultiples';
import DataPending from '../components/DataPending';
import Pager, { paginate } from '../components/Pager';
import { OFFLINE_SORT_TEST, REFERENCE, inr, inrShort, type FixedListing } from '../lib/corrections';
import { AREA_TOL, RADIUS_M, corruptSummary } from '../lib/flags';
import { useQueryState } from '../lib/query';
import { addressedToTools } from '../lib/sellerText';
import { useTitle } from '../lib/useTitle';

const DUP_PER_PAGE = 10;

const fmt = (n: number) => n.toLocaleString('en-IN');
const rate = (n: number) => `₹${fmt(Math.round(n))}`;
const listingsLink = (params: Record<string, string>) => `/listings?${new URLSearchParams(params)}`;

function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** "15–16", or just "16" when every value is the same. */
function span(xs: number[], f: (n: number) => string = String) {
  if (!xs.length) return '—';
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`;
}

function extent(rs: FixedListing[]) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity, sumLat = 0, sumLon = 0;
  for (const r of rs) {
    minLat = Math.min(minLat, r.latitude_fixed);
    maxLat = Math.max(maxLat, r.latitude_fixed);
    minLon = Math.min(minLon, r.longitude_fixed);
    maxLon = Math.max(maxLon, r.longitude_fixed);
    sumLat += r.latitude_fixed;
    sumLon += r.longitude_fixed;
  }
  return {
    eastWest: (maxLon - minLon) * KM_PER_DEG_LON,
    northSouth: (maxLat - minLat) * KM_PER_DEG_LAT,
    lat: sumLat / rs.length,
    lon: sumLon / rs.length,
  };
}

function Kpi({ k, v, n, to }: { k: string; v: string; n?: ReactNode; to?: string }) {
  const body = (
    <>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {n && <div className="n">{n}</div>}
    </>
  );
  return to ? <Link className="kpi link" to={to}>{body}</Link> : <div className="kpi">{body}</div>;
}

export default function Insights() {
  useTitle('Insights');
  const data = useDataset();
  const { get, set } = useQueryState();
  const dupQuery = get('dup_q');
  const dupPage = Math.max(1, Number(get('dup_page', '1')) || 1);

  const stats = useMemo(() => {
    if (!data) return null;
    const { listings, rentals, projects, flags, listingById } = data;
    const live = listings.filter((r) => r.is_live);
    const sound = (r: FixedListing) =>
      r.is_live && !flags.corrupt.has(r.listing_id) && !flags.fakeIds.has(r.listing_id);
    const clean = listings.filter(sound);

    const byLocality = [...new Set(listings.map((r) => r.locality))]
      .map((locality) => {
        const all = listings.filter((r) => r.locality === locality);
        const ok = clean.filter((r) => r.locality === locality);
        return {
          locality,
          count: all.length,
          live: all.filter((r) => r.is_live).length,
          medianPrice: median(ok.map((r) => r.price)),
          medianPps: median(ok.map((r) => r.price_per_sqft)),
          flagged: all.length - ok.length,
        };
      })
      .sort((a, b) => b.count - a.count);

    const byBhk = [...new Set(listings.map((r) => r.bedroom))]
      .sort((a, b) => a - b)
      .map((bedroom) => ({
        bedroom,
        count: listings.filter((r) => r.bedroom === bedroom).length,
        medianPrice: median(clean.filter((r) => r.bedroom === bedroom).map((r) => r.price)),
        plots: listings.filter((r) => r.bedroom === bedroom && r.property_type === 'plot').length,
      }));

    const city = extent(listings);
    const places = [...new Set(listings.map((r) => r.locality))].map((l) => ({
      locality: l,
      count: listings.filter((r) => r.locality === l).length,
      ...extent(listings.filter((r) => r.locality === l)),
    }));
    let centreSpread = 0;
    for (const a of places) {
      for (const b of places) {
        centreSpread = Math.max(centreSpread, Math.hypot((a.lat - b.lat) * KM_PER_DEG_LAT, (a.lon - b.lon) * KM_PER_DEG_LON));
      }
    }
    const geography = {
      places: places.sort((a, b) => a.locality.localeCompare(b.locality)),
      city,
      narrowestEastWest: Math.min(...places.map((p) => p.eastWest)),
      narrowestNorthSouth: Math.min(...places.map((p) => p.northSouth)),
      centreSpread,
    };

    const from = new Date(REFERENCE.getTime() - 7 * 864e5);
    const lastWeek = listings.filter((r) => {
      const t = new Date(r.posted_at);
      return t >= from && t < REFERENCE;
    }).length;

    const wrongProjects = projects.filter((p) => (data.liveListingCount.get(p.project_id) ?? 0) !== p.total_listings);

    const corrupt = corruptSummary(flags.corrupt);
    const corruptClasses = `${corrupt.classes} classes, ${
      corrupt.eachSize !== null ? corrupt.eachSize : `${corrupt.minSize}–${corrupt.maxSize}`
    } records each`;

    const areaFixed = listings.filter((r) => r.area_unit_corrected);
    const areaSites = [...new Set(areaFixed.map((r) => r.website))].sort();
    const depositFixed = rentals.filter((r) => r.deposit_unit_corrected);
    const depositSites = [...new Set(depositFixed.map((r) => r.website))].sort();
    // On every record that quotes the deposit in rupees, how many months of rent it is.
    const depositMultiples = rentals
      .filter((r) => !r.deposit_unit_corrected && r.price > 0)
      .map((r) => r.deposit / r.price);
    const croreProjects = projects.filter((p) => p.price_unit_max === 'crore');
    const costliest = [...projects].sort((a, b) => b.price_max_inr - a.price_max_inr)[0];
    const myLocality = data.me?.assigned_locality;
    const myRentals = myLocality ? rentals.filter((r) => r.locality === myLocality) : [];

    const fakeProfiles = [...flags.fakeProfiles.entries()];
    const respelled = flags.clusters.filter(
      (g) => new Set(g.map((id) => listingById.get(id)?.apartment_name)).size > 1,
    ).length;
    // Biggest first: the properties re-posted most are the clearest examples.
    const clusters = [...flags.clusters].sort((a, b) => b.length - a.length);

    const toolText = [
      ...listings.flatMap((r) => {
        const t = addressedToTools(r.description);
        return t ? [{ id: r.listing_id, kind: 'listing', where: 'description', text: t.addressed, to: `/listings/${encodeURIComponent(r.listing_id)}` }] : [];
      }),
      ...rentals.flatMap((r) => {
        const inDescription = addressedToTools(r.description);
        const t = inDescription ?? addressedToTools(r.title);
        return t ? [{ id: r.listing_id, kind: 'rental', where: inDescription ? 'description' : 'title', text: t.addressed, to: null }] : [];
      }),
      ...projects.flatMap((p) => {
        const t = p.amenities.map((a) => addressedToTools(a)).find(Boolean);
        return t ? [{ id: p.project_id, kind: 'project', where: 'amenities', text: t.addressed, to: `/projects/${encodeURIComponent(p.project_id)}` }] : [];
      }),
    ];

    const notLive = listings.length - live.length;
    const hidden = listings.length - clean.length;

    return {
      live, clean, byLocality, byBhk, geography, lastWeek, wrongProjects, corrupt, corruptClasses,
      areaFixed, areaSites, depositFixed, depositSites, depositMultiples, croreProjects, costliest,
      myLocality, myRentals, fakeProfiles, respelled, clusters, toolText, notLive, hidden,
      medianPrice: median(clean.map((r) => r.price)),
      medianPps: median(clean.map((r) => r.price_per_sqft)),
      avg2bhk:
        clean.filter((r) => r.bedroom === 2).reduce((a, r) => a + r.price_per_sqft, 0) /
        Math.max(1, clean.filter((r) => r.bedroom === 2).length),
    };
  }, [data]);

  if (!data || !stats) return <DataPending />;
  const { flags, declaredTotals } = data;
  const maxPps = Math.max(...stats.byLocality.map((l) => l.medianPps));
  const hiddenParts = stats.notLive + flags.corrupt.size + flags.fakeIds.size;

  const needle = dupQuery.trim().toLowerCase();
  const matchingClusters = needle
    ? stats.clusters.filter((g) =>
        g.some((id) => id.toLowerCase().includes(needle) || data.listingById.get(id)?.apartment_name.toLowerCase().includes(needle)))
    : stats.clusters;
  const dup = paginate(matchingClusters, dupPage, DUP_PER_PAGE);

  return (
    <main className="insights">
      <h1>Insights</h1>
      <p className="sub">
        Everything <span className="mono">/v1/analytics/summary</span> promised — that endpoint
        returns 404 — computed from a complete local pull, plus what the data turned out to be
        hiding. Every number here is computed in the browser from that pull, except the timestamp
        test in the notes at the bottom, which needs the server&apos;s own sort order and is quoted
        from the offline analysis.
      </p>

      <nav className="toc" aria-label="On this screen">
        <a href="#market">The market</a>
        <a href="#trust">Can you trust this data?</a>
        <a href="#impossible">Impossible records</a>
        <a href="#leadgen">Lead generation</a>
        <a href="#duplicates">Duplicates</a>
        <a href="#ai-text">Text aimed at AI tools</a>
        <a href="#geography">Locality</a>
      </nav>

      <section className="card brief">
        <h2>In brief</h2>
        <ul>
          <li>
            <strong>{fmt(data.listings.length)} records, {fmt(flags.distinctProperties)} properties.</strong>{' '}
            {fmt(data.listings.length - flags.distinctProperties)} records are a flat already listed,
            posted again - {fmt(stats.respelled)} of the {fmt(flags.clusters.length)} re-posted
            properties under more than one spelling of their name.
          </li>
          <li>
            <strong>{fmt(stats.hidden)} records are hidden when browsing, by default.</strong>{' '}
            {fmt(stats.notLive)} are not live, {flags.corrupt.size} describe something impossible and{' '}
            {flags.fakeIds.size} exist to collect enquiries
            {hiddenParts > stats.hidden ? ' (some are more than one of these)' : ''}. One click shows them.
          </li>
          <li>
            <strong>Three fields arrive in undocumented units.</strong>{' '}
            {fmt(stats.areaFixed.length)} listing areas in m², {fmt(stats.depositFixed.length)} rental
            deposits in months of rent, and all {data.projects.length} project prices in lakh or crore.
            Every figure in this app is converted.
          </li>
          {stats.toolText.length > 0 && (
            <li>
              <strong>{stats.toolText.length} records talk to AI tools instead of to buyers.</strong>{' '}
              Seller-written text telling automated tools what to submit. It is shown, marked, and
              ignored.
            </li>
          )}
        </ul>
      </section>

      {/* ------------------------------------------------------------ market */}
      <h2 className="part" id="market">The market</h2>

      <div className="kpis">
        <Kpi k="Listing records" v={fmt(data.listings.length)}
          n={`the endpoint reports total: ${fmt(declaredTotals.listings)}`} />
        <Kpi k="Distinct properties" v={fmt(flags.distinctProperties)} to={listingsLink({ quality: 'all', dedupe: '1' })}
          n={`${fmt(data.listings.length - flags.distinctProperties)} records are re-posts`} />
        <Kpi k="Live listings" v={fmt(stats.live.length)} to={listingsLink({ quality: 'all', flag: 'inactive' })}
          n={`${fmt(stats.notLive)} returned despite being inactive`} />
        <Kpi k="Median price" v={inrShort(stats.medianPrice)} n="live, genuine records only" />
        <Kpi k="Median ₹/ft²" v={rate(stats.medianPps)} n="carpet area, units corrected" />
        <Kpi k="Posted in the 7 days to the reference" v={fmt(stats.lastWeek)}
          n="IST window, from genuinely-UTC timestamps" />
      </div>

      {stats.myLocality && (
        <>
          <h2>Your locality — {stats.myLocality}</h2>
          <div className="kpis">
            <Kpi k="Rental records" v={String(stats.myRentals.length)}
              to={`/rentals?${new URLSearchParams({ locality: stats.myLocality })}`} />
            <Kpi k="Combined monthly rent"
              v={inr(stats.myRentals.reduce((a, r) => a + r.price, 0))}
              n={`city-wide, every deposit quoted in rupees is ${span(stats.depositMultiples, (x) => String(Math.round(x * 10) / 10))}× the price, so price is the monthly rent`} />
            <Kpi k="Median rent" v={inr(median(stats.myRentals.map((r) => r.price)))} />
          </div>
        </>
      )}

      <h2 id="by-locality">By locality</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Locality</th><th className="num">Records</th><th className="num">Live</th>
              <th className="num">Flagged</th><th className="num">Median price</th><th>Median ₹/ft²</th>
            </tr>
          </thead>
          <tbody>
            {stats.byLocality.map((l) => (
              <tr key={l.locality}>
                <td><Link to={listingsLink({ locality: l.locality })}>{l.locality}</Link></td>
                <td className="num">{fmt(l.count)}</td>
                <td className="num">{fmt(l.live)}</td>
                <td className="num">{fmt(l.flagged)}</td>
                <td className="num">{inrShort(l.medianPrice)}</td>
                <td>
                  <div className="barcell" title={`${l.locality}: median ${rate(l.medianPps)} per ft²`}>
                    <div className="hbar"><i style={{ width: `${(l.medianPps / maxPps) * 100}%` }} /></div>
                    <span className="num">{rate(l.medianPps)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="by-bhk">By bedroom count</h2>
      <div className="scroll">
        <table>
          <thead><tr><th>Configuration</th><th className="num">Records</th><th className="num">Median price</th></tr></thead>
          <tbody>
            {stats.byBhk.map((b) => (
              <tr key={b.bedroom}>
                <td>
                  <Link to={listingsLink({ bedroom: String(b.bedroom) })}>{b.bedroom} BHK</Link>
                  {b.plots > 0 ? ` (${b.plots} plots)` : ''}
                </td>
                <td className="num">{fmt(b.count)}</td>
                <td className="num">{b.medianPrice ? inrShort(b.medianPrice) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        Mean ₹/ft² for live 2 BHK listings, excluding impossible and lead-generation records:{' '}
        <strong>₹{stats.avg2bhk.toFixed(2)}</strong>.
      </p>

      {/* ------------------------------------------------------------- trust */}
      <h2 className="part" id="trust">Can you trust this data?</h2>

      <h2>What the summary endpoint was documented to return</h2>
      <p className="sub">
        The reference shows an example response for <span className="mono">GET /v1/analytics/summary</span>.
        The path returns 404, so each field is computed here instead.
      </p>
      <div className="scroll">
        <table>
          <thead><tr><th>Field</th><th>The reference&apos;s example</th><th>Computed from the pull</th></tr></thead>
          <tbody>
            <tr>
              <td className="mono">city</td><td className="mono">&quot;bangalore&quot;</td>
              <td>{data.me?.city ?? 'chennai'} — the city this key is scoped to</td>
            </tr>
            <tr>
              <td className="mono">total_listings</td><td className="mono">1240</td>
              <td>
                {fmt(data.listings.length)} records describing {fmt(flags.distinctProperties)} properties; the
                listings endpoint&apos;s own <span className="mono">total</span> says {fmt(declaredTotals.listings)}
              </td>
            </tr>
            <tr>
              <td className="mono">median_price</td><td className="mono">11200000</td>
              <td>{inr(stats.medianPrice)}, over live, genuine records</td>
            </tr>
            <tr>
              <td className="mono">median_price_per_sqft</td><td className="mono">8100</td>
              <td>{rate(stats.medianPps)}, with the {fmt(stats.areaFixed.length)} areas served in m² converted</td>
            </tr>
            <tr>
              <td className="mono">by_locality</td><td className="mono">[{'{'} locality, count, median_price {'}'}]</td>
              <td>{stats.byLocality.length} localities — <a href="#by-locality">the table above</a></td>
            </tr>
            <tr>
              <td className="mono">by_bhk</td><td className="mono">[{'{'} bedroom, count {'}'}]</td>
              <td>{stats.byBhk.length} bedroom counts — <a href="#by-bhk">the table above</a></td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>What the documentation got wrong, in numbers</h2>
      <div className="kpis">
        <Kpi k="Records past the reported total" v={`+${data.listings.length - declaredTotals.listings}`}
          n="paging on has_more, not on total" />
        <Kpi k="Areas served in m²" v={fmt(stats.areaFixed.length)} to={listingsLink({ quality: 'all', flag: 'area_fixed' })}
          n={`served by ${stats.areaSites.join(', ')}; documented as square feet everywhere`} />
        <Kpi k="Deposits served in months" v={fmt(stats.depositFixed.length)} to="/rentals?deposit=months"
          n={`served by ${stats.depositSites.join(', ')}; documented as rupees`} />
        <Kpi k="Project prices in lakh/crore" v={`${data.projects.length}`} to="/projects"
          n={`${stats.croreProjects.length} quoted in crore; documented as rupees`} />
        <Kpi k="Impossible records" v={String(flags.corrupt.size)} to={listingsLink({ quality: 'all', flag: 'corrupt' })}
          n={stats.corruptClasses} />
        <Kpi k="Lead-generation listings" v={String(flags.fakeIds.size)} to={listingsLink({ quality: 'all', flag: 'fake' })}
          n={`across ${flags.fakeContacts.size} phone numbers`} />
        <Kpi k="Projects miscounting listings" v={String(stats.wrongProjects.length)} to="/projects?only=wrong"
          n={`of ${data.projects.length}; documented as always agreeing`} />
        <Kpi k="Costliest project" v={inrShort(stats.costliest.price_max_inr)}
          to={`/projects/${encodeURIComponent(stats.costliest.project_id)}`}
          n={`${stats.costliest.apartment_name} · served as ${stats.costliest.price_max}`} />
      </div>

      <h2 id="impossible">Records that cannot exist</h2>
      <p className="sub">
        {stats.corruptClasses},{' '}
        {stats.corrupt.overlap === 0
          ? 'no record in two of them'
          : `${stats.corrupt.overlap} records in more than one`}
        . Rules that only found unusual records — a plot with no bedrooms, a ground floor — were
        rejected.
      </p>
      <div className="scroll">
        <table>
          <thead><tr><th>Impossibility</th><th className="num">Records</th></tr></thead>
          <tbody>
            {[...stats.corrupt.byReason.entries()].sort((a, b) => b[1] - a[1]).map(([reason, n]) => (
              <tr key={reason}>
                <td><Link to={listingsLink({ quality: 'all', flag: 'corrupt', reason })}>{reason}</Link></td>
                <td className="num">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        <Link to="/listings?quality=flagged">Browse every flagged record →</Link>
      </p>

      <h2 id="leadgen">Lead generation</h2>
      <p className="sub">
        The phone number is the unit of analysis, not the listing. These{' '}
        {stats.fakeProfiles.length} numbers each post{' '}
        {span(stats.fakeProfiles.map(([, p]) => p.listings))} listings under{' '}
        {span(stats.fakeProfiles.map(([, p]) => p.names))} seller names, across{' '}
        {span(stats.fakeProfiles.map(([, p]) => p.websites))} websites and{' '}
        {span(stats.fakeProfiles.map(([, p]) => p.localities))} localities, at{' '}
        {span(stats.fakeProfiles.map(([, p]) => Math.round(p.ratio * 100)))}% of the median price per
        ft² for the locality and bedroom count —{' '}
        {stats.fakeProfiles.every(([, p]) => p.allVerifiedLive)
          ? 'and every listing on them is marked verified and live.'
          : `and ${stats.fakeProfiles.filter(([, p]) => p.allVerifiedLive).length} of them have every listing marked verified and live.`}
      </p>
      <div className="card">
        <ContactScatter scores={flags.contactScores} flagged={flags.fakeContacts} />
        <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
          Each dot is one of {fmt(flags.contactScores.length)} phone numbers. Being cheap is not enough
          to be flagged, and neither is being busy: a number must be both far below the market and
          implausibly perfect across eight or more listings.
        </p>
      </div>
      <div className="scroll" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>Phone number</th><th className="num">Listings</th><th className="num">Seller names</th>
              <th className="num">Websites</th><th className="num">Localities</th><th className="num">Median vs market</th>
            </tr>
          </thead>
          <tbody>
            {stats.fakeProfiles.map(([contact, p]) => (
              <tr key={contact}>
                <td><Link className="mono" to={listingsLink({ quality: 'all', contact })}>{contact}</Link></td>
                <td className="num">{p.listings}</td>
                <td className="num">{p.names}</td>
                <td className="num">{p.websites}</td>
                <td className="num">{p.localities}</td>
                <td className="num">{Math.round(p.ratio * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="duplicates">The same flat, listed more than once</h2>
      <p className="sub">
        {fmt(flags.clusters.length)} properties appear more than once. Copies
        are matched on the physical signature, a carpet area within {AREA_TOL * 100}% and a
        position within {RADIUS_M} m, not on the name: {fmt(stats.respelled)} of
        those {fmt(flags.clusters.length)} properties carry more than one
        spelling of it between sites.
      </p>
      <div className="dupbar">
        <input
          type="search"
          aria-label="Search re-posted properties by name or listing id"
          placeholder="Search by name or listing id"
          value={dupQuery}
          onChange={(e) => set({ dup_q: e.target.value, dup_page: '' }, { replace: true })}
        />
        <span className="muted" style={{ fontSize: 13 }}>
          {needle ? `${fmt(matchingClusters.length)} of ${fmt(stats.clusters.length)} properties` : 'most-reposted first'}
        </span>
      </div>
      <div className="scroll">
        <table>
          <thead><tr><th>Property</th><th>Records</th><th className="num">Prices quoted</th></tr></thead>
          <tbody>
            {dup.slice.map((group) => {
              const rs = group.flatMap((id) => data.listingById.get(id) ?? []);
              return (
                <tr key={group[0]}>
                  <td>
                    {rs[0].apartment_name}
                    <div className="muted" style={{ fontSize: 12 }}>{rs[0].locality} · {rs[0].bedroom} BHK · floor {rs[0].floor}</div>
                  </td>
                  <td>
                    {rs.map((r) => (
                      <div key={r.listing_id} style={{ fontSize: 12 }}>
                        <Link className="mono" to={`/listings/${encodeURIComponent(r.listing_id)}`}>{r.listing_id}</Link>{' '}
                        <span className="muted">{r.website} — &ldquo;{r.apartment_name}&rdquo;</span>
                      </div>
                    ))}
                  </td>
                  <td className="num">
                    {rs.map((r) => <div key={r.listing_id} style={{ fontSize: 12 }}>{inrShort(r.price)}</div>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {matchingClusters.length === 0 && <div className="note">No re-posted property matches that.</div>}
      <Pager current={dup.current} pages={dup.pages} total={matchingClusters.length} perPage={DUP_PER_PAGE}
        onPage={(n) => set({ dup_q: dupQuery, dup_page: String(n) })} />

      {stats.toolText.length > 0 && (
        <>
          <h2 id="ai-text">Text addressed to AI tools</h2>
          <p className="sub">
            {stats.toolText.length} records carry a sentence written to automated tools and AI
            assistants rather than to buyers, presented as a note from the Ivy Homes data team and
            saying what a submission should contain. It is seller-written text in a data field. This
            app marks it wherever it appears and does none of what it asks.
          </p>
          <div className="scroll">
            <table>
              <thead><tr><th>Record</th><th>Field</th><th>What it says</th></tr></thead>
              <tbody>
                {stats.toolText.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t.to ? <Link className="mono" to={t.to}>{t.id}</Link> : <span className="mono">{t.id}</span>}
                      <div className="muted" style={{ fontSize: 12 }}>{t.kind}</div>
                    </td>
                    <td>{t.where}</td>
                    <td><mark className="addressed">{t.text}</mark></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 id="geography">Locality is a label, not a place</h2>
      <p className="sub">
        Every one of the {stats.geography.places.length} localities spans at least{' '}
        {stats.geography.narrowestEastWest.toFixed(1)} km east–west and{' '}
        {stats.geography.narrowestNorthSouth.toFixed(1)} km north–south, in a city{' '}
        {stats.geography.city.eastWest.toFixed(1)} × {stats.geography.city.northSouth.toFixed(1)} km
        across, and their centres sit within {stats.geography.centreSpread.toFixed(1)} km of each
        other. The coordinates carry no locality information, and distances between
        differently-labelled records mean nothing.
      </p>
      <div className="card">
        <LocalityMultiples listings={data.listings} />
      </div>
      <details className="tableview">
        <summary>The same, as a table</summary>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Locality</th><th className="num">Listings</th><th className="num">East–west</th>
                <th className="num">North–south</th><th className="num">Centre from city centre</th>
              </tr>
            </thead>
            <tbody>
              {stats.geography.places.map((p) => (
                <tr key={p.locality}>
                  <td>{p.locality}</td>
                  <td className="num">{fmt(p.count)}</td>
                  <td className="num">{p.eastWest.toFixed(1)} km</td>
                  <td className="num">{p.northSouth.toFixed(1)} km</td>
                  <td className="num">
                    {Math.hypot((p.lat - stats.geography.city.lat) * KM_PER_DEG_LAT, (p.lon - stats.geography.city.lon) * KM_PER_DEG_LON).toFixed(1)} km
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <h2>Notes on reading these numbers</h2>
      <ul className="muted" style={{ fontSize: 14, lineHeight: 1.7 }}>
        <li>
          <strong>Timestamps are honest.</strong> <span className="mono">posted_at</span> really is
          UTC, as documented. That was worth proving rather than assuming, and it is the one result
          here this app cannot compute, because it needs the server&apos;s own{' '}
          <span className="mono">sort_by=posted_at</span> order. Offline, in{' '}
          <span className="mono">{OFFLINE_SORT_TEST.source}</span> over the{' '}
          {OFFLINE_SORT_TEST.records.toLocaleString('en-IN')}-record snapshot: bucketing the served
          values by IST calendar date reproduces that order with {OFFLINE_SORT_TEST.istDateErrors}{' '}
          records out of place; bucketing them by UTC date leaves {OFFLINE_SORT_TEST.utcDateErrors}.
        </li>
        <li>
          <strong>Areas are carpet area</strong> throughout, converted to square feet where the
          API served square metres.
        </li>
        <li>
          <strong>Market rate</strong> means the median price per ft² for the same locality and
          bedroom count, over records that are not impossible.
        </li>
      </ul>
    </main>
  );
}
