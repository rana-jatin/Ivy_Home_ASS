import { Link, useLocation } from 'react-router-dom';
import { useTitle } from '../lib/useTitle';

export default function NotFound() {
  useTitle('Not found');
  const { pathname } = useLocation();
  return (
    <main>
      <h1>Nothing at this address</h1>
      <p className="sub">
        There is no screen at <span className="mono">{pathname}</span>.
      </p>
      <p>
        <Link to="/listings">Browse listings</Link> · <Link to="/rentals">Rentals</Link> ·{' '}
        <Link to="/projects">Projects</Link> · <Link to="/insights">Insights</Link>
      </p>
    </main>
  );
}
