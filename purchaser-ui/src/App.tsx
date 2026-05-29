import { useState } from 'react';
import { QRScanner } from './QRScanner';
import { ProvenanceDisplay } from './ProvenanceDisplay';

type Page = 'scan' | 'report';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('scan');
  const [scannedProductId, setScannedProductId] = useState<string | null>(null);

  function handleProductScanned(productId: string) {
    setScannedProductId(productId);
    setCurrentPage('report');
  }

  function handleScanAgain() {
    setScannedProductId(null);
    setCurrentPage('scan');
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1>Purchaser Portal</h1>
        <span className="subtitle">
          Cryptographic Provenance for Canadian Supply Chains
        </span>
      </header>

      <nav className="app-nav">
        <button
          onClick={handleScanAgain}
          className={`nav-btn ${currentPage === 'scan' ? 'active' : ''}`}
        >
          Scan QR Code
        </button>
        <button
          onClick={() => setCurrentPage('report')}
          disabled={!scannedProductId}
          className={`nav-btn ${currentPage === 'report' ? 'active' : ''}`}
        >
          Provenance Report
        </button>
      </nav>

      <main className="app-main">
        <div className="fade-in">
          {currentPage === 'scan' && (
            <ScanPage onProductScanned={handleProductScanned} />
          )}
          {currentPage === 'report' && (
            <ReportPage
              productId={scannedProductId}
              onScanAgain={handleScanAgain}
            />
          )}
        </div>
      </main>

      <footer className="app-footer">
        Purchaser Portal — Verify Canadian Content Claims
      </footer>
    </div>
  );
}

function ScanPage({ onProductScanned }: { onProductScanned: (id: string) => void }) {
  const [manualId, setManualId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = manualId.trim();
    if (!UUID_REGEX.test(trimmed)) {
      setError('Please enter a valid UUID product ID.');
      return;
    }
    onProductScanned(trimmed);
  }

  return (
    <div>
      <h2>Scan Product QR Code</h2>
      <p>
        Use your device camera to scan a product QR code, or enter a product ID manually.
      </p>

      <div style={{ marginBottom: '2rem' }}>
        <QRScanner onProductScanned={onProductScanned} />
      </div>

      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
        <h3>Or enter Product ID manually</h3>
        <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
            className="form-input"
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary">
            Look Up
          </button>
        </form>
        {error && (
          <p className="form-error-text" style={{ marginTop: '0.5rem' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function ReportPage({ productId, onScanAgain }: { productId: string | null; onScanAgain: () => void }) {
  if (!productId) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📦</p>
        <p>No product scanned yet.</p>
        <button onClick={onScanAgain} className="btn btn-primary">
          Scan a Product
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2>Provenance Report</h2>
      <ProvenanceDisplay productId={productId} onScanAgain={onScanAgain} />
    </div>
  );
}

export default App;
