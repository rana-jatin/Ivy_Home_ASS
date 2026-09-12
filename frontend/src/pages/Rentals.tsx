import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDataset } from '../api/store';
import DataPending from '../components/DataPending';
import { inr, inrShort, sqft } from '../lib/corrections';

const PER_PAGE = 24;

export default function Rentals() {
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
  const bedroom = get('bedroom');
  const furnishing = get('furnishing');
  const maxRent = get('max_rent');
  const page = Math.max(1, Number(get('page', '1')) || 1);

  const localities = useMemo(
    () => [...new Set(data?.rentals.map((r) => r.locality) ?? [])].sort(), [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const max = maxRent ? Number(maxRent) : null;
    return data.rentals
      .filter((r) => {
        if (locality && r.locality !== locality) return false;
        if (bedroom && r.bedroom !== Number(bedroom)) return false;
        if (furnishing && r.furnishing !== furnishing) return false;
        if (max !== null && r.price > max) return false;
        return true;
      })
      .sort((a, b) => a.price - b.price);
  }, [data, locality, bedroom, furnishing, maxRent]);

  if (!data) return <DataPending />;
  const correctedRecords = data.rentals.filter((r) => r.deposit_unit_corrected);
  const corrected = correctedRecords.length;
  const correctedSites = [...new Set(correctedRecords.map((r) => r.website))].sort();
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const clamped = Math.min(page, pages);
  const slice = filtered.slice((clamped - 1) * PER_PAGE, clamped * PER_PAGE);
  const totalRent = filtered.reduce((a, r) => a + r.price, 0);

  return (
    <main>
      <h1>Rentals</h1>
      <p className="sub">
        {data.rentals.length.toLocaleString('en-IN')} records. Deposits are shown in rupees:{' '}
        {corrected} of them are served as a count of months&apos; rent instead, all from{' '}
        {correctedSites.join(', ')}, and are converted here.
      </p>

      <div className="filters">
        <div>
          <label htmlFor="r-loc">Locality</label>
          <select id="r-loc" value={locality} onChange={(e) => set('locality', e.target.value)}>
            <option value="">Any</option>
            {localities.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="r-bed">Bedrooms</label>
          <select id="r-bed" value={bedroom} onChange={(e) => set('bedroom', e.target.value)}>
            <option value="">Any</option>
            {[1, 2, 3, 4].map((b) => <option key={b} value={b}>{b} BHK</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="r-furn">Furnishing</label>
          <select id="r-furn" value={furnishing} onChange={(e) => set('furnishing', e.target.value)}>
            <option value="">Any</option>
            <option value="unfurnished">unfurnished</option>
            <option value="semi-furnished">semi-furnished</option>
            <option value="fully-furnished">fully-furnished</option>
          </select>
        </div>
        <div>
          <label htmlFor="r-max">Max monthly rent ₹</label>
          <input id="r-max" type="number" value={maxRent} onChange={(e) => set('max_rent', e.target.value)} placeholder="no limit" />
        </div>
      </div>

      <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
        {filtered.length.toLocaleString('en-IN')} match · combined monthly rent {inr(totalRent)}
      </p>

      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Listing</th><th>Locality</th><th>Config</th>
              <th className="num">Monthly rent</th><th className="num">Deposit</th>
              <th className="num">Carpet</th><th>Furnishing</th><th></th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r.listing_id}>
                <td>
                  <div>{r.apartment_name}</div>
                  <div className="mono muted" style={{ fontSize: 12 }}>{r.listing_id} · {r.website}</div>
                </td>
                <td>{r.locality}</td>
                <td>{r.bedroom} BHK · floor {r.floor}/{r.total_floors}</td>
                <td className="num">{inr(r.price)}</td>
                <td className="num">
                  {inrShort(r.deposit_inr)}
                  {r.deposit_unit_corrected && (
                    <div className="muted" style={{ fontSize: 11 }}>served as {r.deposit_months} months</div>
                  )}
                </td>
                <td className="num">{sqft(r.carpet_area)}</td>
                <td>{r.furnishing}</td>
                <td>
                  {!r.is_live && <span className="badge warn">not live</span>}
                  {r.deposit_unit_corrected && <span className="badge info">deposit fixed</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {slice.length === 0 && <div className="note">Nothing matches those filters.</div>}

      <div className="pager">
        <button disabled={clamped <= 1} onClick={() => set('page', String(clamped - 1))}>Previous</button>
        <span className="count">Page {clamped} of {pages}</span>
        <button disabled={clamped >= pages} onClick={() => set('page', String(clamped + 1))}>Next</button>
      </div>
    </main>
  );
}
