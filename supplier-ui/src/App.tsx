import { useState, useEffect } from 'react';
import nacl from 'tweetnacl';
import { QRCodeSVG } from 'qrcode.react';
import { AttestationForm, AttestationFormData } from './AttestationForm';
import { SupplierRegistration } from './SupplierRegistration';
import { canonicalize } from './crypto';

type Page = 'submit' | 'history' | 'register';

interface HistoryEntry {
  productName: string;
  productId: string;
  attestationId: string;
  contentHash: string;
  timestamp: string;
}

interface StoredSupplier {
  id: string;
  name: string;
  publicKey: string;
  secretKey: string;
  location: string;
}

function getStoredSupplier(): StoredSupplier | null {
  try {
    const raw = localStorage.getItem('supplier');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem('submissionHistory');
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveHistoryEntry(entry: HistoryEntry) {
  const history = getHistory();
  history.unshift(entry);
  localStorage.setItem('submissionHistory', JSON.stringify(history));
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('submit');
  const [historyVersion, setHistoryVersion] = useState(0);

  function handlePageChange(page: Page) {
    setCurrentPage(page);
    if (page === 'history') {
      setHistoryVersion((v) => v + 1);
    }
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1>Supplier Portal</h1>
        <span className="subtitle">
          Cryptographic Provenance for Canadian Supply Chains
        </span>
      </header>

      <nav className="app-nav">
        <button
          onClick={() => handlePageChange('submit')}
          className={`nav-btn ${currentPage === 'submit' ? 'active' : ''}`}
        >
          Submit Attestation
        </button>
        <button
          onClick={() => handlePageChange('history')}
          className={`nav-btn ${currentPage === 'history' ? 'active' : ''}`}
        >
          Submission History
        </button>
        <button
          onClick={() => handlePageChange('register')}
          className={`nav-btn ${currentPage === 'register' ? 'active' : ''}`}
        >
          Register Supplier
        </button>
      </nav>

      <main className="app-main">
        <div className="fade-in" style={{ display: currentPage === 'submit' ? 'block' : 'none' }}>
          <SubmitAttestationPage />
        </div>
        <div className="fade-in" style={{ display: currentPage === 'history' ? 'block' : 'none' }}>
          <HistoryPage refreshKey={historyVersion} />
        </div>
        <div className="fade-in" style={{ display: currentPage === 'register' ? 'block' : 'none' }}>
          <SupplierRegistration />
        </div>
      </main>

      <footer className="app-footer">
        Supplier Portal — Ed25519 Signed Attestations
      </footer>
    </div>
  );
}

function SubmitAttestationPage() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ id: string; contentHash: string; productId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formResetKey, setFormResetKey] = useState(0);

  async function handleSubmit(data: AttestationFormData) {
    setSubmitting(true);
    setResult(null);
    setError(null);

    try {
      const stored = getStoredSupplier();

      let keyPair: nacl.SignKeyPair;
      let pubKeyHex: string;
      let supplierId: string;

      if (stored) {
        const secretKeyBytes = new Uint8Array(
          (stored.secretKey.match(/.{1,2}/g) || []).map(b => parseInt(b, 16))
        );
        keyPair = { publicKey: secretKeyBytes.slice(32), secretKey: secretKeyBytes };
        pubKeyHex = stored.publicKey;
        supplierId = stored.id;
      } else {
        keyPair = nacl.sign.keyPair();
        pubKeyHex = Array.from(keyPair.publicKey)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        supplierId = pubKeyHex;
      }

      const payload = {
        productName: data.productName,
        productId: data.productId,
        supplierId,
        location: data.location,
        materialCost: data.materialCost,
        labourCost: data.labourCost,
        currency: 'CAD',
        outputQuantity: data.outputQuantity,
        outputUnit: data.outputUnit,
        timestamp: new Date().toISOString(),
        isTransformation: data.isTransformation,
        inputs: data.inputReferences.map((ref) => ({
          attestationId: ref.attestationId,
          quantityUsed: ref.quantityUsed,
          unit: ref.unit,
        })),
      };

      const message = canonicalize(payload);
      const sig = nacl.sign.detached(message, keyPair.secretKey);
      const sigHex = Array.from(sig)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const response = await fetch('/api/attestations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload,
          signature: sigHex,
          publicKey: pubKeyHex,
        }),
      });

      if (response.ok) {
        const body = await response.json();
        setResult({ id: body.id, contentHash: body.contentHash, productId: data.productId });
        setFormResetKey((k) => k + 1);

        saveHistoryEntry({
          productName: data.productName,
          productId: data.productId,
          attestationId: body.id,
          contentHash: body.contentHash,
          timestamp: new Date().toISOString(),
        });
      } else {
        const body = await response.json().catch(() => null);
        const errorMessage = body?.error || `Server error (${response.status})`;
        setError(errorMessage);
      }
    } catch (err: unknown) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setError('Submission could not be completed. Please check your network connection and try again.');
      } else {
        setError('Submission could not be completed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2>Submit Attestation</h2>
      <p>
        Compose and submit a digitally signed attestation for your supply chain step.
        {getStoredSupplier()
          ? ' Using registered supplier keypair.'
          : ' Each submission generates a new Ed25519 keypair and signs the canonicalized payload.'}
      </p>

      {result && (
        <div className="alert alert-success">
          <span className="alert-icon">✓</span>
          <div className="alert-content">
            <div className="alert-title">Attestation submitted successfully!</div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              <div>ID: <code>{result.id}</code></div>
              <div>Content Hash: <code>{result.contentHash}</code></div>
            </div>
            <div className="qr-container">
              <QRCodeSVG value={result.productId} size={128} />
              <span className="qr-label">Product ID QR Code</span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <span className="alert-icon">⚠</span>
          <div className="alert-content">
            <div className="alert-title">Error</div>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>{error}</p>
          </div>
        </div>
      )}

      <div className="card">
        <AttestationForm onSubmit={handleSubmit} disabled={submitting} resetKey={formResetKey} />
      </div>
    </div>
  );
}

function HistoryPage({ refreshKey }: { refreshKey: number }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setHistory(getHistory());
  }, [refreshKey]);

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(text);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  return (
    <div>
      <h2>Submission History</h2>
      <p>View previously submitted attestations and their status.</p>

      {history.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <p style={{ margin: 0 }}>No submissions yet. Submit your first attestation to see it here.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Product Name</th>
                <th>Product ID</th>
                <th>Attestation ID</th>
                <th>Timestamp</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry, idx) => (
                <tr key={idx}>
                  <td>{entry.productName}</td>
                  <td>
                    <code title={entry.productId}>{entry.productId.slice(0, 12)}…</code>
                  </td>
                  <td>
                    <code title={entry.attestationId}>{entry.attestationId.slice(0, 12)}…</code>
                  </td>
                  <td>{new Date(entry.timestamp).toLocaleString()}</td>
                  <td>
                    <button
                      onClick={() => copyToClipboard(entry.attestationId)}
                      className={`btn btn-sm ${copiedId === entry.attestationId ? 'btn-success' : 'btn-secondary'}`}
                    >
                      {copiedId === entry.attestationId ? '✓ Copied' : 'Copy ID'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
