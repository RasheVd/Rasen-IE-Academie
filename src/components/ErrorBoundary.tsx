import { Component, type ReactNode } from 'react';
import { logError } from '../store';

/** Bila satu halaman gagal tampil: pesan jelas, tombol muat ulang, dan galat tercatat untuk admin. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    logError(`Halaman gagal tampil: ${error.message}`, `${error.stack ?? ''}\n${info.componentStack ?? ''}`);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="auth"><div className="auth-card" role="alert">
        <h1 className="h-section">Halaman ini gagal tampil</h1>
        <p className="muted">Galatnya sudah tercatat untuk admin. Muat ulang halaman; bila masih gagal, kabari admin lewat WhatsApp.</p>
        <div className="row wrap">
          <button className="btn primary" onClick={() => location.reload()}>Muat ulang</button>
          <a className="btn" href="/beranda">Ke beranda</a>
        </div>
      </div></div>
    );
  }
}
