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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        backgroundColor: '#1a1a2e',
        color: '#fff',
        padding: '1rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>
          Purchaser Interface
        </h1>
        <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>
          Cryptographic Provenance for Canadian Supply Chains
        </span>
      </header>

      <nav style={{
        backgroundColor: '#16213e',
        padding: '0.5rem 2rem',
        display: 'flex',
        gap: '1rem',
      }}>
        <button
          onClick={handleScanAgain}
          style={{
            background: currentPage === 'scan' ? '#0f3460' : 'transparent',
            color: '#fff',
            border: '1px solid #0f3460',
            borderRadius: '4px',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontWeight: currentPage === 'scan' ? 'bold' : 'normal',
          }}
        >
          Scan QR Code
        </button>
        <button
          onClick={() => setCurrentPage('report')}
          disabled={!scannedProductId}
          style={{
            background: currentPage === 'report' ? '#0f3460' : 'transparent',
            color: '#fff',
            border: '1px solid #0f3460',
            borderRadius: '4px',
            padding: '0.5rem 1rem',
            cursor: scannedProductId ? 'pointer' : 'not-allowed',
            fontWeight: currentPage === 'report' ? 'bold' : 'normal',
            opacity: scannedProductId ? 1 : 0.5,
          }}
        >
          Provenance Report
        </button>
      </nav>

      <main style={{ flex: 1, padding: '2rem', maxWidth: '900px', width: '100%', margin: '0 auto' }}>
        {currentPage === 'scan' && (
          <ScanPage onProductScanned={handleProductScanned} />
        )}
        {currentPage === 'report' && (
          <ReportPage
            productId={scannedProductId}
            onScanAgain={handleScanAgain}
          />
        )}
      </main>

      <footer style={{
        backgroundColor: '#1a1a2e',
        color: '#fff',
        padding: '0.75rem 2rem',
        textAlign: 'center',
        fontSize: '0.8rem',
        opacity: 0.7,
      }}>
        Purchaser Interface &mdash; Verify Canadian Content Claims
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

      <div style={{ borderTop: '1px solid #eee', paddingTop: '1.5rem' }}>
        <h3>Or enter Product ID manually</h3>
        <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
            style={{
              flex: 1,
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '0.9rem',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#0f3460',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Look Up
          </button>
        </form>
        {error && (
          <p style={{ color: '#dc3545', marginTop: '0.5rem', fontSize: '0.85rem' }}>
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
        <p>No product scanned yet.</p>
        <button
          onClick={onScanAgain}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#0f3460',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
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
