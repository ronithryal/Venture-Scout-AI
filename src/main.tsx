import { StrictMode, Component } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', background: '#09090b', color: '#f4f4f5', minHeight: '100vh' }}>
          <h2 style={{ color: '#f87171', marginBottom: 12 }}>App crashed — React render error</h2>
          <pre style={{ color: '#a1a1aa', whiteSpace: 'pre-wrap', fontSize: 13 }}>{err.message}\n\n{err.stack}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16, padding: '8px 16px', background: '#27272a', color: '#f4f4f5', border: '1px solid #3f3f46', borderRadius: 6, cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
