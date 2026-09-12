// What a screen shows while the dataset it needs is not in memory yet.

import { useData, useReload } from '../api/store';

export default function DataPending() {
  const s = useData();
  const reload = useReload();

  if (s.status === 'error') {
    return (
      <main>
        <div className="note bad">
          <strong>Could not load the dataset.</strong>
          <div style={{ marginTop: 6 }}>{s.message}</div>
          <p style={{ marginBottom: 0 }}>
            <button onClick={reload}>Try again</button>
          </p>
        </div>
      </main>
    );
  }

  if (s.status !== 'loading') {
    return (
      <main>
        <p className="muted">Opening the local copy of the city…</p>
      </main>
    );
  }

  const { loaded, declared, stage } = s.progress;
  // The bar is drawn against the declared total, which is itself an
  // undercount - so it reaches 100% and keeps going. That is the bug, visible.
  const pct = declared ? Math.min(100, Math.round((loaded / declared) * 100)) : 0;
  return (
    <main>
      <h1>Pulling the dataset</h1>
      <p className="sub">
        Every filter in this app runs over a complete local snapshot, because the server&apos;s
        price, furnishing and project filters are accepted and then ignored. This happens once; the
        copy is kept in the browser, so a reload opens straight away.
      </p>
      <div className="card" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span>{stage}</span>
          <span className="mono">{loaded} records</span>
        </div>
        <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        {declared > 0 && loaded > declared && (
          <p className="muted" style={{ fontSize: 13, marginBottom: 0, marginTop: 10 }}>
            Past 100%: the endpoint reported <code>total: {declared}</code> and has already
            served {loaded}. Paging stops on <code>has_more</code>, never on <code>total</code>.
          </p>
        )}
      </div>
    </main>
  );
}
