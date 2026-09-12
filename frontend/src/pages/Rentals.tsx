import { useMemo } from 'react';
import { useDataset } from '../api/store';
import DataPending from '../components/DataPending';
import { Field, ResultBar, SelectField, type Chip } from '../components/Filters';
import Pager, { paginate } from '../components/Pager';
import { inr, inrShort, sqft, type FixedRental } from '../lib/corrections';
import { useQueryState } from '../lib/query';
import { TOOL_TEXT_EXPLAINED, addressedToTools } from '../lib/sellerText';
import { useTitle } from '../lib/useTitle';

const PER_PAGE = 24;

const FURNISHING = ['unfurnished', 'semi-furnished', 'fully-furnished'];
const SHOW = [{ value: 'live', label: 'Live only' }];
const SORTS: Record<string, { label: string; cmp: (a: FixedRental, b: FixedRental) => number }> = {
  rent_asc: { label: 'Rent, low to high', cmp: (a, b) => a.price - b.price },
  rent_desc: { label: 'Rent, high to low', cmp: (a, b) => b.price - a.price },
  posted_desc: { label: 'Newest first', cmp: (a, b) => b.posted_at.localeCompare(a.posted_at) },
  area_desc: { label: 'Largest first', cmp: (a, b) => b.carpet_area - a.carpet_area },
  rent_per_sqft_asc: { label: 'Cheapest per ft²', cmp: (a, b) => a.price / a.carpet_area - b.price / b.carpet_area },
};
const FILTER_KEYS = ['locality', 'bedroom', 'furnishing', 'max_rent', 'show'];

export default function Rentals() {
  useTitle('Rentals');
  const data = useDataset();
  const { get, set } = useQueryState();

  const locality = get('locality');
  const bedroom = get('bedroom');
  const furnishing = get('furnishing');
  const maxRent = get('max_rent');
  const show = get('show');
  const sort = get('sort', 'rent_asc');
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
        if (show === 'live' && !r.is_live) return false;
        return true;
      })
      .sort((SORTS[sort] ?? SORTS.rent_asc).cmp);
  }, [data, locality, bedroom, furnishing, maxRent, show, sort]);

  if (!data) return <DataPending />;
  const correctedRecords = data.rentals.filter((r) => r.deposit_unit_corrected);
  const corrected = correctedRecords.length;
  const correctedSites = [...new Set(correctedRecords.map((r) => r.website))].sort();
  const { pages, current, slice } = paginate(filtered, page, PER_PAGE);
  const totalRent = filtered.reduce((a, r) => a + r.price, 0);
  const assigned = data.me?.assigned_locality;

  const chips: Chip[] = [
    locality && { key: 'locality', label: locality },
    bedroom && { key: 'bedroom', label: `${bedroom} BHK` },
    furnishing && { key: 'furnishing', label: furnishing },
    maxRent && { key: 'max_rent', label: `up to ${inr(Number(maxRent))}/month` },
    show === 'live' && { key: 'show', label: 'live only' },
  ].filter((c): c is Chip => !!c);

  return (
    <main>
      <h1>Rentals</h1>
      <p className="sub">
        {data.rentals.length.toLocaleString('en-IN')} records. Deposits are shown in rupees:{' '}
        {corrected} of them are served as a count of months&apos; rent instead, all from{' '}
        {correctedSites.join(', ')}, and are converted here.
      </p>

      <div className="filters">
        <SelectField id="r-loc" label="Locality" value={locality} onChange={(v) => set({ locality: v })}
          options={localities.map((l) => ({ value: l, label: l === assigned ? `${l} (assigned)` : l }))} />
        <SelectField id="r-bed" label="Bedrooms" value={bedroom} onChange={(v) => set({ bedroom: v })}
          options={[1, 2, 3, 4].map((b) => ({ value: String(b), label: `${b} BHK` }))} />
        <SelectField id="r-furn" label="Furnishing" value={furnishing} onChange={(v) => set({ furnishing: v })} options={FURNISHING} />
        <Field id="r-max" label="Max monthly rent ₹">
          <input id="r-max" type="text" inputMode="numeric" autoComplete="off" value={maxRent} placeholder="no limit"
            onChange={(e) => set({ max_rent: e.target.value.replace(/\D/g, '') }, { replace: true })} />
        </Field>
        <SelectField id="r-show" label="Show" value={show} any="Live and not live" onChange={(v) => set({ show: v })} options={SHOW} />
        <SelectField id="r-sort" label="Sort" value={sort} any={null} onChange={(v) => set({ sort: v })}
          options={Object.entries(SORTS).map(([value, s]) => ({ value, label: s.label }))} />
      </div>

      <ResultBar
        count={
          <>
            {filtered.length.toLocaleString('en-IN')} match · combined monthly rent {inr(totalRent)}
            {locality && locality === assigned && show !== 'live' && !bedroom && !furnishing && !maxRent &&
              ' · every rental in the assigned locality'}
          </>
        }
        chips={chips}
        onRemove={(key) => set({ [key]: '' })}
        onClearAll={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])))}
      />

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
            {slice.map((r) => {
              const toTools = addressedToTools(r.description) ?? addressedToTools(r.title);
              return (
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
                    <div className="badges">
                      {!r.is_live && <span className="badge warn">not live</span>}
                      {r.deposit_unit_corrected && <span className="badge info">deposit fixed</span>}
                      {toTools && (
                        <span className="badge warn" title={`${TOOL_TEXT_EXPLAINED} “${toTools.addressed}”`}>
                          text aimed at AI tools
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {slice.length === 0 && <div className="note">Nothing matches those filters.</div>}

      <Pager current={current} pages={pages} total={filtered.length} perPage={PER_PAGE}
        onPage={(n) => set({ page: String(n) })} />
    </main>
  );
}
