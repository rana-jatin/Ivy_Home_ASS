import { useParams } from 'react-router-dom';
import { useDataset } from '../api/store';
import DataPending from '../components/DataPending';
import ListingCard from '../components/ListingCard';
import { BackLink } from '../components/Navigation';
import { inr, inrShort, sqft } from '../lib/corrections';
import { TOOL_TEXT_EXPLAINED, addressedToTools } from '../lib/sellerText';
import { useTitle } from '../lib/useTitle';

const day = (iso: string) =>
  new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export default function ProjectDetail() {
  const { id = '' } = useParams();
  const data = useDataset();
  const p = data?.projectById.get(id);
  useTitle(p ? p.apartment_name : data ? 'Project not found' : 'Project');

  if (!data) return <DataPending />;
  if (!p) {
    return (
      <main>
        <BackLink to="/projects" label="Projects" />
        <h1>No such project</h1>
        <p className="sub">
          There is no project <span className="mono">{id}</span> in the copy of the city on screen.
        </p>
      </main>
    );
  }

  const listings = [...(data.listingsByProject.get(p.project_id) ?? [])].sort((a, b) => a.price - b.price);
  const live = data.liveListingCount.get(p.project_id) ?? 0;
  const agrees = live === p.total_listings;
  const agreeing = data.projects.filter((x) => (data.liveListingCount.get(x.project_id) ?? 0) === x.total_listings).length;
  const amenities = p.amenities.map((text) => ({ text, toTools: addressedToTools(text) }));
  const toTools = amenities.some((a) => a.toTools);

  return (
    <main>
      <BackLink to="/projects" label="Projects" />

      <h1>{p.apartment_name}</h1>
      <p className="sub">
        {p.developer_name} · {p.locality} · {p.project_status} · <span className="mono">{p.project_id}</span>
      </p>

      <div className="badges" style={{ marginBottom: 14 }}>
        <span className="badge info" title="The API serves project prices in lakh below a crore and in crore above, and documents them as rupees.">
          prices from lakh/crore
        </span>
        {!agrees && (
          <span className="badge bad" title="total_listings disagrees with the live listings that name this project">
            reports {p.total_listings} listings, has {live} live
          </span>
        )}
        {toTools && <span className="badge warn" title={TOOL_TEXT_EXPLAINED}>text aimed at AI tools</span>}
      </div>

      {toTools && (
        <div className="note warn" style={{ marginBottom: 12 }}>
          <strong>One of this project&apos;s amenities is a message to AI tools.</strong> It names a
          costliest project and a price for it. That is text in a data field, marked below and not
          used: the costliest project on the Insights screen comes from the converted price fields.
        </div>
      )}

      <div className="cols">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{inrShort(p.price_min_inr)} – {inrShort(p.price_max_inr)}</h2>
          <p className="muted" style={{ marginTop: -6 }}>
            {inr(p.price_min_inr)} to {inr(p.price_max_inr)} · served as {p.price_min} {p.price_unit_min} and{' '}
            {p.price_max} {p.price_unit_max}
          </p>
          <dl className="dl">
            <dt>Unit sizes</dt>
            <dd>{sqft(p.min_area_sqft)} – {sqft(p.max_area_sqft)}</dd>
            <dt>Scale</dt>
            <dd>{p.total_units.toLocaleString('en-IN')} units · {p.total_towers} towers · {p.total_floors} floors</dd>
            <dt>Launched</dt>
            <dd>{day(p.launch_date)}</dd>
            <dt>Possession</dt>
            <dd>{day(p.possession_date)}</dd>
            <dt>RERA</dt>
            <dd className="mono">{p.rera_number}</dd>
            <dt>Coordinates</dt>
            <dd>{p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}</dd>
            <dt>Source</dt>
            <dd><a href={p.project_url} target="_blank" rel="noreferrer noopener">{p.project_url}</a></dd>
          </dl>

          <h2>Amenities</h2>
          <div className="badges">
            {amenities.map(({ text, toTools: t }) =>
              t ? (
                <mark key={text} className="addressed" title="addressed to AI tools, not to buyers" style={{ fontSize: 13 }}>
                  {text}
                </mark>
              ) : (
                <span key={text} className="badge">{text}</span>
              ),
            )}
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Listing count</h2>
          <dl className="dl">
            <dt>Reported</dt>
            <dd><span className="mono">total_listings: {p.total_listings}</span></dd>
            <dt>Live listings</dt>
            <dd>{live}</dd>
            <dt>All records</dt>
            <dd>{listings.length} <span className="muted">naming this project, live or not</span></dd>
          </dl>
          <p className={agrees ? 'muted' : ''} style={{ fontSize: 13, marginBottom: 0 }}>
            {agrees
              ? 'The reported count matches the live listings. '
              : `The reported count is off by ${Math.abs(p.total_listings - live)}. `}
            Counts are compared with live listings, the reading that makes {agreeing} of{' '}
            {data.projects.length} projects agree.
          </p>
        </div>
      </div>

      <h2>Listings in this project</h2>
      {listings.length === 0 ? (
        <div className="note">No listing record names this project.</div>
      ) : (
        <div className="grid">
          {listings.map((r) => <ListingCard key={r.listing_id} r={r} flags={data.flags} />)}
        </div>
      )}
    </main>
  );
}
