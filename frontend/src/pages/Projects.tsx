import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDataset } from '../api/store';
import { inrShort, sqft } from '../lib/corrections';

const PER_PAGE = 25;

export default function Projects() {
  const data = useDataset();
  const [params, setParams] = useSearchParams();
  const get = (k: string, d = '') => params.get(k) ?? d;
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const locality = get('locality');
  const status = get('status');
  const only = get('only');
  const sort = get('sort', 'price_desc');
  const page = Math.max(1, Number(get('page', '1')) || 1);

  const liveCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data?.listings ?? []) {
      if (r.project_id && r.is_live) m.set(r.project_id, (m.get(r.project_id) ?? 0) + 1);
    }
    return m;
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const cmp: Record<string, (a: any, b: any) => number> = {
      price_desc: (a, b) => b.price_max_inr - a.price_max_inr,
      price_asc: (a, b) => a.price_min_inr - b.price_min_inr,
      launch_desc: (a, b) => b.launch_date.localeCompare(a.launch_date),
      units_desc: (a, b) => b.total_units - a.total_units,
    };
    return data.projects
      .filter((p) => {
        if (locality && p.locality !== locality) return false;
        if (status && p.project_status !== status) return false;
        if (only === 'wrong' && (liveCount.get(p.project_id) ?? 0) === p.total_listings) return false;
        return true;
      })
      .sort(cmp[sort] ?? cmp.price_desc);
  }, [data, locality, status, only, sort, liveCount]);

  if (!data) return null;
  const wrong = data.projects.filter((p) => (liveCount.get(p.project_id) ?? 0) !== p.total_listings).length;
  const localities = [...new Set(data.projects.map((p) => p.locality))].sort();
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const clamped = Math.min(page, pages);
  const slice = rows.slice((clamped - 1) * PER_PAGE, clamped * PER_PAGE);

  return (
    <main>
      <h1>Projects</h1>
      <p className="sub">
        {data.projects.length} builder projects. Prices are converted to rupees: the API serves
        them in lakh below a crore and crore above, while documenting them as rupees.{' '}
        {wrong} projects report a listing count that does not match the listings they actually have.
      </p>

      <div className="filters">
        <div>
          <label htmlFor="p-loc">Locality</label>
          <select id="p-loc" value={locality} onChange={(e) => set('locality', e.target.value)}>
            <option value="">Any</option>
            {localities.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="p-st">Status</label>
          <select id="p-st" value={status} onChange={(e) => set('status', e.target.value)}>
            <option value="">Any</option>
            <option value="new launch">new launch</option>
            <option value="under construction">under construction</option>
            <option value="ready to move">ready to move</option>
          </select>
        </div>
        <div>
          <label htmlFor="p-only">Listing count</label>
          <select id="p-only" value={only} onChange={(e) => set('only', e.target.value)}>
            <option value="">All projects</option>
            <option value="wrong">Only those reporting it wrong</option>
          </select>
        </div>
        <div>
          <label htmlFor="p-sort">Sort</label>
          <select id="p-sort" value={sort} onChange={(e) => set('sort', e.target.value)}>
            <option value="price_desc">Highest maximum price</option>
            <option value="price_asc">Lowest starting price</option>
            <option value="launch_desc">Most recently launched</option>
            <option value="units_desc">Most units</option>
          </select>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>{rows.length} match</p>

      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Project</th><th>Locality</th><th>Status</th>
              <th className="num">Price band</th><th className="num">Areas</th>
              <th className="num">Units</th><th className="num">Reported</th><th className="num">Live</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((p) => {
              const actual = liveCount.get(p.project_id) ?? 0;
              const mismatch = actual !== p.total_listings;
              return (
                <tr key={p.project_id}>
                  <td>
                    <div>{p.apartment_name}</div>
                    <div className="mono muted" style={{ fontSize: 12 }}>{p.project_id} · {p.developer_name}</div>
                  </td>
                  <td>{p.locality}</td>
                  <td>{p.project_status}</td>
                  <td className="num">
                    {inrShort(p.price_min_inr)} – {inrShort(p.price_max_inr)}
                    <div className="muted" style={{ fontSize: 11 }}>
                      served {p.price_min} {p.price_unit_min} / {p.price_max} {p.price_unit_max}
                    </div>
                  </td>
                  <td className="num">{sqft(p.min_area_sqft)} – {sqft(p.max_area_sqft)}</td>
                  <td className="num">{p.total_units}</td>
                  <td className="num">{p.total_listings}</td>
                  <td className="num">
                    {mismatch
                      ? <span className="badge bad" title={`reports ${p.total_listings}, has ${actual}`}>{actual}</span>
                      : actual}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button disabled={clamped <= 1} onClick={() => set('page', String(clamped - 1))}>Previous</button>
        <span className="count">Page {clamped} of {pages}</span>
        <button disabled={clamped >= pages} onClick={() => set('page', String(clamped + 1))}>Next</button>
      </div>

      <p className="muted" style={{ fontSize: 13 }}>
        Listing counts are compared against live listings, which is the reading that makes{' '}
        {data.projects.length - wrong} of {data.projects.length} projects agree.{' '}
        <Link to="/insights">More on the insights screen</Link>.
      </p>
    </main>
  );
}
