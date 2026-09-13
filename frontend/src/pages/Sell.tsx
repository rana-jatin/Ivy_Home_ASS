// The sell-side counterpart to the buyer-facing browser, laid out after
// ivy.homes/sell: an instant offer, a cost-of-waiting breakdown, the promise,
// a three-step process and the questions sellers ask. Unlike the real page,
// every number here is computed live from the corrected dataset - see
// lib/offer.ts for how - and the comparables it shows are real, live listings,
// one per property. The photographs, illustrations, testimonials and press
// logos are the real page's own, from assets/sell.

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDataset } from '../api/store';
import banshidhar from '../assets/sell/banshidhar.webp';
import blessed from '../assets/sell/blessed.webp';
import closing from '../assets/sell/closing.webp';
import et from '../assets/sell/et.png';
import family from '../assets/sell/family.webp';
import hero from '../assets/sell/hero.webp';
import inc42 from '../assets/sell/inc42.png';
import inspection from '../assets/sell/inspection.webp';
import kishore from '../assets/sell/kishore.webp';
import logo from '../assets/sell/logo.svg';
import nirmal from '../assets/sell/nirmal.webp';
import valuation from '../assets/sell/valuation.webp';
import yourstory from '../assets/sell/yourstory.png';
import { inr, inrShort, sqft } from '../lib/corrections';
import {
  BROKERAGE, FALLBACK_YIELD, MIN_MATCHES, UPKEEP_PER_SQFT,
  genuineListings, median, priceOffer, type Ask, type Offer,
} from '../lib/offer';
import { useTitle } from '../lib/useTitle';

const fmt = (n: number) => n.toLocaleString('en-IN');
const title = (s: string) => (s === 'omr' ? 'OMR' : s.replace(/\b\w/g, (c) => c.toUpperCase()));
const rate = (pps: number) => `₹${fmt(Math.round(pps))}/ft²`;
const pct = (share: number) => `${+(share * 100).toFixed(2)}%`;
// Stands in for a figure until the pull lands. A typed-in number here would be
// wrong for any other key, and was wrong for this one.
const Pending = () => <span className="skeleton sp-pending" aria-label="loading" />;

const WORDS = ['live market data', 'zero brokerage', 'no guesswork'];

const STEPS = [
  { when: 'In seconds', title: 'Get an instant offer', image: valuation,
    body: 'Pick your locality, size and carpet area to see an offer backed by live listings. No commitment needed.' },
  { when: 'Within 2 days', title: 'Free home inspection', image: inspection,
    body: 'We visit within 2 days and confirm the offer against the flat itself.' },
  { when: 'Within 14 days', title: 'Close and get paid', image: closing,
    body: 'Close on your schedule and receive payment within 14 days.' },
];

// Quoted as they appear on ivy.homes/sell. `focus` is the object-position that
// keeps faces in frame once the photo is cropped to the card.
const TESTIMONIALS = [
  { name: 'Nirmal Panda', image: nirmal, focus: '50% 22%',
    text: 'I sold my Bangalore flat through Ivy homes after struggling for two months with online listings and real estate agents. Since I lived outside Bangalore, managing the sale was difficult. Ivy made the process smooth and transparent.' },
  { name: 'Banshidhar Rath', image: banshidhar, focus: '32% 30%',
    text: 'Ivy Homes exceeded my expectations in every aspect of selling my home. From the initial contact to the thorough quality check, the team kept me well informed and maintained transparency throughout.' },
  { name: 'Kishore Kumar', image: kishore, focus: '50% 12%',
    text: 'I highly recommend Ivy homes for their exceptional service and expertise. From the initial consultation to the final transaction, their team was incredibly helpful, generous, and professional.' },
];

// Heights differ because the files do: Inc42 is cropped tight, the other two
// sit in wide empty margins, so they need more height to read at the same size.
const PRESS = [
  { name: 'Inc42', src: inc42, height: 30 },
  { name: 'The Economic Times', src: et, height: 62 },
  { name: 'YourStory', src: yourstory, height: 58 },
];

const FAQS: [string, ReactNode][] = [
  ['How is my offer worked out?',
    <>We take the median price per carpet square foot of the live, genuine listings of your size in your
      locality and multiply it by your carpet area. Listings that fail the impossibility checks (a negative
      price, a floor above the building, a date in the future) or were posted from a lead-generation phone
      number are left out, and a flat listed more than once counts once, at its newest asking price.</>],
  ['Which listings count as comparables?',
    <>The same ones the rate is worked out from, so the three shown are different properties and none of them
      is a lead-generation listing. They are the three whose rate sits closest to your offer&apos;s. If fewer
      than {MIN_MATCHES} properties match your size, the rate and the comparables both widen to every size in
      your locality.</>],
  ['Why carpet area, not super built-up?',
    <>Carpet area is the floor you actually use, and it is the one every rate in this app is quoted on. Some
      sources serve area in square metres; those are converted before any rate is worked out.</>],
  ['What goes into the cost of waiting?',
    <>A year of the rent a flat like yours would fetch: the median of live rentals of your size in your
      locality. Where fewer than {MIN_MATCHES} of your size are posted there, it is the locality&apos;s median
      rent per square foot times your carpet area, and with no rentals at all, {pct(FALLBACK_YIELD)} of the
      flat&apos;s value a month. On top of that, {pct(BROKERAGE)} brokerage on the eventual sale and upkeep at
      ₹{UPKEEP_PER_SQFT} per square foot a month. Price risk is left out, because nobody can put a number on it.</>],
  ['Is this the price I will be paid?',
    <>It is an estimate from asking prices, not from registered sales, so treat it as a starting point. The
      inspection confirms it against the flat itself.</>],
  ['Where do the listings come from?',
    <>From the Chennai listings this app pulls, gathered from several property portals. Before any rate is
      worked out, areas served in square metres are converted and records that cannot exist are set aside.</>],
];

// ------------------------------------------------------------------ icons ---

function Icon({ name, size = 18 }: { name: 'search' | 'arrow' | 'chevron'; size?: number }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7.5" /><path d="m20.5 20.5-4.2-4.2" /></>,
    arrow: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

// ------------------------------------------------------------ offer form ---

type FormState = { locality: string; bedroom: string; area: string };

function OfferForm({ id, form, setForm, localities, onAsk }: {
  id: string;
  form: FormState;
  setForm: (f: FormState) => void;
  localities: string[];
  onAsk: (a: Ask) => void;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.locality) onAsk({ locality: form.locality, bedroom: Number(form.bedroom), area: Number(form.area) || 0 });
  };
  return (
    <form className="sp-search" onSubmit={submit}>
      <div className="sp-seg sp-seg-loc">
        <span className="sp-seg-icon"><Icon name="search" size={16} /></span>
        <label htmlFor={`${id}-locality`}>Locality</label>
        <select id={`${id}-locality`} value={form.locality} required disabled={!localities.length}
          onChange={(e) => setForm({ ...form, locality: e.target.value })}>
          <option value="">{localities.length ? 'Choose locality' : 'Loading localities…'}</option>
          {localities.map((l) => <option key={l} value={l}>{title(l)}</option>)}
        </select>
      </div>
      <div className="sp-seg">
        <label htmlFor={`${id}-bedroom`}>Bedrooms</label>
        <select id={`${id}-bedroom`} value={form.bedroom} onChange={(e) => setForm({ ...form, bedroom: e.target.value })}>
          {['1', '2', '3', '4', '5'].map((n) => <option key={n} value={n}>{n} BHK</option>)}
        </select>
      </div>
      <div className="sp-seg">
        <label htmlFor={`${id}-area`}>Carpet area (ft²)</label>
        <input id={`${id}-area`} type="number" min={100} step={10} value={form.area} required
          onChange={(e) => setForm({ ...form, area: e.target.value })} />
      </div>
      <button className="sp-go" type="submit">Get instant offer <Icon name="arrow" size={16} /></button>
    </form>
  );
}

// ------------------------------------------------------------------ page ---

export default function Sell() {
  useTitle('Sell');
  const data = useDataset();
  const [form, setForm] = useState<FormState>({ locality: '', bedroom: '2', area: '1200' });
  const [ask, setAsk] = useState<Ask | null>(null);
  const [word, setWord] = useState(0);
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setWord((w) => (w + 1) % WORDS.length), 4000);
    return () => window.clearInterval(t);
  }, []);

  const localities = useMemo(
    () => (data ? [...new Set(data.listings.map((r) => r.locality))].sort() : []),
    [data],
  );

  // Once per pull: every offer on the page is priced from these.
  const genuine = useMemo(() => (data ? genuineListings(data.listings, data.flags) : []), [data]);

  const offer = useMemo(
    () => (data && ask ? priceOffer(genuine, data.rentals, ask) : null),
    [data, genuine, ask],
  );

  // Before anyone asks, the page shows what an offer looks like for a typical
  // 2 BHK - the median carpet area of genuine ones - in the key's own locality,
  // through the same calculation.
  const example = useMemo(() => {
    if (!data || !localities.length) return null;
    const locality = data.me?.assigned_locality && localities.includes(data.me.assigned_locality)
      ? data.me.assigned_locality
      : localities[0];
    const twos = genuine.filter((r) => r.locality === locality && r.bedroom === 2);
    const area = Math.round(median(twos.map((r) => r.carpet_area_sqft)) / 10) * 10 || 1000;
    return priceOffer(genuine, data.rentals, { locality, bedroom: 2, area });
  }, [data, genuine, localities]);

  const onAsk = (a: Ask) => {
    setAsk(a);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('offer-card')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
  const formProps = { form, setForm, localities, onAsk };
  // Calls to action further down the page bring the seller back to the hero's form.
  const toForm = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelector('.sp-hero')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    document.getElementById('hero-locality')?.focus({ preventScroll: true });
  };

  const shown: Offer | null = offer ?? (ask ? null : example);
  const isExample = !offer;
  const describe = (o: Offer) => `${o.ask.bedroom} BHK · ${sqft(o.ask.area)} · ${title(o.ask.locality)}`;

  return (
    <main className="sell-page">
      {/* ---- hero ---- */}
      <section className="sp-hero-wrap">
        <div className="sp-hero">
          <img className="sp-hero-img" src={hero} alt="" width={1000} height={1656} />
          <div className="sp-hero-shade" />
          <div className="sp-hero-copy">
            <h1>
              Sell your home instantly<br />with{' '}
              <span className="sr-only">{WORDS[0]}</span>
              <span key={word} className="sp-word" aria-hidden="true">{WORDS[word]}</span>
            </h1>
            <p>
              An offer priced from {data ? `${fmt(genuine.length)} ` : ''}genuine Chennai listings - live, and one per
              property - with the comparables behind it on the same page.
            </p>
            <OfferForm id="hero" {...formProps} />
          </div>
        </div>
      </section>

      {/* ---- stats ---- */}
      <section className="sp-stats">
        <div className="sp-wrap">
          <div className="sp-trust">
            <div className="sp-avatars">
              {TESTIMONIALS.map((t) => (
                <img key={t.name} src={t.image} alt="" width={36} height={36} style={{ objectPosition: t.focus }} />
              ))}
            </div>
            <p>Homeowners <span className="muted">have sold with</span> <span className="sp-ivy">Ivy</span></p>
          </div>
          <div className="sp-stat-row">
            <div><strong>{data ? fmt(genuine.length) : <Pending />} <small>properties</small></strong><p>Live, genuine, counted once</p></div>
            <div><strong>{data ? localities.length : <Pending />} <small>localities</small></strong><p>Covered</p></div>
            <div><strong>{data ? fmt(data.flags.fakeIds.size) : <Pending />} <small>listings</small></strong><p>Lead-gen, kept out of every offer</p></div>
          </div>
        </div>
      </section>

      {/* ---- press ---- */}
      <section className="sp-press">
        <p>In the news</p>
        <div>
          {PRESS.map((p) => <img key={p.name} src={p.src} alt={p.name} loading="lazy" style={{ height: p.height }} />)}
        </div>
      </section>

      {/* ---- the offer ---- */}
      <section id="offer" className="sp-muted sp-section">
        <div className="sp-wrap">
          <p className="sp-label">What you receive</p>
          <h2 className="sp-h2">A personalised offer,<br />not a generic estimate.</h2>
          <p className="sp-lede">
            Every number below is worked out from the listings in your locality, and each comparable opens the
            record it came from.
          </p>

          <div id="offer-card" className="sp-offer-card">
            <p className="sr-only" role="status">
              {offer ? `Estimated instant offer ${inrShort(offer.estimate)}` : ask ? `No genuine live listings in ${title(ask.locality)}` : ''}
            </p>
            <div className="sp-offer-head">
              <img src={logo} alt="Ivy Homes" width={110} height={24} />
              <span className={isExample ? 'sp-tag' : 'sp-tag live'}>{isExample ? 'Example offer' : 'Your instant offer'}</span>
            </div>

            {ask && !offer && data && (
              <p className="sp-empty">
                No genuine live listings in {title(ask.locality)} yet - try another locality.
              </p>
            )}
            {ask && !data && (
              <p className="sp-empty">
                Calculating valuation for {title(ask.locality)} as soon as live data loads…
              </p>
            )}

            {shown ? (
              <>
                <h3>{isExample ? `A typical 2 BHK in ${title(shown.ask.locality)}` : `Your ${shown.ask.bedroom} BHK in ${title(shown.ask.locality)}`}</h3>
                <p className="sp-offer-intro">
                  {isExample
                    ? <>Choose your locality, size and carpet area above to see your own. This one is priced against </>
                    : <>Your flat is priced against </>}
                  <strong>{fmt(shown.poolSize)} properties</strong>
                  {shown.widened
                    ? <>: every live, genuine listing in {title(shown.ask.locality)}, of any size, as fewer
                        than {MIN_MATCHES} are {shown.ask.bedroom} BHK.</>
                    : <>: every live, genuine {shown.ask.bedroom} BHK listing in {title(shown.ask.locality)},
                        each counted once.</>}
                </p>

                <div className="sp-offer-figure">
                  <div>
                    <span>Estimated instant offer</span>
                    <strong>{inrShort(shown.estimate)}</strong>
                  </div>
                  <p>{rate(shown.pps)} × {sqft(shown.ask.area)} carpet area</p>
                </div>

                <div className="sp-tiles">
                  <div><p>Locality</p><strong>{title(shown.ask.locality)}</strong></div>
                  <div><p>Configuration</p><strong>{shown.ask.bedroom} BHK · {sqft(shown.ask.area)}</strong></div>
                  <div><p>Market rate used</p><strong>{rate(shown.pps)}</strong></div>
                  <div><p>Brokerage</p><strong>₹0 <em>vs ~{inrShort(shown.brokerage)}</em></strong></div>
                </div>

                <div className="scroll">
                  <table className="sp-table">
                    <caption>The comparable listings behind this number</caption>
                    <thead>
                      <tr><th>Listing</th><th>Config</th><th className="num">Carpet area</th><th className="num">Rate</th><th className="num">Price</th></tr>
                    </thead>
                    <tbody>
                      {shown.comps.map((c) => (
                        <tr key={c.listing_id}>
                          <td>
                            <Link to={`/listings/${encodeURIComponent(c.listing_id)}`}>{c.apartment_name}</Link>
                            <span className="mono muted"> {c.listing_id}</span>
                          </td>
                          <td data-label="Config">{c.bedroom} BHK</td>
                          <td className="num" data-label="Carpet area">{sqft(c.carpet_area_sqft)}</td>
                          <td className="num" data-label="Rate">{rate(c.price_per_sqft)}</td>
                          <td className="num" data-label="Price">{inrShort(c.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : !data ? (
              <div style={{ padding: '36px 0', textAlign: 'center' }}>
                <div className="skeleton" style={{ width: 140, height: 20, margin: '0 auto 16px', borderRadius: 4 }} />
                <div className="skeleton" style={{ width: 240, height: 40, margin: '0 auto 16px', borderRadius: 6 }} />
                <div className="skeleton" style={{ width: '80%', height: 60, margin: '0 auto', borderRadius: 8 }} />
                <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
                  Connecting to Chennai market feed & calculating valuation…
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* ---- cost of waiting ---- */}
      <section className="sp-section">
        <div className="sp-wrap sp-split">
          <div>
            <p className="sp-label">The real numbers</p>
            <h2 className="sp-h2">Every month unsold is a cost you are absorbing.</h2>
            <p className="sp-lede">
              Most sellers think about price. Few count what waiting actually costs. Here is what one year on
              the open market looks like for {isExample ? 'a typical 2 BHK' : 'your flat'}.
            </p>
          </div>
          {shown ? (
            <div className="sp-cost">
              <div className="sp-cost-head">
                <span className={isExample ? 'sp-tag' : 'sp-tag live'}>{isExample ? 'Illustrative' : 'Your flat'}</span>
                <strong>{describe(shown)} · {inrShort(shown.estimate)} market value</strong>
              </div>
              <h3>The hidden cost of waiting 1 year</h3>
              <CostRow what="Maintenance and upkeep" how={`₹${UPKEEP_PER_SQFT}/ft² × ${sqft(shown.ask.area)} × 12 months`} cost={inr(shown.maintenance)} />
              <CostRow what="Lost rental income" how={rentWorking(shown)} cost={inr(shown.lostRent)} />
              <CostRow what="Broker fee on eventual sale" how={`${pct(BROKERAGE)} of ${inrShort(shown.estimate)}`} cost={inr(shown.brokerage)} />
              <CostRow what="Price risk" how="The market can soften; buyers negotiate down" cost="Uncertain" />
              <div className="sp-cost-total">
                <div><strong>Total estimated cost of waiting 1 year</strong><p>Before price risk</p></div>
                <strong className="sp-yellow">{inrShort(shown.totalCost)}</strong>
              </div>
              <div className="sp-cost-foot">
                <div><strong>₹0</strong><p>in brokerage</p></div>
                <div><strong>2</strong><p>days to inspection</p></div>
                <div><strong>14</strong><p>days to payment</p></div>
              </div>
            </div>
          ) : !data ? (
            <div className="sp-cost" style={{ display: 'grid', gap: 12, padding: 24 }}>
              <div className="skeleton" style={{ width: 120, height: 18, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: '70%', height: 28, borderRadius: 4 }} />
              <div className="skeleton" style={{ width: '100%', height: 44, borderRadius: 6 }} />
              <div className="skeleton" style={{ width: '100%', height: 44, borderRadius: 6 }} />
              <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
                Calculating cost of waiting from live rental yields…
              </p>
            </div>
          ) : (
            <div className="sp-cost"><p className="sp-empty">Pick a locality with live listings to see this worked out.</p></div>
          )}
        </div>
      </section>

      {/* ---- promise ---- */}
      <section className="sp-dark sp-section">
        <div className="sp-wrap">
          <p className="sp-label sp-yellow">Our promise</p>
          <h2 className="sp-h2">Faster. Fairer.<br />Fully taken care of.</h2>
          <p className="sp-lede">A fair offer, shown with its working, and everything in between handled for you.</p>
          <div className="sp-promise">
            <div className="sp-promise-art">
              <img src={blessed} alt="A couple who sold their home with Ivy Homes" width={772} height={703} loading="lazy" />
            </div>
            <div className="sp-promise-list">
              {[
                ['Priced from the market, not a guess', 'The rate is the median price per carpet square foot of live, genuine listings of your size in your locality, each property counted once.'],
                ['Comparables you can open', 'Every listing shown beside your offer is live, a different property, and none was posted from a lead-generation number.'],
                ['Like compared with like', 'Areas served in square metres are converted before any rate is worked out.'],
                ['Zero brokerage', `No commission on the offer, where the open market would take about ${pct(BROKERAGE)}.`],
                ['Your sale, your terms', 'Close on your schedule; payment lands within 14 days.'],
              ].map(([t, b], i) => (
                <div key={t}>
                  <span>0{i + 1}</span>
                  <div><h3>{t}</h3><p>{b}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---- how it works ---- */}
      <section className="sp-section">
        <div className="sp-wrap">
          <p className="sp-label">How it works</p>
          <h2 className="sp-h2">From first offer to<br />final cheque.</h2>
          <p className="sp-lede">Three steps, and the first one takes seconds.</p>
          <div className="sp-steps">
            {STEPS.map((s, i) => (
              <article key={s.title}>
                <div className="sp-step-art">
                  <img src={s.image} alt="" width={1000} height={1000} loading="lazy" />
                </div>
                <div className="sp-step-body">
                  <div className="sp-step-top"><span>{i + 1}</span><em>{s.when}</em></div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---- by your side ---- */}
      <section className="sp-section sp-muted">
        <div className="sp-wrap sp-side">
          <div>
            <p className="sp-label">By your side</p>
            <h2 className="sp-h2">Hands-on help<br />at every step.</h2>
            <p className="sp-lede">
              A dedicated team stays with you from first offer to final payment, on call, on WhatsApp, or in
              person. You&apos;re never figuring it out alone.
            </p>
            <button type="button" className="sp-go sp-side-go" onClick={toForm}>
              Get your instant offer <Icon name="arrow" size={16} />
            </button>
          </div>
          <img src={family} alt="A family who sold their home with Ivy Homes" width={939} height={569} loading="lazy" />
        </div>
      </section>

      {/* ---- testimonials ---- */}
      <section className="sp-section">
        <div className="sp-wrap">
          <p className="sp-label">Testimonials</p>
          <h2 className="sp-h2">Families who sold<br />with Ivy Homes.</h2>
          <div className="sp-quotes">
            {TESTIMONIALS.map((t) => (
              <figure key={t.name}>
                <img src={t.image} alt={t.name} loading="lazy" style={{ objectPosition: t.focus }} />
                <figcaption>
                  <strong>{t.name}</strong>
                  <span>Sold with Ivy Homes</span>
                </figcaption>
                <blockquote>{t.text}</blockquote>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ---- faq ---- */}
      <section className="sp-section sp-rule">
        <div className="sp-wrap sp-faq">
          <div>
            <p className="sp-label">FAQ</p>
            <h2 className="sp-h2">Questions we hear most often.</h2>
            <p className="sp-lede">Straight answers about where your number comes from.</p>
          </div>
          <div className="sp-faq-list">
            {FAQS.map(([q, a], i) => (
              <div key={q}>
                <button type="button" aria-expanded={openFaq === i} aria-controls={`faq-${i}`}
                  onClick={() => setOpenFaq(openFaq === i ? -1 : i)}>
                  {q}<Icon name="chevron" size={20} />
                </button>
                {openFaq === i && <p id={`faq-${i}`}>{a}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- closing call to action ---- */}
      <section className="sp-cta">
        <div className="sp-wrap">
          <p className="sp-label">Ready to begin?</p>
          <h2 className="sp-h2">Find out what your home is worth today.</h2>
          <p className="sp-lede">Three details - locality, size and carpet area - are all it takes to see your instant offer.</p>
          <div className="sp-cta-form"><OfferForm id="cta" {...formProps} /></div>
        </div>
      </section>
    </main>
  );
}

/** The working behind the lost-rent figure, in whichever form offer.ts arrived at it. */
function rentWorking(o: Offer) {
  const where = title(o.ask.locality);
  const r = o.rent;
  switch (r.kind) {
    case 'size':
      return `${inr(r.monthly)}/month, median of ${fmt(r.rentals)} live ${o.ask.bedroom} BHK rentals in ${where} × 12`;
    case 'area':
      return `₹${r.perSqft.toFixed(1)}/ft² × ${sqft(o.ask.area)} × 12, the median of ${fmt(r.rentals)} live rentals in ${where}, as too few are ${o.ask.bedroom} BHK`;
    case 'yield':
      return `No live rentals in ${where}: ${pct(FALLBACK_YIELD)} of value a month × 12`;
  }
}

function CostRow({ what, how, cost }: { what: string; how: string; cost: string }) {
  return (
    <div className="sp-cost-row">
      <div><p>{what}</p><span>{how}</span></div>
      <strong>{cost}</strong>
    </div>
  );
}
