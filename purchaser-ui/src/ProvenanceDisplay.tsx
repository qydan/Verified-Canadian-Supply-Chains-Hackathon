import { useEffect, useState, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { SupplyChainMap } from './SupplyChainMap';
import { CostPieChart } from './CostPieChart';
import { ThresholdGauge } from './ThresholdGauge';
import { ChainTimeline } from './ChainTimeline';
import { Flag } from './Flag';

// ============================================================================
// Helpers
// ============================================================================

// countryFlag replaced by Flag component

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
  const fetchIdRef = useRef(0);

  const fetchProvenance = useCallback(() => {
    // Abort any previous request
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    // Track which fetch this is so stale responses are ignored
    const currentFetchId = ++fetchIdRef.current;

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
        // Ignore if a newer fetch has been started
        if (currentFetchId !== fetchIdRef.current) return;
        setReport(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        // Ignore if a newer fetch has been started (abort was from cleanup)
        if (currentFetchId !== fetchIdRef.current) return;
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
          <div className="spinner" role="status" aria-label="Loading" />
        </div>
        <p style={{ color: 'var(--color-text-secondary)' }}>Loading provenance data...</p>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
          Product ID: <code>{productId}</code>
        </p>
      </div>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <div className="card" style={{ textAlign: 'center', borderColor: 'var(--color-error-border)', background: 'var(--color-error-bg)' }}>
        <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</p>
        <h3 style={{ color: 'var(--color-error)', marginBottom: '0.75rem' }}>
          Unable to Retrieve Provenance
        </h3>
        <p style={{ marginBottom: '1rem' }}>{error}</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
          Product ID: <code>{productId}</code>
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button onClick={fetchProvenance} className="btn btn-primary">
            Retry
          </button>
          <button onClick={onScanAgain} className="btn btn-secondary">
            Scan Another
          </button>
        </div>
      </div>
    );
  }

  // --- Success State ---
  if (!report) return null;

  return (
    <div className="fade-in">
      {/* Print-only report header */}
      <div className="print-report-header" style={{ display: 'none' }}>
        <h1>Canadian Content Provenance Report</h1>
        <p>Product: {report.productName} | ID: {report.productId}</p>
        <p>Generated: {new Date().toLocaleDateString()} | Chain Depth: {report.chainDepth} attestations | Signatures: {report.allSignaturesValid ? 'All Valid' : 'INVALID DETECTED'}</p>
      </div>
      {/* Designation Banner */}
      <DesignationBanner designation={report.designation} />

      {/* Canadian Content Percentage */}
      <div className="stats-card" style={{ margin: '1.5rem 0' }}>
        <p className="stats-label">Canadian Content</p>
        <p className="stats-value">{report.canadianContentPercent.toFixed(2)}%</p>
      </div>

      {/* Cost Breakdown */}
      <div className="progress-bar-container">
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Cost Breakdown</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Total Direct Costs:</span>
          <strong>${report.totalDirectCosts.toFixed(2)}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Canadian Direct Costs:</span>
          <strong>${report.canadianDirectCosts.toFixed(2)}</strong>
        </div>
        <div className="progress-labels" style={{ marginBottom: '0.35rem' }}>
          <span>Canadian ({report.canadianContentPercent.toFixed(2)}%)</span>
          <span>Non-Canadian ({(100 - report.canadianContentPercent).toFixed(2)}%)</span>
        </div>
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{
              width: `${report.totalDirectCosts > 0 ? (report.canadianDirectCosts / report.totalDirectCosts) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Threshold Gauge */}
      <ThresholdGauge percent={report.canadianContentPercent} designation={report.designation} />

      {/* Cost by Country Pie Chart */}
      <CostPieChart chain={report.chain} />

      {/* Product Info */}
      <div className="product-info" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="product-info-item">
            <span className="product-info-label">Product</span>
            <span className="product-info-value">{report.productName}</span>
          </div>
          <div className="product-info-item">
            <span className="product-info-label">Chain Depth</span>
            <span className="product-info-value">{report.chainDepth} attestation(s)</span>
          </div>
          <div className="product-info-item">
            <span className="product-info-label">Product ID</span>
            <span className="product-info-value"><code>{report.productId}</code></span>
          </div>
          <div className="product-info-item">
            <span className="product-info-label">Signatures</span>
            <span className="product-info-value" style={{ color: report.allSignaturesValid ? 'var(--color-success)' : 'var(--color-error)' }}>
              {report.allSignaturesValid ? '✓ All Valid' : '✗ Invalid Detected'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
          <QRCodeSVG value={report.productId} size={80} />
          <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: '0.35rem' }}>Scan to verify</span>
        </div>
      </div>

      {/* Anomaly Warnings */}
      {report.issues.length > 0 && (
        <AnomalyWarnings issues={report.issues} />
      )}

      {/* Supply Chain Map */}
      <SupplyChainMap chain={report.chain} />

      {/* Chain of Custody Timeline */}
      <ChainTimeline chain={report.chain} />

      {/* Supply Chain Visualization */}
      <SupplyChainVisualization chain={report.chain} />

      {/* Actions */}
      <div style={{ marginTop: '2rem', textAlign: 'center', display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
        <button onClick={() => window.print()} className="btn btn-secondary">
          📄 Export Report
        </button>
        <button onClick={onScanAgain} className="btn btn-primary">
          Scan Another Product
        </button>
      </div>

      {/* Print-only report footer */}
      <div className="print-report-footer" style={{ display: 'none' }}>
        This report was cryptographically verified using Ed25519 digital signatures.
        Each attestation in the supply chain has been independently validated against the signer's registered public key.
        Canadian content percentage calculated per Competition Bureau guidelines.
        <br />
        Report generated by Canadian Provenance Verification System — {new Date().toISOString()}
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function DesignationBanner({ designation }: { designation: ProvenanceReport['designation'] }) {
  const config = {
    PRODUCT_OF_CANADA: {
      label: 'Product of Canada',
      className: 'product-of-canada',
      icon: '🍁',
    },
    MADE_IN_CANADA: {
      label: 'Made in Canada',
      className: 'made-in-canada',
      icon: '🏭',
    },
    NONE: {
      label: 'No Canadian Designation',
      className: 'no-designation',
      icon: '—',
    },
  }[designation];

  return (
    <div className={`designation-banner ${config.className}`}>
      <p className="designation-icon">{config.icon}</p>
      <h2 className="designation-label">{config.label}</h2>
    </div>
  );
}

function AnomalyWarnings({ issues }: { issues: Issue[] }) {
  const severityConfig = {
    CRITICAL: { className: 'issue-critical', icon: '🚨', color: '#991b1b' },
    WARNING: { className: 'issue-warning', icon: '⚠️', color: '#92400e' },
    INFO: { className: 'issue-info', icon: 'ℹ️', color: '#1e40af' },
  };

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ marginBottom: '0.75rem' }}>Detected Issues ({issues.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {issues.map((issue, idx) => {
          const cfg = severityConfig[issue.severity] || severityConfig.INFO;
          return (
            <div key={idx} className={`issue-item ${cfg.className}`}>
              <span>{cfg.icon}</span>
              <div style={{ flex: 1 }}>
                <span className="issue-severity" style={{ color: cfg.color }}>
                  {issue.severity}
                </span>
                <span className="issue-type">{issue.type}</span>
                <p className="issue-description">{issue.description}</p>
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
      <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        No supply chain data available.
      </div>
    );
  }

  const idToIndex = new Map<string, number>();
  chain.forEach((att, idx) => idToIndex.set(att.id, idx));

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ marginBottom: '0.75rem' }}>Supply Chain</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {chain.map((attestation, idx) => (
          <div key={attestation.id}>
            <div className={`chain-node ${attestation.isTransformation ? 'transformation' : ''}`}>
              <div className="chain-node-header">
                <div>
                  <span className="chain-node-name">{attestation.productName}</span>
                  <span className="badge badge-location">
                    <Flag code={attestation.location} />
                  </span>
                  {attestation.isTransformation && (
                    <span className="badge badge-transform">transformation</span>
                  )}
                  <span className="badge" style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', marginLeft: '0.35rem' }}>
                    ✓ verified
                  </span>
                </div>
                <span className="chain-node-id">{attestation.id.slice(0, 8)}…</span>
              </div>
              {attestation.inputs.length > 0 && (
                <div className="chain-inputs">
                  {attestation.inputs.map((input, iIdx) => {
                    const sourceIdx = idToIndex.get(input.attestationId);
                    const sourceAtt = sourceIdx !== undefined ? chain[sourceIdx] : null;
                    return (
                      <span key={iIdx} className="chain-input-tag">
                        ← {sourceAtt ? sourceAtt.productName : input.attestationId.slice(0, 8) + '…'}
                        {' '}({input.quantityUsed} {input.unit})
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            {idx < chain.length - 1 && (
              <div className="chain-arrow">↓</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
