import { useState } from 'react';
import nacl from 'tweetnacl';
import { AttestationForm, AttestationFormData } from './AttestationForm';
import { canonicalize } from './crypto';

type Page = 'submit' | 'history';

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
      </nav>

      <main style={{ flex: 1, padding: '2rem', maxWidth: '800px', width: '100%', margin: '0 auto' }}>
        {currentPage === 'submit' && <SubmitAttestationPage />}
        {currentPage === 'history' && <HistoryPage />}
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
  const [result, setResult] = useState<{ id: string; contentHash: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(data: AttestationFormData) {
    setSubmitting(true);
    setResult(null);
    setError(null);

    try {
      // Generate a new Ed25519 keypair for this submission
      const keyPair = nacl.sign.keyPair();
      const pubKeyHex = Array.from(keyPair.publicKey)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      // Build the attestation payload matching backend expectations
      const payload = {
        productName: data.productName,
        productId: data.productId,
        supplierId: pubKeyHex,
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
        setResult({ id: body.id, contentHash: body.contentHash });
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
        Each submission generates a new Ed25519 keypair and signs the canonicalized payload.
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
  return (
    <div>
      <h2>Submission History</h2>
      <p>View previously submitted attestations and their status.</p>
      <div style={{
        border: '1px dashed #ccc',
        borderRadius: '8px',
        padding: '2rem',
        textAlign: 'center',
        color: '#666',
      }}>
        Submission history will appear here.
      </div>
    </div>
  );
}

export default App;
