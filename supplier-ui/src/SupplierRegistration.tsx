import { useState, FormEvent } from 'react';
import nacl from 'tweetnacl';

const COUNTRY_CODES = [
  { code: 'AU', name: 'Australia' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CA', name: 'Canada' },
  { code: 'CN', name: 'China' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IN', name: 'India' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'MX', name: 'Mexico' },
  { code: 'US', name: 'United States' },
];

interface RegisteredSupplier {
  id: string;
  name: string;
  publicKey: string;
  location: string;
}

export function SupplierRegistration() {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RegisteredSupplier | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if already registered
  const stored = (() => {
    try {
      const raw = localStorage.getItem('supplier');
      if (!raw) return null;
      return JSON.parse(raw) as RegisteredSupplier;
    } catch {
      return null;
    }
  })();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    setError(null);

    try {
      // Generate Ed25519 keypair
      const keyPair = nacl.sign.keyPair();
      const pubKeyHex = Array.from(keyPair.publicKey)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const secretKeyHex = Array.from(keyPair.secretKey)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      // POST to /api/suppliers
      const response = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          publicKey: pubKeyHex,
          location,
        }),
      });

      if (response.ok) {
        const body = await response.json();

        // Store keypair and supplier info in localStorage
        const supplierData = {
          id: body.id,
          name: body.name,
          publicKey: pubKeyHex,
          secretKey: secretKeyHex,
          location: body.location,
        };
        localStorage.setItem('supplier', JSON.stringify(supplierData));

        setResult({
          id: body.id,
          name: body.name,
          publicKey: pubKeyHex,
          location: body.location,
        });
      } else {
        const body = await response.json().catch(() => null);
        setError(body?.error || `Server error (${response.status})`);
      }
    } catch {
      setError('Registration could not be completed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '0.9rem',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontWeight: 600,
    marginBottom: '0.25rem',
    fontSize: '0.9rem',
  };

  const fieldGroupStyle: React.CSSProperties = {
    marginBottom: '1rem',
  };

  if (stored) {
    return (
      <div>
        <h2>Supplier Registration</h2>
        <div style={{
          background: '#d4edda',
          border: '1px solid #c3e6cb',
          borderRadius: '4px',
          padding: '1rem',
          marginBottom: '1rem',
        }}>
          <strong>Already registered!</strong>
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            <div><strong>Name:</strong> {stored.name}</div>
            <div><strong>Supplier ID:</strong> <code>{stored.id}</code></div>
            <div><strong>Public Key:</strong> <code style={{ wordBreak: 'break-all' }}>{stored.publicKey}</code></div>
            <div><strong>Location:</strong> {stored.location}</div>
          </div>
        </div>
        <button
          onClick={() => {
            localStorage.removeItem('supplier');
            window.location.reload();
          }}
          style={{
            padding: '0.5rem 1rem',
            background: '#dc3545',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Clear Registration
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2>Supplier Registration</h2>
      <p>
        Register as a supplier to get a persistent identity. Your Ed25519 keypair will be stored
        locally and used to sign future attestations.
      </p>

      {result && (
        <div style={{
          background: '#d4edda',
          border: '1px solid #c3e6cb',
          borderRadius: '4px',
          padding: '1rem',
          marginBottom: '1rem',
        }}>
          <strong>Registration successful!</strong>
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            <div><strong>Supplier ID:</strong> <code>{result.id}</code></div>
            <div><strong>Public Key:</strong> <code style={{ wordBreak: 'break-all' }}>{result.publicKey}</code></div>
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

      <form onSubmit={handleSubmit} noValidate>
        <div style={fieldGroupStyle}>
          <label style={labelStyle} htmlFor="supplierName">Name *</label>
          <input
            id="supplierName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={fieldStyle}
            disabled={submitting}
            placeholder="e.g., Maple Leaf Industries"
            required
          />
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle} htmlFor="supplierLocation">Location *</label>
          <select
            id="supplierLocation"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={fieldStyle}
            disabled={submitting}
            required
          >
            <option value="">Select country...</option>
            {COUNTRY_CODES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={submitting || !name.trim() || !location}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: (submitting || !name.trim() || !location) ? '#95a5a6' : '#2c3e50',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: (submitting || !name.trim() || !location) ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Registering...' : 'Generate Keypair & Register'}
        </button>
      </form>
    </div>
  );
}
