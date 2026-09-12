import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * One screen failing to render should not blank the whole app. The header
 * stays, and moving to another screen resets the boundary.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('screen crashed:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main>
        <div className="note bad">
          <strong>This screen hit an error and could not be shown.</strong>
          <div className="mono" style={{ marginTop: 6 }}>{error.message}</div>
          <p style={{ marginBottom: 0 }}>
            <button onClick={() => window.location.reload()}>Reload</button>{' '}
            <Link to="/listings" style={{ marginLeft: 10 }}>Go to listings</Link>
          </p>
        </div>
      </main>
    );
  }
}
