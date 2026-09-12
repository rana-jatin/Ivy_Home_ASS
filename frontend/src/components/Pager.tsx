const fmt = (n: number) => n.toLocaleString('en-IN');

/** The slice of `items` on page `page`, with the page clamped into range. */
export function paginate<T>(items: T[], page: number, perPage: number) {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(Math.max(1, page), pages);
  return { pages, current, slice: items.slice((current - 1) * perPage, current * perPage) };
}

/** 1 … 4 5 [6] 7 8 … 128 - null marks a gap. A gap of one page shows the page instead. */
export function pageNumbers(current: number, pages: number): (number | null)[] {
  const wanted = [...new Set([1, current - 2, current - 1, current, current + 1, current + 2, pages])]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let prev = 0;
  for (const n of wanted) {
    if (n - prev === 2) out.push(prev + 1);
    else if (n - prev > 2) out.push(null);
    out.push(n);
    prev = n;
  }
  return out;
}

export default function Pager({
  current, pages, total, perPage, onPage,
}: {
  current: number;
  pages: number;
  total: number;
  perPage: number;
  onPage: (page: number) => void;
}) {
  const from = total === 0 ? 0 : (current - 1) * perPage + 1;
  const to = Math.min(total, current * perPage);
  return (
    <nav className="pager" aria-label="Pages">
      <span className="count">
        {total === 0 ? 'No results' : `Showing ${fmt(from)}–${fmt(to)} of ${fmt(total)}`}
      </span>
      {pages > 1 && (
        <div className="pagebtns">
          <button disabled={current <= 1} onClick={() => onPage(current - 1)}>Previous</button>
          {pageNumbers(current, pages).map((n, i) =>
            n === null ? (
              <span key={`gap-${i}`} className="gap" aria-hidden="true">…</span>
            ) : (
              <button
                key={n}
                className={n === current ? 'current' : ''}
                aria-current={n === current ? 'page' : undefined}
                aria-label={`Page ${n}`}
                onClick={() => onPage(n)}
              >
                {n}
              </button>
            ),
          )}
          <button disabled={current >= pages} onClick={() => onPage(current + 1)}>Next</button>
        </div>
      )}
    </nav>
  );
}
