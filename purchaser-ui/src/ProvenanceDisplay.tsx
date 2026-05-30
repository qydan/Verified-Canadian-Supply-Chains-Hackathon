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

      {/* Plain-English Summary & Risk Assessment */}
      <ReportSummary report={report} />

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
          <div className="product-info-item">
            <span className="product-info-label">Chain Completeness</span>
            <span className="product-info-value">
              <ChainCompletenessIndicator chain={report.chain} />
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

function ReportSummary({ report }: { report: ProvenanceReport }) {
  const countries = [...new Set(report.chain.map((a) => a.location))];
  const nonCACountries = countries.filter((c) => c !== 'CA');
  const criticalIssues = report.issues.filter((i) => i.severity === 'CRITICAL');
  const warningIssues = report.issues.filter((i) => i.severity === 'WARNING');

  // Build plain-English summary
  const designationText = {
    PRODUCT_OF_CANADA: 'Product of Canada',
    MADE_IN_CANADA: 'Made in Canada',
    NONE: 'does not qualify for a Canadian designation',
  }[report.designation];

  // Risk assessment (rule-based, no LLM)
  const risks: Array<{ level: 'high' | 'medium' | 'low'; text: string }> = [];

  if (criticalIssues.length > 0) {
    risks.push({ level: 'high', text: `${criticalIssues.length} critical integrity issue(s) detected — chain may be compromised` });
  }
  if (!report.allSignaturesValid) {
    risks.push({ level: 'high', text: 'One or more signatures failed verification — possible tampering' });
  }
  if (report.issues.some((i) => i.type === 'REPLAY_DETECTED')) {
    risks.push({ level: 'high', text: 'Replay attack detected — components double-counted across products' });
  }
  if (report.issues.some((i) => i.type === 'QUANTITY_EXCEEDS_UPSTREAM')) {
    risks.push({ level: 'high', text: 'Material over-consumption — more claimed than produced upstream' });
  }
  if (nonCACountries.length > 3) {
    risks.push({ level: 'medium', text: `Supply chain spans ${countries.length} countries — complex provenance increases verification difficulty` });
  }
  if (report.canadianContentPercent > 51 && report.canadianContentPercent < 60) {
    risks.push({ level: 'medium', text: 'Canadian content is close to the 51% threshold — small cost changes could affect designation' });
  }
  if (warningIssues.length > 0 && criticalIssues.length === 0) {
    risks.push({ level: 'low', text: `${warningIssues.length} warning(s) detected — review recommended but not blocking` });
  }
  if (risks.length === 0) {
    risks.push({ level: 'low', text: 'No risk factors identified — chain is clean and fully verified' });
  }

  const overallRisk = risks.some((r) => r.level === 'high') ? 'high' : risks.some((r) => r.level === 'medium') ? 'medium' : 'low';
  const riskColors = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };
  const riskLabels = { high: 'High Risk', medium: 'Medium Risk', low: 'Low Risk' };

  return (
    <div style={{
      margin: '1.25rem 0',
      padding: '1.25rem',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
    }}>
      {/* Summary paragraph */}
      <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--color-text)', margin: '0 0 1rem' }}>
        This product qualifies as <strong>{designationText}</strong> with{' '}
        <strong>{report.canadianContentPercent.toFixed(2)}%</strong> Canadian content.
        The supply chain spans <strong>{report.chainDepth} attestations</strong> across{' '}
        <strong>{countries.length} {countries.length === 1 ? 'country' : 'countries'}</strong>
        {nonCACountries.length > 0 && ` (non-Canadian: ${nonCACountries.join(', ')})`}.
        {report.allSignaturesValid
          ? ' All digital signatures verified successfully.'
          : ' ⚠ One or more signatures failed verification.'}
        {report.issues.length === 0
          ? ' No integrity issues detected.'
          : ` ${report.issues.length} issue(s) flagged.`}
      </p>

      {/* Risk Assessment */}
      <div style={{
        padding: '0.75rem 1rem',
        borderRadius: 'var(--radius-md)',
        background: overallRisk === 'high' ? '#fef2f2' : overallRisk === 'medium' ? '#fffbeb' : '#ecfdf5',
        border: `1px solid ${overallRisk === 'high' ? '#fecaca' : overallRisk === 'medium' ? '#fde68a' : '#a7f3d0'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <span style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: riskColors[overallRisk],
          }} />
          <strong style={{ fontSize: '0.82rem', color: riskColors[overallRisk] }}>
            {riskLabels[overallRisk]}
          </strong>
        </div>
        {risks.map((risk, idx) => (
          <div key={idx} style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem', paddingLeft: '1rem' }}>
            • {risk.text}
          </div>
        ))}
      </div>
    </div>
  );
}

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

  const issueExplanations: Record<string, string> = {
    INVALID_SIGNATURE: 'The data may have been tampered with after the supplier signed it.',
    MODIFIED_PAYLOAD: "The stored content doesn't match what was originally submitted.",
    UNREGISTERED_SUPPLIER: 'This attestation was signed by a key not in the supplier registry.',
    REPLAY_DETECTED: 'The same component is being claimed by multiple products — possible double-counting.',
    QUANTITY_EXCEEDS_UPSTREAM: 'More material is being claimed than was actually produced.',
    BROKEN_LINK: "A referenced input doesn't exist in the system.",
    IMPOSSIBLE_ORDERING: 'An input was supposedly created after the step that uses it.',
    CYCLE_DETECTED: 'The supply chain contains a loop, which is physically impossible.',
    MISSING_REQUIRED_FIELD: 'Required data is missing from this attestation.',
  };

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ marginBottom: '0.75rem' }}>Detected Issues ({issues.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {issues.map((issue, idx) => {
          const cfg = severityConfig[issue.severity] || severityConfig.INFO;
          const explanation = issueExplanations[issue.type];
          return (
            <div key={idx} className={`issue-item ${cfg.className}`}>
              <span>{cfg.icon}</span>
              <div style={{ flex: 1 }}>
                <span className="issue-severity" style={{ color: cfg.color }}>
                  {issue.severity}
                </span>
                <span className="issue-type">{issue.type}</span>
                <p className="issue-description">{issue.description}</p>
                {explanation && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0', fontStyle: 'italic' }}>
                    {explanation}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChainCompletenessIndicator({ chain }: { chain: Attestation[] }) {
  const chainIds = new Set(chain.map((a) => a.id));
  let totalInputRefs = 0;
  let unresolvedCount = 0;

  for (const att of chain) {
    for (const input of att.inputs) {
      totalInputRefs++;
      if (!chainIds.has(input.attestationId)) {
        unresolvedCount++;
      }
    }
  }

  if (totalInputRefs === 0) {
    return <span style={{ color: 'var(--color-success)' }}>Complete ✓</span>;
  }

  if (unresolvedCount === 0) {
    return <span style={{ color: 'var(--color-success)' }}>Complete ✓</span>;
  }

  return (
    <span style={{ color: '#f59e0b' }}>
      Partial ({unresolvedCount} unresolved)
    </span>
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

  // Calculate total consumed for each attestation
  const totalConsumed = new Map<string, number>();
  for (const att of chain) {
    for (const input of att.inputs) {
      totalConsumed.set(input.attestationId, (totalConsumed.get(input.attestationId) || 0) + input.quantityUsed);
    }
  }

  // Group nodes by depth (BFS from leaves)
  const depths = new Map<string, number>();
  const childMap = new Map<string, string[]>(); // parent -> children who consume it

  for (const att of chain) {
    for (const input of att.inputs) {
      if (!childMap.has(input.attestationId)) childMap.set(input.attestationId, []);
      childMap.get(input.attestationId)!.push(att.id);
    }
  }

  // Assign depth: nodes with no inputs are depth 0
  function getDepth(id: string, visited: Set<string>): number {
    if (depths.has(id)) return depths.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);
    const att = chain[idToIndex.get(id)!];
    if (!att || att.inputs.length === 0) {
      depths.set(id, 0);
      return 0;
    }
    const maxParentDepth = Math.max(...att.inputs.map((inp) => getDepth(inp.attestationId, visited)));
    const d = maxParentDepth + 1;
    depths.set(id, d);
    return d;
  }
  for (const att of chain) getDepth(att.id, new Set());

  const maxDepth = Math.max(...Array.from(depths.values()));

  // Group by depth
  const layers: Attestation[][] = [];
  for (let d = 0; d <= maxDepth; d++) layers.push([]);
  for (const att of chain) {
    const d = depths.get(att.id) || 0;
    layers[d].push(att);
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ marginBottom: '0.75rem' }}>Supply Chain</h3>
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.25rem',
        boxShadow: 'var(--shadow-sm)',
        overflowX: 'auto',
      }}>
        {layers.map((layer, layerIdx) => {
          const layerCost = layer.reduce((sum, a) => sum + a.materialCost + a.labourCost, 0);
          const layerCACost = layer.filter((a) => a.location === 'CA').reduce((sum, a) => sum + a.materialCost + a.labourCost, 0);
          return (
          <div key={layerIdx}>
            {/* Layer header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.4rem',
              padding: '0.3rem 0.5rem',
              background: 'var(--color-border-light)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.7rem',
              color: 'var(--color-text-muted)',
            }}>
              <span style={{ fontWeight: 600 }}>Tier {layerIdx} — {layer.length} supplier{layer.length > 1 ? 's' : ''}</span>
              <span>${layerCost.toLocaleString()} CAD ({layerCACost > 0 ? `${((layerCACost / layerCost) * 100).toFixed(0)}% CA` : '0% CA'})</span>
            </div>
            {/* Layer of nodes */}
            <div style={{
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}>
              {layer.map((att) => {
                const consumed = totalConsumed.get(att.id) || 0;
                const remaining = att.outputQuantity - consumed;
                const overConsumed = consumed > att.outputQuantity;
                const isCanadian = att.location === 'CA';

                return (
                  <div key={att.id} style={{
                    border: `2px solid ${overConsumed ? '#ef4444' : isCanadian ? '#10b981' : '#6366f1'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '0.6rem 0.8rem',
                    background: isCanadian ? '#f0fdf4' : '#f8fafc',
                    minWidth: '180px',
                    maxWidth: '240px',
                    fontSize: '0.75rem',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: '0.25rem', lineHeight: 1.2 }}>
                      {att.productName}
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                      <span className="badge badge-location" style={{ fontSize: '0.65rem' }}>
                        <Flag code={att.location} />
                      </span>
                      {att.isTransformation && (
                        <span className="badge badge-transform" style={{ fontSize: '0.65rem' }}>⚙ transform</span>
                      )}
                      {/* Verification Tier Badge */}
                      {att.isTransformation && att.location === 'CA' ? (
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '0.1rem 0.35rem', borderRadius: '3px' }}>
                          ✓ verified · CA transform
                        </span>
                      ) : att.location === 'CA' ? (
                        <span style={{ fontSize: '0.6rem', fontWeight: 600, color: '#16a34a', background: '#f0fdf4', padding: '0.1rem 0.35rem', borderRadius: '3px' }}>
                          ✓ verified
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.6rem', fontWeight: 500, color: '#6b7280', background: '#f3f4f6', padding: '0.1rem 0.35rem', borderRadius: '3px' }}>
                          ✓ registered
                        </span>
                      )}
                    </div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>
                      <div>Produced: <strong>{att.outputQuantity} {att.outputUnit}</strong></div>
                      <div>${(att.materialCost + att.labourCost).toLocaleString()} CAD</div>
                      {consumed > 0 && (
                        <div style={{ marginTop: '0.2rem' }}>
                          <div style={{ height: '4px', borderRadius: '2px', background: 'var(--color-border)', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(100, (consumed / att.outputQuantity) * 100)}%`,
                              background: overConsumed ? '#ef4444' : '#10b981',
                            }} />
                          </div>
                          <div style={{ fontSize: '0.65rem', marginTop: '0.1rem', color: overConsumed ? '#ef4444' : 'var(--color-text-muted)' }}>
                            {overConsumed
                              ? `⚠ Over-consumed by ${Math.abs(remaining)}`
                              : `${consumed}/${att.outputQuantity} used • ${remaining} remaining`}
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Inputs consumed from upstream */}
                    {att.inputs.length > 0 && (
                      <div style={{ marginTop: '0.35rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.3rem' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem', fontWeight: 600 }}>Consumes:</div>
                        {att.inputs.map((input, iIdx) => {
                          const sourceIdx = idToIndex.get(input.attestationId);
                          const sourceAtt = sourceIdx !== undefined ? chain[sourceIdx] : null;
                          return (
                            <div key={iIdx} style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)', marginBottom: '0.1rem' }}>
                              ← <strong>{input.quantityUsed} {input.unit}</strong> from {sourceAtt ? sourceAtt.productName : input.attestationId.slice(0, 8) + '…'}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Arrows between layers */}
            {layerIdx < layers.length - 1 && (
              <div style={{ textAlign: 'center', padding: '0.4rem 0', color: 'var(--color-text-muted)' }}>
                <svg width="100%" height="24" style={{ display: 'block' }}>
                  <defs>
                    <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                      <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
                    </marker>
                  </defs>
                  <line x1="50%" y1="2" x2="50%" y2="20" stroke="#94a3b8" strokeWidth="2" markerEnd="url(#arrowhead)" />
                </svg>
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
