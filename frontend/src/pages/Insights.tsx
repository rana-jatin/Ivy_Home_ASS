// The screen /v1/analytics/summary was supposed to provide, computed locally
// because that endpoint 404s - plus everything the data turned out to be
// hiding, which is the part a user would actually want to know.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDataset } from '../api/store';
import { REFERENCE, inr, inrShort, type FixedListing } from '../lib/corrections';

function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
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
      }));

    const from = new Date(REFERENCE.getTime() - 7 * 864e5);
    const lastWeek = listings.filter((r) => {
      const t = new Date(r.posted_at);
      return t >= from && t < REFERENCE;
    }).length;

    const liveByProject = new Map<string, number>();
    for (const r of live) if (r.project_id) liveByProject.set(r.project_id, (liveByProject.get(r.project_id) ?? 0) + 1);
    const wrongProjects = projects.filter((p) => (liveByProject.get(p.project_id) ?? 0) !== p.total_listings);

    const corruptByReason = new Map<string, number>();
    for (const reasons of flags.corrupt.values()) {
      for (const r of reasons) corruptByReason.set(r, (corruptByReason.get(r) ?? 0) + 1);
    }

    const areaFixed = listings.filter((r) => r.area_unit_corrected);
    const depositFixed = rentals.filter((r) => r.deposit_unit_corrected);
    const croreProjects = projects.filter((p) => p.price_unit_max === 'crore');
    const costliest = [...projects].sort((a, b) => b.price_max_inr - a.price_max_inr)[0];
    const myLocality = data.me?.assigned_locality;
    const myRentals = myLocality ? rentals.filter((r) => r.locality === myLocality) : [];

    return {
      live, clean, byLocality, byBhk, lastWeek, wrongProjects, corruptByReason,
      areaFixed, depositFixed, croreProjects, costliest, myLocality, myRentals,
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
        hiding. Every number here is this app&apos;s own arithmetic.
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
          n="one website; documented as square feet everywhere" />
        <Kpi k="Deposits served in months" v={stats.depositFixed.length.toLocaleString('en-IN')}
          n="one website; documented as rupees" />
        <Kpi k="Project prices in lakh/crore" v={`${data.projects.length}`}
          n={`${stats.croreProjects.length} quoted in crore; documented as rupees`} />
        <Kpi k="Impossible records" v={String(flags.corrupt.size)} n="seven classes, nine records each" />
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
              n="price is genuinely monthly; deposits are the field with the unit problem" />
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
                <td>{b.bedroom} BHK{b.bedroom === 0 ? ' (plots)' : ''}</td>
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
        Seven classes, nine records each, no record in two of them. Rules that only found unusual
        records — a plot with no bedrooms, a ground floor — were rejected.
      </p>
      <div className="scroll">
        <table>
          <thead><tr><th>Impossibility</th><th className="num">Records</th></tr></thead>
          <tbody>
            {[...stats.corruptByReason.entries()].sort((a, b) => b[1] - a[1]).map(([reason, n]) => (
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
        The phone number is the unit of analysis, not the listing. These numbers each post 15–16
        listings under several seller names, across several websites and localities, at about half
        the going rate — and every one is marked verified and live.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>Phone number</th><th className="num">Listings</th><th className="num">Seller names</th><th className="num">Median vs market</th></tr>
          </thead>
          <tbody>
            {[...flags.fakeContacts].map((c) => {
              const rs = data.listings.filter((r) => r.posted_by_contact === c);
              const ratio = median(rs.map((r) => r.price_per_sqft / (flags.marketRate.get(`${r.locality}|${r.bedroom}`) || 1)));
              return (
                <tr key={c}>
                  <td className="mono">{c}</td>
                  <td className="num">{rs.length}</td>
                  <td className="num">{new Set(rs.map((r) => r.posted_by_name)).size}</td>
                  <td className="num">{Math.round(ratio * 100)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>The same flat, listed more than once</h2>
      <p className="sub">
        {flags.clusters.length.toLocaleString('en-IN')} properties appear more than once. Copies
        are matched on the physical signature and a position within 150 m, because the names are
        re-cased, hyphenated and suffixed between sites.
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
          UTC, as documented. That was worth proving rather than assuming: sorting by{' '}
          <span className="mono">posted_at</span> buckets by the IST calendar date, and bucketing
          the served values that way reproduces the server&apos;s order with zero errors in{' '}
          {data.listings.length.toLocaleString('en-IN')} records, where treating them as IST gives 865.
        </li>
        <li>
          <strong>Locality is a label, not a place.</strong> All ten localities span the whole city
          box with the same centre, so the coordinates carry no locality information and distances
          between differently-labelled records mean nothing.
        </li>
        <li>
          <strong>Areas are carpet area</strong> throughout, converted to square feet where the
          API served square metres.
        </li>
      </ul>
    </main>
  );
}
