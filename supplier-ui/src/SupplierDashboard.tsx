import { useState, useEffect } from 'react';

interface DashboardAttestation {
  id: string;
  productName: string;
  productId: string;
  location: string;
  timestamp: string;
  isTransformation: boolean;
  materialCost: number;
  labourCost: number;
  outputQuantity: number;
  outputUnit: string;
}

interface StoredSupplier {
  id: string;
  name: string;
  publicKey: string;
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

export function SupplierDashboard() {
  const [attestations, setAttestations] = useState<DashboardAttestation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supplier = getStoredSupplier();

  useEffect(() => {
    if (!supplier) {
      setLoading(false);
      return;
    }

    fetch(`/api/suppliers/${supplier.id}/attestations`)
      .then((res) => {
        if (res.status === 404) {
          // Supplier no longer exists in DB (likely after a reset)
          setAttestations([]);
          setLoading(false);
          return null;
        }
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        return res.json();
      })
      .then((data) => {
        if (data) setAttestations(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [supplier?.id]);

  if (!supplier) {
    return (
      <div>
        <h2>Supplier Dashboard</h2>
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <p style={{ margin: 0 }}>Register as a supplier first to see your dashboard.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h2>Supplier Dashboard</h2>
        <div className="alert alert-error">
          <span className="alert-icon">⚠</span>
          <div className="alert-content">
            <div className="alert-title">Error loading dashboard</div>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Compute stats
  const totalCost = attestations.reduce((sum, a) => sum + a.materialCost + a.labourCost, 0);
  const productIds = new Set(attestations.map((a) => a.productId));
  const transformations = attestations.filter((a) => a.isTransformation).length;

  return (
    <div>
      <h2>Supplier Dashboard</h2>
      <p>Overview of your attestations across all products.</p>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary)' }}>
            {attestations.length}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Attestations
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary)' }}>
            {productIds.size}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Products
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary)' }}>
            {transformations}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Transformations
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary)' }}>
            ${totalCost.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Total Value
          </div>
        </div>
      </div>

      {/* Attestation list */}
      {attestations.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <p style={{ margin: 0 }}>No attestations yet. Submit your first one.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Type</th>
                <th>Output</th>
                <th>Cost</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {attestations.map((att) => (
                <tr key={att.id}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{att.productName}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                      {att.productId.slice(0, 8)}…
                    </div>
                  </td>
                  <td>
                    {att.isTransformation ? (
                      <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '999px', background: 'var(--color-primary-bg)', color: 'var(--color-primary-dark)', fontWeight: 500 }}>
                        Transformation
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '999px', background: 'var(--color-border-light)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                        Raw Material
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>{att.outputQuantity} {att.outputUnit}</td>
                  <td style={{ fontSize: '0.85rem', fontWeight: 600 }}>${(att.materialCost + att.labourCost).toLocaleString()}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    {new Date(att.timestamp).toLocaleDateString()}
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
