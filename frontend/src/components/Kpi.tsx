import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** One number, labelled, optionally linking to the records behind it. */
export default function Kpi({ k, v, n, to }: { k: string; v: string; n?: ReactNode; to?: string }) {
  const body = (
    <>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {n && <div className="n">{n}</div>}
    </>
  );
  return to ? <Link className="kpi link" to={to}>{body}</Link> : <div className="kpi">{body}</div>;
}
