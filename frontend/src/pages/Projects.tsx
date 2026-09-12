import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDataset } from '../api/store';
import DataPending from '../components/DataPending';
import { ResultBar, SelectField, type Chip } from '../components/Filters';
import Pager, { paginate } from '../components/Pager';
import { inrShort, sqft, type FixedProject } from '../lib/corrections';
import { useQueryState } from '../lib/query';
import { useTitle } from '../lib/useTitle';

const PER_PAGE = 25;

const STATUS = ['new launch', 'under construction', 'ready to move'];
const ONLY = [{ value: 'wrong', label: 'Only those reporting it wrong' }];
const SORTS: Record<string, { label: string; cmp: (a: FixedProject, b: FixedProject) => number }> = {
  price_desc: { label: 'Highest maximum price', cmp: (a, b) => b.price_max_inr - a.price_max_inr },
  price_asc: { label: 'Lowest starting price', cmp: (a, b) => a.price_min_inr - b.price_min_inr },
  launch_desc: { label: 'Most recently launched', cmp: (a, b) => b.launch_date.localeCompare(a.launch_date) },
  units_desc: { label: 'Most units', cmp: (a, b) => b.total_units - a.total_units },
};
const FILTER_KEYS = ['locality', 'status', 'only'];

export default function Projects() {
  useTitle('Projects');
  const data = useDataset();
  const { get, set } = useQueryState();

  const locality = get('locality');
  const status = get('status');
  const only = get('only');
  const sort = get('sort', 'price_desc');
  const page = Math.max(1, Number(get('page', '1')) || 1);

  const rows = useMemo(() => {
    if (!data) return [];
    const live = (id: string) => data.liveListingCount.get(id) ?? 0;
    return data.projects
      .filter((p) => {
        if (locality && p.locality !== locality) return false;
        if (status && p.project_status !== status) return false;
        if (only === 'wrong' && live(p.project_id) === p.total_listings) return false;
        return true;
      })
      .sort((SORTS[sort] ?? SORTS.price_desc).cmp);
  }, [data, locality, status, only, sort]);

  if (!data) return <DataPending />;
  const liveCount = data.liveListingCount;
  const wrong = data.projects.filter((p) => (liveCount.get(p.project_id) ?? 0) !== p.total_listings).length;
  const localities = [...new Set(data.projects.map((p) => p.locality))].sort();
  const { pages, current, slice } = paginate(rows, page, PER_PAGE);
  const chips: Chip[] = [
    locality && { key: 'locality', label: locality },
    status && { key: 'status', label: status },
    only === 'wrong' && { key: 'only', label: 'reporting the wrong count' },
  ].filter((c): c is Chip => !!c);

  return (
    <main>
      <h1>Projects</h1>
      <p className="sub">
        {data.projects.length} builder projects. Prices are converted to rupees: the API serves
        them in lakh below a crore and crore above, while documenting them as rupees.{' '}
        {wrong} projects report a listing count that does not match the listings they actually have.
      </p>

      <div className="filters">
        <SelectField id="p-loc" label="Locality" value={locality} onChange={(v) => set({ locality: v })} options={localities} />
        <SelectField id="p-st" label="Status" value={status} onChange={(v) => set({ status: v })} options={STATUS} />
        <SelectField id="p-only" label="Listing count" value={only} any="All projects" onChange={(v) => set({ only: v })} options={ONLY} />
        <SelectField id="p-sort" label="Sort" value={sort} any={null} onChange={(v) => set({ sort: v })}
          options={Object.entries(SORTS).map(([value, x]) => ({ value, label: x.label }))} />
      </div>

      <ResultBar
        count={<>{rows.length} match</>}
        chips={chips}
        onRemove={(key) => set({ [key]: '' })}
        onClearAll={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])))}
      />

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

      <Pager current={current} pages={pages} total={rows.length} perPage={PER_PAGE}
        onPage={(n) => set({ page: String(n) })} />

      <p className="muted" style={{ fontSize: 13 }}>
        Listing counts are compared against live listings, which is the reading that makes{' '}
        {data.projects.length - wrong} of {data.projects.length} projects agree.{' '}
        <Link to="/insights">More on the insights screen</Link>.
      </p>
    </main>
  );
}
