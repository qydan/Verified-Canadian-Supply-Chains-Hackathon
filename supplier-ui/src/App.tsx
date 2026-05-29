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
          Supplier Interface
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
          onClick={() => setCurrentPage('submit')}
          style={{
            background: currentPage === 'submit' ? '#0f3460' : 'transparent',
            color: '#fff',
            border: '1px solid #0f3460',
            borderRadius: '4px',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontWeight: currentPage === 'submit' ? 'bold' : 'normal',
          }}
        >
          Submit Attestation
        </button>
        <button
          onClick={() => setCurrentPage('history')}
          style={{
            background: currentPage === 'history' ? '#0f3460' : 'transparent',
            color: '#fff',
            border: '1px solid #0f3460',
            borderRadius: '4px',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontWeight: currentPage === 'history' ? 'bold' : 'normal',
          }}
        >
          Submission History
        </button>
        <button
          onClick={() => setCurrentPage('register')}
          style={{
            background: currentPage === 'register' ? '#0f3460' : 'transparent',
            color: '#fff',
            border: '1px solid #0f3460',
            borderRadius: '4px',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontWeight: currentPage === 'register' ? 'bold' : 'normal',
          }}
        >
          Register Supplier
        </button>
      </nav>

      <main style={{ flex: 1, padding: '2rem', maxWidth: '800px', width: '100%', margin: '0 auto' }}>
        {currentPage === 'submit' && <SubmitAttestationPage />}
        {currentPage === 'history' && <HistoryPage />}
        {currentPage === 'register' && <SupplierRegistration />}
      </main>

      <footer style={{
        backgroundColor: '#1a1a2e',
        color: '#fff',
        padding: '0.75rem 2rem',
        textAlign: 'center',
        fontSize: '0.8rem',
        opacity: 0.7,
      }}>
        Supplier Interface &mdash; Ed25519 Signed Attestations
      </footer>
    </div>
  );
}

function SubmitAttestationPage() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ id: string; contentHash: string; productId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        // Use stored keypair
        const secretKeyBytes = new Uint8Array(
          (stored.secretKey.match(/.{1,2}/g) || []).map(b => parseInt(b, 16))
        );
        keyPair = { publicKey: secretKeyBytes.slice(32), secretKey: secretKeyBytes };
        pubKeyHex = stored.publicKey;
        supplierId = stored.id;
      } else {
        // Generate a new Ed25519 keypair for this submission
        keyPair = nacl.sign.keyPair();
        pubKeyHex = Array.from(keyPair.publicKey)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        supplierId = pubKeyHex;
      }

      // Build the attestation payload matching backend expectations
      const payload = {
        productName: data.productName,
        productId: data.productId,
        supplierId,
        location: data.location,
        materialCost: data.materialCost,
        labourCost: data.labourCost,
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

      // Canonicalize and sign the payload
      const message = canonicalize(payload);
      const sig = nacl.sign.detached(message, keyPair.secretKey);
      const sigHex = Array.from(sig)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      // Submit to backend
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

        // Save to history
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
      // Network error or timeout — preserve form data for retry
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
        <div style={{
          background: '#d4edda',
          border: '1px solid #c3e6cb',
          borderRadius: '4px',
          padding: '1rem',
          marginBottom: '1rem',
        }}>
          <strong>Attestation submitted successfully!</strong>
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            <div>ID: <code>{result.id}</code></div>
            <div>Content Hash: <code>{result.contentHash}</code></div>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
            <QRCodeSVG value={result.productId} size={128} />
          </div>
          <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
            Product ID QR Code
          </p>
        </div>
      )}

      {error && (
        <div style={{
          background: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '4px',
          padding: '1rem',
          marginBottom: '1rem',
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <AttestationForm onSubmit={handleSubmit} disabled={submitting} />
    </div>
  );
}

function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

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
        <div style={{
          border: '1px dashed #ccc',
          borderRadius: '8px',
          padding: '2rem',
          textAlign: 'center',
          color: '#666',
        }}>
          No submissions yet
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #dee2e6' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Product Name</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Product ID</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Attestation ID</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Timestamp</th>
                <th style={{ padding: '0.5rem' }}></th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem' }}>{entry.productName}</td>
                  <td style={{ padding: '0.5rem' }}>
                    <code title={entry.productId}>{entry.productId.slice(0, 12)}…</code>
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <code title={entry.attestationId}>{entry.attestationId.slice(0, 12)}…</code>
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <button
                      onClick={() => copyToClipboard(entry.attestationId)}
                      style={{
                        background: copiedId === entry.attestationId ? '#28a745' : '#6c757d',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '3px',
                        padding: '0.25rem 0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                      }}
                    >
                      {copiedId === entry.attestationId ? 'Copied!' : 'Copy ID'}
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
