// The screen /v1/analytics/summary was supposed to provide, computed locally
// because that endpoint 404s - plus everything the data turned out to be
// hiding, which is the part a user would actually want to know.
//
// Every figure in the prose is computed from the pull too. A sentence that
// quotes a number typed in by hand stops being true the moment the data moves,
// and nothing would say so.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDataset } from '../api/store';
import { OFFLINE_SORT_TEST, REFERENCE, inr, inrShort, type FixedListing } from '../lib/corrections';
import { AREA_TOL, RADIUS_M, corruptSummary } from '../lib/flags';

function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** "15–16", or just "16" when every value is the same. */
function span(xs: number[], fmt: (n: number) => string = String) {
  if (!xs.length) return '—';
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return lo === hi ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`;
}

// Same flat-earth conversion the duplicate matcher uses; Chennai is at 13°N.
const KM_PER_DEG_LAT = 111;
const KM_PER_DEG_LON = 108.3;

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

function Kpi({ k, v, n }: { k: string; v: string; n?: string }) {
  return (
    <div className="kpi">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {n && <div className="n">{n}</div>}
    </div>
  );
}

export default function Insights() {
  const data = useDataset();

  const stats = useMemo(() => {
    if (!data) return null;
    const { listings, rentals, projects, flags } = data;
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
    const places = [...new Set(listings.map((r) => r.locality))].map((l) => extent(listings.filter((r) => r.locality === l)));
    let centreSpread = 0;
    for (const a of places) {
      for (const b of places) {
        centreSpread = Math.max(centreSpread, Math.hypot((a.lat - b.lat) * KM_PER_DEG_LAT, (a.lon - b.lon) * KM_PER_DEG_LON));
      }
    }
    const geography = {
      localities: places.length,
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

    const liveByProject = new Map<string, number>();
    for (const r of live) if (r.project_id) liveByProject.set(r.project_id, (liveByProject.get(r.project_id) ?? 0) + 1);
    const wrongProjects = projects.filter((p) => (liveByProject.get(p.project_id) ?? 0) !== p.total_listings);

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
      (g) => new Set(g.map((id) => listings.find((r) => r.listing_id === id)?.apartment_name)).size > 1,
    ).length;

    return {
      live, clean, byLocality, byBhk, geography, lastWeek, wrongProjects, corrupt, corruptClasses,
      areaFixed, areaSites, depositFixed, depositSites, depositMultiples, croreProjects, costliest,
      myLocality, myRentals, fakeProfiles, respelled,
      medianPrice: median(clean.map((r) => r.price)),
      medianPps: median(clean.map((r) => r.price_per_sqft)),
      avg2bhk:
        clean.filter((r) => r.bedroom === 2).reduce((a, r) => a + r.price_per_sqft, 0) /
        Math.max(1, clean.filter((r) => r.bedroom === 2).length),
    };
  }, [data]);

  if (!data || !stats) return null;
  const { flags, declaredTotals } = data;
  const maxLoc = Math.max(...stats.byLocality.map((l) => l.count));

  return (
    <main>
      <h1>Insights</h1>
      <p className="sub">
        Everything <span className="mono">/v1/analytics/summary</span> promised — that endpoint
        returns 404 — computed from a complete local pull, plus what the data turned out to be
        hiding. Every number here is computed in the browser from that pull, except the timestamp
        test in the notes at the bottom, which needs the server&apos;s own sort order and is quoted
        from the offline analysis.
      </p>

      <h2>The city</h2>
      <div className="kpis">
        <Kpi k="Listing records" v={data.listings.length.toLocaleString('en-IN')}
          n={`the endpoint reports total: ${declaredTotals.listings.toLocaleString('en-IN')}`} />
        <Kpi k="Distinct properties" v={flags.distinctProperties.toLocaleString('en-IN')}
          n={`${(data.listings.length - flags.distinctProperties).toLocaleString('en-IN')} records are re-posts`} />
        <Kpi k="Live listings" v={stats.live.length.toLocaleString('en-IN')}
          n={`${(data.listings.length - stats.live.length).toLocaleString('en-IN')} returned despite being inactive`} />
        <Kpi k="Median price" v={inrShort(stats.medianPrice)} n="live, genuine records only" />
        <Kpi k="Median ₹/ft²" v={`₹${Math.round(stats.medianPps).toLocaleString('en-IN')}`} n="carpet area, units corrected" />
        <Kpi k="Posted in the 7 days to the reference" v={stats.lastWeek.toLocaleString('en-IN')}
          n="IST window, from genuinely-UTC timestamps" />
      </div>

      <h2>What the documentation got wrong, in numbers</h2>
      <div className="kpis">
        <Kpi k="Records past the reported total" v={`+${data.listings.length - declaredTotals.listings}`}
          n="paging on has_more, not on total" />
        <Kpi k="Areas served in m²" v={stats.areaFixed.length.toLocaleString('en-IN')}
          n={`served by ${stats.areaSites.join(', ')}; documented as square feet everywhere`} />
        <Kpi k="Deposits served in months" v={stats.depositFixed.length.toLocaleString('en-IN')}
          n={`served by ${stats.depositSites.join(', ')}; documented as rupees`} />
        <Kpi k="Project prices in lakh/crore" v={`${data.projects.length}`}
          n={`${stats.croreProjects.length} quoted in crore; documented as rupees`} />
        <Kpi k="Impossible records" v={String(flags.corrupt.size)} n={stats.corruptClasses} />
        <Kpi k="Lead-generation listings" v={String(flags.fakeIds.size)}
          n={`across ${flags.fakeContacts.size} phone numbers`} />
        <Kpi k="Projects miscounting listings" v={String(stats.wrongProjects.length)}
          n={`of ${data.projects.length}; documented as always agreeing`} />
        <Kpi k="Costliest project" v={inrShort(stats.costliest.price_max_inr)}
          n={`${stats.costliest.apartment_name} · served as ${stats.costliest.price_max}`} />
      </div>

      {stats.myLocality && (
        <>
          <h2>Your locality — {stats.myLocality}</h2>
          <div className="kpis">
            <Kpi k="Rental records" v={String(stats.myRentals.length)} />
            <Kpi k="Combined monthly rent"
              v={inr(stats.myRentals.reduce((a, r) => a + r.price, 0))}
              n={`city-wide, every deposit quoted in rupees is ${span(stats.depositMultiples, (x) => String(Math.round(x * 10) / 10))}× the price, so price is the monthly rent`} />
            <Kpi k="Median rent" v={inr(median(stats.myRentals.map((r) => r.price)))} />
          </div>
        </>
      )}

      <h2>By locality</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Locality</th><th>Records</th><th className="num">Live</th>
              <th className="num">Flagged</th><th className="num">Median price</th><th className="num">Median ₹/ft²</th>
            </tr>
          </thead>
          <tbody>
            {stats.byLocality.map((l) => (
              <tr key={l.locality}>
                <td>{l.locality}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="bar" style={{ width: 110 }}>
                      <i style={{ width: `${(l.count / maxLoc) * 100}%` }} />
                    </div>
                    <span className="mono">{l.count}</span>
                  </div>
                </td>
                <td className="num">{l.live}</td>
                <td className="num">{l.flagged}</td>
                <td className="num">{inrShort(l.medianPrice)}</td>
                <td className="num">₹{Math.round(l.medianPps).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>By bedroom count</h2>
      <div className="scroll">
        <table>
          <thead><tr><th>Configuration</th><th className="num">Records</th><th className="num">Median price</th></tr></thead>
          <tbody>
            {stats.byBhk.map((b) => (
              <tr key={b.bedroom}>
                <td>{b.bedroom} BHK{b.plots > 0 ? ` (${b.plots} plots)` : ''}</td>
                <td className="num">{b.count}</td>
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

      <h2>Records that cannot exist</h2>
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
              <tr key={reason}><td>{reason}</td><td className="num">{n}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        <Link to="/listings?quality=flagged">Browse every flagged record →</Link>
      </p>

      <h2>Lead generation</h2>
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
      <div className="scroll">
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
                <td className="mono">{contact}</td>
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

      <h2>The same flat, listed more than once</h2>
      <p className="sub">
        {flags.clusters.length.toLocaleString('en-IN')} properties appear more than once. Copies
        are matched on the physical signature, a carpet area within {AREA_TOL * 100}% and a
        position within {RADIUS_M} m, not on the name: {stats.respelled.toLocaleString('en-IN')} of
        those {flags.clusters.length.toLocaleString('en-IN')} properties carry more than one
        spelling of it between sites.
      </p>
      <div className="scroll">
        <table>
          <thead><tr><th>Property</th><th>Records</th><th className="num">Prices quoted</th></tr></thead>
          <tbody>
            {flags.clusters.slice(0, 12).map((group) => {
              const rs = group.map((id) => data.listings.find((r) => r.listing_id === id)!).filter(Boolean);
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
          <strong>Locality is a label, not a place.</strong> Every one of the{' '}
          {stats.geography.localities} localities spans at least{' '}
          {stats.geography.narrowestEastWest.toFixed(1)} km east–west and{' '}
          {stats.geography.narrowestNorthSouth.toFixed(1)} km north–south, in a city{' '}
          {stats.geography.city.eastWest.toFixed(1)} × {stats.geography.city.northSouth.toFixed(1)} km
          across, and their centres sit within {stats.geography.centreSpread.toFixed(1)} km of each
          other. The coordinates carry no locality information, and distances between
          differently-labelled records mean nothing.
        </li>
        <li>
          <strong>Areas are carpet area</strong> throughout, converted to square feet where the
          API served square metres.
        </li>
      </ul>
    </main>
  );
}
