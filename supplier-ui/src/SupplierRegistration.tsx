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
  { code: 'IL', name: 'Israel' },
  { code: 'IN', name: 'India' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'MX', name: 'Mexico' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'US', name: 'United States' },
];

interface RegisteredSupplier {
  id: string;
  name: string;
  publicKey: string;
  location: string;
}

export function SupplierRegistration() {
  const [mode, setMode] = useState<'choose' | 'register' | 'signin'>('choose');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [secretKeyHex, setSecretKeyHex] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RegisteredSupplier | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stored = (() => {
    try {
      const raw = localStorage.getItem('supplier');
      if (!raw) return null;
      return JSON.parse(raw) as RegisteredSupplier & { secretKey?: string };
    } catch {
      return null;
    }
  })();

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    setError(null);

    try {
      const keyPair = nacl.sign.keyPair();
      const pubKeyHex = Array.from(keyPair.publicKey)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const secKeyHex = Array.from(keyPair.secretKey)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const response = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), publicKey: pubKeyHex, location }),
      });

      if (response.ok) {
        const body = await response.json();
        localStorage.setItem('supplier', JSON.stringify({
          id: body.id, name: body.name, publicKey: pubKeyHex, secretKey: secKeyHex, location: body.location,
        }));
        setResult({ id: body.id, name: body.name, publicKey: pubKeyHex, location: body.location });
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

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // Validate the supplier ID exists
      const res = await fetch(`/api/suppliers/${supplierId.trim()}`);
      if (!res.ok) {
        setError('Supplier ID not found. Please check and try again.');
        setSubmitting(false);
        return;
      }

      const supplier = await res.json();

      // If secret key provided, validate it derives the correct public key
      if (secretKeyHex.trim()) {
        const secBytes = new Uint8Array(
          (secretKeyHex.trim().match(/.{1,2}/g) || []).map((b) => parseInt(b, 16))
        );
        if (secBytes.length !== 64) {
          setError('Secret key must be 128 hex characters (64 bytes).');
          setSubmitting(false);
          return;
        }
        const derivedPub = Array.from(secBytes.slice(32))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        if (derivedPub !== supplier.publicKey) {
          setError('Secret key does not match the registered public key for this supplier.');
          setSubmitting(false);
          return;
        }

        localStorage.setItem('supplier', JSON.stringify({
          id: supplier.id, name: supplier.name, publicKey: supplier.publicKey,
          secretKey: secretKeyHex.trim(), location: supplier.location,
        }));
      } else {
        // Sign in without secret key (read-only dashboard access)
        localStorage.setItem('supplier', JSON.stringify({
          id: supplier.id, name: supplier.name, publicKey: supplier.publicKey,
          location: supplier.location,
        }));
      }

      window.location.reload();
    } catch {
      setError('Sign in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Already registered view
  if (stored) {
    return (
      <div>
        <h2>Identity</h2>
        <div className="alert alert-success">
          <span className="alert-icon">✓</span>
          <div className="alert-content">
            <div className="alert-title">Signed in as {stored.name}</div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              <div><strong>Supplier ID:</strong> <code>{stored.id}</code></div>
              <div><strong>Public Key:</strong> <code style={{ wordBreak: 'break-all' }}>{stored.publicKey}</code></div>
              <div><strong>Location:</strong> {stored.location}</div>
              {stored.secretKey && (
                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--color-border-light)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem' }}>
                  <div><strong>Signing:</strong> Active — attestations will be signed with your private key</div>
                  <details style={{ marginTop: '0.5rem' }}>
                    <summary style={{ cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 500 }}>
                      Show Secret Key (for backup / sign-in on another device)
                    </summary>
                    <code style={{ display: 'block', marginTop: '0.4rem', wordBreak: 'break-all', fontSize: '0.7rem', padding: '0.5rem', background: '#fff', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                      {stored.secretKey}
                    </code>
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.7rem', color: '#991b1b' }}>
                      ⚠ Keep this secret. Anyone with this key can sign attestations as you.
                    </p>
                  </details>
                </div>
              )}
              {!stored.secretKey && (
                <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#fffbeb', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', color: '#92400e' }}>
                  <strong>Read-only:</strong> No private key loaded — cannot sign attestations
                </div>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => { localStorage.removeItem('supplier'); window.location.reload(); }}
          className="btn btn-danger"
        >
          Sign Out
        </button>
      </div>
    );
  }

  // Choose mode
  if (mode === 'choose') {
    return (
      <div>
        <h2>Identity</h2>
        <p>Register a new supplier identity or sign in with an existing one.</p>

        {error && (
          <div className="alert alert-error">
            <span className="alert-icon">⚠</span>
            <div className="alert-content"><p style={{ margin: 0, fontSize: '0.85rem' }}>{error}</p></div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="card" style={{ cursor: 'pointer', textAlign: 'center', padding: '2rem' }} onClick={() => setMode('register')}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔑</div>
            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Register New</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              Generate a new Ed25519 keypair and register with the system
            </div>
          </div>
          <div className="card" style={{ cursor: 'pointer', textAlign: 'center', padding: '2rem' }} onClick={() => setMode('signin')}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔓</div>
            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Sign In</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              Import an existing supplier ID to access your dashboard
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Sign in form
  if (mode === 'signin') {
    return (
      <div>
        <h2>Sign In</h2>
        <p>Enter your Supplier ID to access your dashboard. Optionally provide your secret key to sign attestations.</p>

        {error && (
          <div className="alert alert-error">
            <span className="alert-icon">⚠</span>
            <div className="alert-content"><p style={{ margin: 0, fontSize: '0.85rem' }}>{error}</p></div>
          </div>
        )}

        <div className="card">
          <form onSubmit={handleSignIn} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="signInId">Supplier ID *</label>
              <input
                id="signInId"
                type="text"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="form-input"
                disabled={submitting}
                placeholder="e.g., 3c99808e-e83b-4a0d-b9e6-13938868f39b"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="signInKey">Secret Key (optional — needed to sign attestations)</label>
              <input
                id="signInKey"
                type="password"
                value={secretKeyHex}
                onChange={(e) => setSecretKeyHex(e.target.value)}
                className="form-input"
                disabled={submitting}
                placeholder="128 hex characters (leave blank for read-only access)"
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" onClick={() => { setMode('choose'); setError(null); }} className="btn btn-secondary">
                Back
              </button>
              <button type="submit" disabled={submitting || !supplierId.trim()} className="btn btn-primary" style={{ flex: 1 }}>
                {submitting ? 'Signing in...' : 'Sign In'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Register form
  return (
    <div>
      <h2>Register New Supplier</h2>
      <p>
        Generate a new Ed25519 keypair and register with the system.
        Your private key will be stored locally and used to sign attestations.
      </p>

      {result && (
        <div className="alert alert-success">
          <span className="alert-icon">✓</span>
          <div className="alert-content">
            <div className="alert-title">Registration successful!</div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              <div><strong>Supplier ID:</strong> <code>{result.id}</code></div>
              <div><strong>Public Key:</strong> <code style={{ wordBreak: 'break-all' }}>{result.publicKey}</code></div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <span className="alert-icon">⚠</span>
          <div className="alert-content"><p style={{ margin: 0, fontSize: '0.85rem' }}>{error}</p></div>
        </div>
      )}

      <div className="card">
        <form onSubmit={handleRegister} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="supplierName">Name *</label>
            <input
              id="supplierName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="form-input"
              disabled={submitting}
              placeholder="e.g., Maple Leaf Industries"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="supplierLocation">Location *</label>
            <select
              id="supplierLocation"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="form-input form-select"
              disabled={submitting}
              required
            >
              <option value="">Select country...</option>
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" onClick={() => { setMode('choose'); setError(null); }} className="btn btn-secondary">
              Back
            </button>
            <button type="submit" disabled={submitting || !name.trim() || !location} className="btn btn-primary" style={{ flex: 1 }}>
              {submitting ? 'Registering...' : 'Generate Keypair & Register'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
