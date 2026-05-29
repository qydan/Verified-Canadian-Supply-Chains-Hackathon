import { useState } from 'react';
import nacl from 'tweetnacl';
import { QRCodeSVG } from 'qrcode.react';
import { AttestationForm, AttestationFormData } from './AttestationForm';
import { SupplierRegistration } from './SupplierRegistration';
import { SupplierDashboard } from './SupplierDashboard';
import { canonicalize } from './crypto';

type Page = 'dashboard' | 'submit' | 'register';

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

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [dashboardVersion, setDashboardVersion] = useState(0);

  function handlePageChange(page: Page) {
    setCurrentPage(page);
    if (page === 'dashboard') {
      setDashboardVersion((v) => v + 1);
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
          onClick={() => handlePageChange('dashboard')}
          className={`nav-btn ${currentPage === 'dashboard' ? 'active' : ''}`}
        >
          Dashboard
        </button>
        <button
          onClick={() => handlePageChange('submit')}
          className={`nav-btn ${currentPage === 'submit' ? 'active' : ''}`}
        >
          Submit Attestation
        </button>
        <button
          onClick={() => handlePageChange('register')}
          className={`nav-btn ${currentPage === 'register' ? 'active' : ''}`}
        >
          Identity
        </button>
      </nav>

      <main className="app-main">
        <div className="fade-in" style={{ display: currentPage === 'dashboard' ? 'block' : 'none' }}>
          <SupplierDashboard key={dashboardVersion} />
        </div>
        <div className="fade-in" style={{ display: currentPage === 'submit' ? 'block' : 'none' }}>
          <SubmitAttestationPage onSubmitted={() => setDashboardVersion((v) => v + 1)} />
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

function SubmitAttestationPage({ onSubmitted }: { onSubmitted?: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ id: string; contentHash: string; productId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formResetKey, setFormResetKey] = useState(0);

  const stored = getStoredSupplier();

  // Must be signed in with a secret key to submit
  if (!stored || !stored.secretKey) {
    return (
      <div>
        <h2>Submit Attestation</h2>
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔒</div>
          <h3 style={{ marginBottom: '0.5rem' }}>Sign In Required</h3>
          <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>
            {!stored
              ? 'You must register or sign in before submitting attestations.'
              : 'You are signed in as read-only. Provide your secret key in the Identity tab to enable signing.'}
          </p>
        </div>
      </div>
    );
  }

  async function handleSubmit(data: AttestationFormData) {
    setSubmitting(true);
    setResult(null);
    setError(null);

    try {
      if (!stored || !stored.secretKey) return;
      const secretKeyBytes = new Uint8Array(
        (stored.secretKey.match(/.{1,2}/g) || []).map(b => parseInt(b, 16))
      );
      const keyPair: nacl.SignKeyPair = { publicKey: secretKeyBytes.slice(32), secretKey: secretKeyBytes };
      const pubKeyHex = stored.publicKey;
      const supplierId = stored.id;

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
        onSubmitted?.();
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
        Signing as <strong>{stored.name}</strong>.
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

export default App;
