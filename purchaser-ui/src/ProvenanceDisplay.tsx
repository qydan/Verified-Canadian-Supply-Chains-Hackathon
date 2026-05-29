import { useEffect, useState, useRef, useCallback } from 'react';

// ============================================================================
// Types (mirroring backend ProvenanceReport shape)
// ============================================================================

interface InputReference {
  attestationId: string;
  quantityUsed: number;
  unit: string;
}

interface Attestation {
  id: string;
  contentHash: string;
  supplierId: string;
  publicKey: string;
  signature: string;
  timestamp: string;
  productName: string;
  productId: string;
  isTransformation: boolean;
  location: string;
  materialCost: number;
  labourCost: number;
  currency: string;
  inputs: InputReference[];
  outputQuantity: number;
  outputUnit: string;
}

interface Issue {
  type: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  attestationId: string;
  description: string;
  details?: Record<string, unknown>;
}

interface ProvenanceReport {
  productId: string;
  productName: string;
  designation: 'PRODUCT_OF_CANADA' | 'MADE_IN_CANADA' | 'NONE';
  canadianContentPercent: number;
  totalDirectCosts: number;
  canadianDirectCosts: number;
  lastTransformationLocation: string | null;
  chain: Attestation[];
  issues: Issue[];
  chainDepth: number;
  allSignaturesValid: boolean;
}

// ============================================================================
// Props
// ============================================================================

interface ProvenanceDisplayProps {
  productId: string;
  onScanAgain: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ProvenanceDisplay({ productId, onScanAgain }: ProvenanceDisplayProps) {
  const [report, setReport] = useState<ProvenanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchProvenance = useCallback(() => {
    // Abort any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    // 10-second timeout
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    setLoading(true);
    setError(null);
    setReport(null);

    fetch(`/api/products/${productId}/provenance`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}: product information could not be retrieved.`);
        }
        return res.json();
      })
      .then((data: ProvenanceReport) => {
        setReport(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') {
          setError('Request timed out. The product information could not be retrieved.');
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('An unexpected error occurred.');
        }
        setLoading(false);
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });
  }, [productId]);

  useEffect(() => {
    fetchProvenance();
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchProvenance]);

  // --- Loading State ---
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <LoadingSpinner />
        </div>
        <p style={{ color: '#666' }}>Loading provenance data...</p>
        <p style={{ fontSize: '0.8rem', color: '#999' }}>
          Product ID: <code>{productId}</code>
        </p>
      </div>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <div style={{
        border: '1px solid #dc3545',
        borderRadius: '8px',
        padding: '2rem',
        textAlign: 'center',
        backgroundColor: '#fff5f5',
      }}>
        <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚠️</p>
        <h3 style={{ color: '#dc3545', marginBottom: '0.75rem' }}>
          Unable to Retrieve Provenance
        </h3>
        <p style={{ marginBottom: '1rem', color: '#333' }}>{error}</p>
        <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1.5rem' }}>
          Product ID: <code>{productId}</code>
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            onClick={fetchProvenance}
            style={{
              padding: '0.5rem 1.5rem',
              backgroundColor: '#0f3460',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
          <button
            onClick={onScanAgain}
            style={{
              padding: '0.5rem 1.5rem',
              backgroundColor: '#6c757d',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Scan Another
          </button>
        </div>
      </div>
    );
  }

  // --- Success State ---
  if (!report) return null;

  return (
    <div>
      {/* Designation - most prominent element */}
      <DesignationBanner designation={report.designation} />

      {/* Canadian Content Percentage */}
      <div style={{
        textAlign: 'center',
        margin: '1.5rem 0',
        padding: '1rem',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
      }}>
        <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>
          Canadian Content
        </p>
        <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>
          {report.canadianContentPercent.toFixed(2)}%
        </p>
      </div>

      {/* Product Info */}
      <div style={{ marginBottom: '1.5rem', fontSize: '0.85rem', color: '#666' }}>
        <p><strong>Product:</strong> {report.productName}</p>
        <p><strong>Product ID:</strong> <code>{report.productId}</code></p>
        <p><strong>Chain Depth:</strong> {report.chainDepth} attestation(s)</p>
        <p>
          <strong>All Signatures Valid:</strong>{' '}
          <span style={{ color: report.allSignaturesValid ? '#28a745' : '#dc3545' }}>
            {report.allSignaturesValid ? '✓ Yes' : '✗ No'}
          </span>
        </p>
      </div>

      {/* Anomaly Warnings */}
      {report.issues.length > 0 && (
        <AnomalyWarnings issues={report.issues} />
      )}

      {/* Supply Chain Visualization */}
      <SupplyChainVisualization chain={report.chain} />

      {/* Actions */}
      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <button
          onClick={onScanAgain}
          style={{
            padding: '0.5rem 1.5rem',
            backgroundColor: '#0f3460',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Scan Another Product
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function LoadingSpinner() {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
        display: 'inline-block',
        width: '40px',
        height: '40px',
        border: '4px solid #e9ecef',
        borderTop: '4px solid #0f3460',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function DesignationBanner({ designation }: { designation: ProvenanceReport['designation'] }) {
  const config = {
    PRODUCT_OF_CANADA: {
      label: 'Product of Canada',
      color: '#155724',
      bg: '#d4edda',
      border: '#c3e6cb',
      icon: '🍁',
    },
    MADE_IN_CANADA: {
      label: 'Made in Canada',
      color: '#856404',
      bg: '#fff3cd',
      border: '#ffc107',
      icon: '🏭',
    },
    NONE: {
      label: 'No Canadian Designation',
      color: '#721c24',
      bg: '#f8d7da',
      border: '#f5c6cb',
      icon: '—',
    },
  }[designation];

  return (
    <div style={{
      textAlign: 'center',
      padding: '1.5rem',
      borderRadius: '12px',
      backgroundColor: config.bg,
      border: `2px solid ${config.border}`,
    }}>
      <p style={{ fontSize: '2rem', margin: '0 0 0.25rem' }}>{config.icon}</p>
      <h2 style={{ color: config.color, margin: 0, fontSize: '1.75rem' }}>
        {config.label}
      </h2>
    </div>
  );
}

function AnomalyWarnings({ issues }: { issues: Issue[] }) {
  const severityConfig = {
    CRITICAL: { color: '#721c24', bg: '#f8d7da', border: '#f5c6cb', icon: '🚨' },
    WARNING: { color: '#856404', bg: '#fff3cd', border: '#ffc107', icon: '⚠️' },
    INFO: { color: '#0c5460', bg: '#d1ecf1', border: '#bee5eb', icon: 'ℹ️' },
  };

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ marginBottom: '0.75rem' }}>Detected Issues ({issues.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {issues.map((issue, idx) => {
          const cfg = severityConfig[issue.severity] || severityConfig.INFO;
          return (
            <div
              key={idx}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                backgroundColor: cfg.bg,
                border: `1px solid ${cfg.border}`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
              }}
            >
              <span>{cfg.icon}</span>
              <div style={{ flex: 1 }}>
                <span style={{
                  fontWeight: 'bold',
                  color: cfg.color,
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                }}>
                  {issue.severity}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#666', marginLeft: '0.5rem' }}>
                  {issue.type}
                </span>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#333' }}>
                  {issue.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SupplyChainVisualization({ chain }: { chain: Attestation[] }) {
  if (chain.length === 0) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>
        No supply chain data available.
      </div>
    );
  }

  // Build a map of attestation id -> index for edge drawing
  const idToIndex = new Map<string, number>();
  chain.forEach((att, idx) => idToIndex.set(att.id, idx));

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ marginBottom: '0.75rem' }}>Supply Chain</h3>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
      }}>
        {chain.map((attestation, idx) => (
          <div key={attestation.id}>
            {/* Node */}
            <div style={{
              border: '1px solid #dee2e6',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              backgroundColor: attestation.isTransformation ? '#e8f4fd' : '#fff',
              position: 'relative',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ fontSize: '0.9rem' }}>{attestation.productName}</strong>
                  <span style={{
                    marginLeft: '0.5rem',
                    fontSize: '0.75rem',
                    color: '#666',
                    backgroundColor: '#f0f0f0',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '3px',
                  }}>
                    {attestation.location}
                  </span>
                  {attestation.isTransformation && (
                    <span style={{
                      marginLeft: '0.5rem',
                      fontSize: '0.7rem',
                      color: '#0c5460',
                      backgroundColor: '#d1ecf1',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '3px',
                    }}>
                      transformation
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '0.7rem', color: '#999' }}>
                  {attestation.id.slice(0, 8)}…
                </span>
              </div>
              {/* Show inputs as directed edges */}
              {attestation.inputs.length > 0 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#666' }}>
                  {attestation.inputs.map((input, iIdx) => {
                    const sourceIdx = idToIndex.get(input.attestationId);
                    const sourceAtt = sourceIdx !== undefined ? chain[sourceIdx] : null;
                    return (
                      <span key={iIdx} style={{
                        display: 'inline-block',
                        marginRight: '0.5rem',
                        backgroundColor: '#f8f9fa',
                        padding: '0.15rem 0.4rem',
                        borderRadius: '3px',
                        border: '1px solid #e9ecef',
                      }}>
                        ← {sourceAtt ? sourceAtt.productName : input.attestationId.slice(0, 8) + '…'}
                        {' '}({input.quantityUsed} {input.unit})
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Arrow between nodes */}
            {idx < chain.length - 1 && (
              <div style={{ textAlign: 'center', color: '#adb5bd', fontSize: '1.2rem', lineHeight: '1' }}>
                ↓
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
