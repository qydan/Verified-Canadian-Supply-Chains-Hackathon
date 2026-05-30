import { useState } from 'react';

// ============================================================================
// Worked Example — Recovery Drone Chain (12 attestations)
// ============================================================================

const WORKED_EXAMPLE = {
  "product_attestation_id": "att-anchor-0012",
  "attestations": [
    {
      "attestation_id": "att-anchor-0001",
      "version": "1.0",
      "supplier_id": "sup-porcher",
      "timestamp": "2026-03-06T09:00:00Z",
      "action_type": "raw_material_supply",
      "performed_in_country": "FR",
      "parents": [],
      "output": { "name": "PN9 Ripstop Fabric", "quantity_produced": 8.0, "unit": "m2" },
      "costs": { "material_cad": 360.0, "labour_hours": 0.0, "labour_cost_cad": 0.0 },
      "signature": { "algorithm": "ed25519", "value": "DdFl42bZO0UxXeQiH4RZtyaIjmuboJd11r7cgX2nn+O8esEizeE2TGtm0y9KKTGHZ6oNGs5Jx+zfpqbowZCRDQ==" }
    },
    {
      "attestation_id": "att-anchor-0002",
      "version": "1.0",
      "supplier_id": "sup-cousin",
      "timestamp": "2026-03-06T09:00:00Z",
      "action_type": "raw_material_supply",
      "performed_in_country": "FR",
      "parents": [],
      "output": { "name": "Suspension Line (braided)", "quantity_produced": 12.0, "unit": "m" },
      "costs": { "material_cad": 36.0, "labour_hours": 0.0, "labour_cost_cad": 0.0 },
      "signature": { "algorithm": "ed25519", "value": "iFYVhbjHTfOBnfFXZi/b/XicObfMxsAAY6Y2h4Kk5z226kS66MKT2YraguoVU/skwgyQbh07r9m9XhRqz4HUBw==" }
    },
    {
      "attestation_id": "att-anchor-0003",
      "version": "1.0",
      "supplier_id": "sup-mcmaster",
      "timestamp": "2026-03-06T09:00:00Z",
      "action_type": "raw_material_supply",
      "performed_in_country": "US",
      "parents": [],
      "output": { "name": "Heat-Set Threaded Insert", "quantity_produced": 4, "unit": "units" },
      "costs": { "material_cad": 2.0, "labour_hours": 0.0, "labour_cost_cad": 0.0 },
      "signature": { "algorithm": "ed25519", "value": "mLTbjHEzIzw5NP1S9AQXtAHh4B9vUYWZPDTeFTeNcg1pmCGFrT4OTLj1AaUvgXFESIUJx+5+fiiNjb3bqVakCQ==" }
    },
    {
      "attestation_id": "att-anchor-0004",
      "version": "1.0",
      "supplier_id": "sup-mcmaster",
      "timestamp": "2026-03-06T09:00:00Z",
      "action_type": "raw_material_supply",
      "performed_in_country": "US",
      "parents": [],
      "output": { "name": "Phillips Thread-Forming Screw", "quantity_produced": 8, "unit": "units" },
      "costs": { "material_cad": 1.2, "labour_hours": 0.0, "labour_cost_cad": 0.0 },
      "signature": { "algorithm": "ed25519", "value": "jfZpKVyeth/bPYQx1Zz/Fqxf4nIjNruKnlSf7mltvFd9bb7OinCyRTOdKCysMsMCnFxrUrbqJeF6Wm3jLFucDQ==" }
    },
    {
      "attestation_id": "att-anchor-0005",
      "version": "1.0",
      "supplier_id": "sup-avss-corp",
      "timestamp": "2026-03-21T14:30:00Z",
      "action_type": "component_manufacture",
      "performed_in_country": "CA",
      "parents": [
        { "attestation_id": "att-anchor-0001", "content_hash": "1ed6d6cc7b1526c7473ad8532a6f8ae5e17470bc09434f5da51e9d33c2cddaa4", "quantity_consumed": 8.0, "unit": "m2" },
        { "attestation_id": "att-anchor-0002", "content_hash": "5b80da598314031d60883ed06302e2ca2adbba33897612477c6a3847d1d41b42", "quantity_consumed": 12.0, "unit": "m" },
        { "attestation_id": "att-anchor-0003", "content_hash": "d9c93065b394d958c4e0a0ed015a6efa23f5b7f061852c8a5825a2936861d8b7", "quantity_consumed": 4, "unit": "units" },
        { "attestation_id": "att-anchor-0004", "content_hash": "03ab4bbcc8b38a7f39054e227f9818f02c7ce3bb50ca4e8ac5e80c9272f9c6ab", "quantity_consumed": 8, "unit": "units" }
      ],
      "output": { "name": "Parachute Recovery Assembly", "quantity_produced": 1, "unit": "units" },
      "costs": { "material_cad": 0.0, "labour_hours": 6.5, "labour_cost_cad": 520.0 },
      "signature": { "algorithm": "ed25519", "value": "B+m+AQz1dtpWVuz0+WmTNYXUN4fMl4bDwITipycWNWVDOO0Hz1KRZuw0wZCwcYRx+TKNaMgAEwLyCTVANUwQCA==" }
    },
    {
      "attestation_id": "att-anchor-0006",
      "version": "1.0",
      "supplier_id": "sup-protolabs",
      "timestamp": "2026-03-26T09:00:00Z",
      "action_type": "raw_material_supply",
      "performed_in_country": "US",
      "parents": [],
      "output": { "name": "M3E Machined Enclosure", "quantity_produced": 1, "unit": "units" },
      "costs": { "material_cad": 140.0, "labour_hours": 0.0, "labour_cost_cad": 0.0 },
      "signature": { "algorithm": "ed25519", "value": "psel2Q++thTxLzczYStXT0RYwebCYFfKNWtvAuzamDno+Gv0fZ7AtRIm2gPoBR3URAHY9BPSqm69pZZNwVv8Bg==" }
    },
    {
      "attestation_id": "att-anchor-0007",
      "version": "1.0",
      "supplier_id": "sup-tbs",
      "timestamp": "2026-03-26T09:00:00Z",
      "action_type": "raw_material_supply",
      "performed_in_country": "HK",
      "parents": [],
      "output": { "name": "TBS H7 Flight Controller", "quantity_produced": 1, "unit": "units" },
      "costs": { "material_cad": 120.0, "labour_hours": 0.0, "labour_cost_cad": 0.0 },
      "signature": { "algorithm": "ed25519", "value": "61MqCGJs6F/zWD5WCXAMrpOTyORJzr6b0r40mJAInpFvKBFRSqnv6kdHnIdN+vB+OADQCNRu7yXqAm/VLpPDBA==" }
    },
    {
      "attestation_id": "att-anchor-0008",
      "version": "1.0",
      "supplier_id": "sup-sequre",
      "timestamp": "2026-03-26T09:00:00Z",
      "action_type": "raw_material_supply",
      "performed_in_country": "CN",
      "parents": [],
      "output": { "name": "GNSS / GPS Module", "quantity_produced": 1, "unit": "units" },
      "costs": { "material_cad": 35.0, "labour_hours": 0.0, "labour_cost_cad": 0.0 },
      "signature": { "algorithm": "ed25519", "value": "i2QkmySyWv2z4aeNfU7MLyOPNLYWlppPtYoPn++KaKGL7JvKsMVpQDUntPLvxfQ4z5Ng86zhyKKYXXqDWBcsBA==" }
    },
    {
      "attestation_id": "att-anchor-0009",
      "version": "1.0",
      "supplier_id": "sup-mcmaster",
      "timestamp": "2026-03-26T09:00:00Z",
      "action_type": "raw_material_supply",
      "performed_in_country": "VN",
      "parents": [],
      "output": { "name": "O-Ring Seal", "quantity_produced": 4, "unit": "units" },
      "costs": { "material_cad": 2.0, "labour_hours": 0.0, "labour_cost_cad": 0.0 },
      "signature": { "algorithm": "ed25519", "value": "xeyiY8L4jco9fVyADNQIJJ+sJ/LD7f40MxM/PKA3fdcbKc4OgjQejoUHsGMYSfcEFAp31j4Y3FcVbaVLscmhCA==" }
    },
    {
      "attestation_id": "att-anchor-0010",
      "version": "1.0",
      "supplier_id": "sup-mcmaster",
      "timestamp": "2026-03-26T09:00:00Z",
      "action_type": "raw_material_supply",
      "performed_in_country": "US",
      "parents": [],
      "output": { "name": "Phillips Thread-Forming Screw", "quantity_produced": 12, "unit": "units" },
      "costs": { "material_cad": 1.8, "labour_hours": 0.0, "labour_cost_cad": 0.0 },
      "signature": { "algorithm": "ed25519", "value": "OuH5YiC+tDV7Pe5ZZcPtmfYOdZ27hFMsilBHSUnUlwRl90ZHiA2MsbRP/Tk9IDF9R/qhWuX/cZBFFKjlGTq6Cw==" }
    },
    {
      "attestation_id": "att-anchor-0011",
      "version": "1.0",
      "supplier_id": "sup-nanuk",
      "timestamp": "2026-03-26T09:00:00Z",
      "action_type": "raw_material_supply",
      "performed_in_country": "CA",
      "parents": [],
      "output": { "name": "Nanuk 905 Protective Case", "quantity_produced": 1, "unit": "units" },
      "costs": { "material_cad": 60.0, "labour_hours": 0.0, "labour_cost_cad": 0.0 },
      "signature": { "algorithm": "ed25519", "value": "4V1HjnQSdDnRWneUvRqEx1D/XFOe3dXlnCqWXB7e8G6phyFXSn8/kK37zN3WZDxx8Wdby3nwNzzDewdilhkJBw==" }
    },
    {
      "attestation_id": "att-anchor-0012",
      "version": "1.0",
      "supplier_id": "sup-avss-corp",
      "timestamp": "2026-04-10T14:30:00Z",
      "action_type": "final_integration",
      "performed_in_country": "CA",
      "parents": [
        { "attestation_id": "att-anchor-0005", "content_hash": "d27cc6a9997e233e82f0b9cf0bd6c960b4dd68428f86485382914c91dbfe1faf", "quantity_consumed": 1, "unit": "units" },
        { "attestation_id": "att-anchor-0006", "content_hash": "33fdd6a4d2c49871e0f06c29533b371b4a5bf515c4ed07fcd4409f5648ef11ac", "quantity_consumed": 1, "unit": "units" },
        { "attestation_id": "att-anchor-0007", "content_hash": "3ad00996fc579c8355f430c8865cba2dd9286aba9e6fbd9ebf2cc765f7b1e015", "quantity_consumed": 1, "unit": "units" },
        { "attestation_id": "att-anchor-0008", "content_hash": "f48df02ad6882200bde2395cb0aec0604ce3a39c6e83111946c77fcdcc9058f6", "quantity_consumed": 1, "unit": "units" },
        { "attestation_id": "att-anchor-0009", "content_hash": "5cee46f1433bf3a6c706c8596714bb0a974d3cfa39a4b83327b6c7011822b75b", "quantity_consumed": 4, "unit": "units" },
        { "attestation_id": "att-anchor-0010", "content_hash": "f345fd58a7c24d40b2a16ac0664be9af0fbe2f0ac060e748e56ab15f5e4e004b", "quantity_consumed": 12, "unit": "units" },
        { "attestation_id": "att-anchor-0011", "content_hash": "e40eae866395c19824c796c09a95173b4f1ff61c4299bdffbb0474ad7f9e2d50", "quantity_consumed": 1, "unit": "units" }
      ],
      "output": { "name": "Recovery-Capable ISR Drone", "quantity_produced": 1, "unit": "units" },
      "costs": { "material_cad": 0.0, "labour_hours": 5.0, "labour_cost_cad": 400.0 },
      "signature": { "algorithm": "ed25519", "value": "9mshMTY2ShJSjSRCvUNqs4M+rLcITyV5Z8MfSiDJq4lZ9SSeaG2mBcb7uxiRL83L25EVu1u3Bwm1VM0BVJaHAA==" }
    }
  ]
};


// ============================================================================
// Types
// ============================================================================

interface ChainParent {
  attestation_id: string;
  content_hash: string;
  quantity_consumed: number;
  unit: string;
}

interface ChainAttestation {
  attestation_id: string;
  version: string;
  supplier_id: string;
  timestamp: string;
  action_type: string;
  performed_in_country: string;
  parents: ChainParent[];
  output: { name: string; quantity_produced: number; unit: string };
  costs: { material_cad: number; labour_hours: number; labour_cost_cad: number };
  signature: { algorithm: string; value: string };
}

interface ChainRequest {
  product_attestation_id: string;
  attestations: ChainAttestation[];
}

interface Anomaly {
  type: string;
  attestation_id: string;
  details: string;
}

interface VerifyResponse {
  product_attestation_id: string;
  canadian_content_percentage: number;
  designation: string;
  chain_valid: boolean;
  anomalies: Anomaly[];
}

// ============================================================================
// Country flag emoji helper
// ============================================================================

function countryFlag(code: string): string {
  const flags: Record<string, string> = {
    CA: '🇨🇦', US: '🇺🇸', FR: '🇫🇷', CN: '🇨🇳', HK: '🇭🇰', VN: '🇻🇳',
    DE: '🇩🇪', JP: '🇯🇵', KR: '🇰🇷', GB: '🇬🇧', MX: '🇲🇽', IN: '🇮🇳',
  };
  return flags[code] || '🏳️';
}

// ============================================================================
// Main Component
// ============================================================================

export function VerifyChainPage() {
  const [chainJson, setChainJson] = useState('');
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedChain, setParsedChain] = useState<ChainRequest | null>(null);

  function handleLoadExample() {
    const json = JSON.stringify(WORKED_EXAMPLE, null, 2);
    setChainJson(json);
    setParsedChain(WORKED_EXAMPLE as ChainRequest);
    setResult(null);
    setError(null);
  }

  async function handleVerify() {
    setError(null);
    setResult(null);

    let parsed: ChainRequest;
    try {
      parsed = JSON.parse(chainJson);
      if (!parsed.product_attestation_id || !Array.isArray(parsed.attestations)) {
        throw new Error('JSON must have "product_attestation_id" and "attestations" array.');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
      return;
    }

    setParsedChain(parsed);
    setLoading(true);

    try {
      const res = await fetch('/verifier/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Verifier returned ${res.status}: ${text}`);
      }

      const data: VerifyResponse = await res.json();
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Verification request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fade-in">
      <h2>Verify Supply Chain</h2>
      <p style={{ marginBottom: '1.5rem' }}>
        Paste a chain JSON or load the worked example to verify Canadian content and chain integrity.
      </p>

      {/* Load Example Button — prominent for demo */}
      <button
        onClick={handleLoadExample}
        className="btn btn-primary"
        style={{
          marginBottom: '1.25rem',
          fontSize: '1rem',
          padding: '0.85rem 2rem',
          background: 'linear-gradient(135deg, #065f46 0%, #047857 50%, #10b981 100%)',
          boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)',
        }}
      >
        🚁 Load Worked Example — Recovery Drone
      </button>

      {/* Textarea for chain JSON */}
      <div style={{ marginBottom: '1rem' }}>
        <textarea
          value={chainJson}
          onChange={(e) => {
            setChainJson(e.target.value);
            setResult(null);
            setError(null);
          }}
          placeholder='Paste chain JSON here... (must have "product_attestation_id" and "attestations")'
          className="form-input"
          style={{
            width: '100%',
            minHeight: '180px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
            resize: 'vertical',
          }}
        />
      </div>

      {/* Verify Button */}
      <button
        onClick={handleVerify}
        disabled={!chainJson.trim() || loading}
        className="btn btn-primary"
        style={{ marginBottom: '1.5rem' }}
      >
        {loading ? '⏳ Verifying...' : '🔍 Verify Chain'}
      </button>

      {/* Error */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>
          <span className="alert-icon">⚠️</span>
          <div className="alert-content">{error}</div>
        </div>
      )}

      {/* Results */}
      {result && <VerifyResult result={result} chain={parsedChain} />}
    </div>
  );
}

// ============================================================================
// Verify Result Display
// ============================================================================

function VerifyResult({ result, chain }: { result: VerifyResponse; chain: ChainRequest | null }) {
  return (
    <div className="fade-in">
      {/* Designation Banner */}
      <VerifyDesignationBanner designation={result.designation} />

      {/* Canadian Content Gauge */}
      <div style={{ margin: '1.5rem 0' }}>
        <div className="stats-card">
          <p className="stats-label">Canadian Content</p>
          <p className="stats-value">{result.canadian_content_percentage.toFixed(1)}%</p>
        </div>
        <ContentGauge percent={result.canadian_content_percentage} />
      </div>

      {/* Chain Validity */}
      <div className="card" style={{
        marginBottom: '1.5rem',
        borderColor: result.chain_valid ? 'var(--color-success-border)' : 'var(--color-error-border)',
        background: result.chain_valid ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '2rem' }}>{result.chain_valid ? '✅' : '❌'}</span>
          <div>
            <h3 style={{ margin: 0, color: result.chain_valid ? '#065f46' : '#991b1b' }}>
              {result.chain_valid ? 'Chain Valid' : 'Chain Invalid'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: result.chain_valid ? '#047857' : '#b91c1c' }}>
              {result.chain_valid
                ? 'All signatures verified, structure intact, no anomalies detected.'
                : 'One or more integrity checks failed. See anomalies below.'}
            </p>
          </div>
        </div>
      </div>

      {/* Anomalies */}
      {result.anomalies.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>
            Anomalies Detected ({result.anomalies.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {result.anomalies.map((anomaly, idx) => (
              <div key={idx} className="issue-item issue-critical">
                <span>🚨</span>
                <div style={{ flex: 1 }}>
                  <span className="issue-severity" style={{ color: '#991b1b' }}>ANOMALY</span>
                  <span className="issue-type">{anomaly.type}</span>
                  <p className="issue-description">
                    Attestation: <code>{anomaly.attestation_id}</code>
                  </p>
                  {anomaly.details && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>
                      {anomaly.details}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supply Chain DAG */}
      {chain && <SupplyChainDAG chain={chain} />}
    </div>
  );
}

// ============================================================================
// Designation Banner (matches ProvenanceDisplay style)
// ============================================================================

function VerifyDesignationBanner({ designation }: { designation: string }) {
  const config: Record<string, { label: string; className: string; icon: string }> = {
    product_of_canada: { label: 'Product of Canada', className: 'product-of-canada', icon: '🍁' },
    made_in_canada: { label: 'Made in Canada', className: 'made-in-canada', icon: '🏭' },
    none: { label: 'No Canadian Designation', className: 'no-designation', icon: '—' },
  };

  const c = config[designation] || config['none'];

  return (
    <div className={`designation-banner ${c.className}`}>
      <p className="designation-icon">{c.icon}</p>
      <h2 className="designation-label">{c.label}</h2>
    </div>
  );
}

// ============================================================================
// Canadian Content Gauge
// ============================================================================

function ContentGauge({ percent }: { percent: number }) {
  const clampedPercent = Math.min(100, Math.max(0, percent));
  // Thresholds: 51% = Made in Canada, 98% = Product of Canada
  const madeThreshold = 51;
  const productThreshold = 98;

  return (
    <div style={{
      margin: '1rem 0',
      padding: '1.25rem',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ position: 'relative', height: '2rem', marginBottom: '0.5rem' }}>
        {/* Track */}
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '999px',
          background: 'var(--color-border)',
          overflow: 'hidden',
        }}>
          {/* Fill */}
          <div style={{
            height: '100%',
            width: `${clampedPercent}%`,
            borderRadius: '999px',
            background: clampedPercent >= productThreshold
              ? 'linear-gradient(90deg, #10b981, #065f46)'
              : clampedPercent >= madeThreshold
                ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                : 'linear-gradient(90deg, #94a3b8, #64748b)',
            transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
          }} />
        </div>
        {/* Threshold markers */}
        <div style={{
          position: 'absolute',
          left: `${madeThreshold}%`,
          top: 0,
          bottom: 0,
          width: '2px',
          background: '#d97706',
          opacity: 0.7,
        }} />
        <div style={{
          position: 'absolute',
          left: `${productThreshold}%`,
          top: 0,
          bottom: 0,
          width: '2px',
          background: '#065f46',
          opacity: 0.7,
        }} />
      </div>
      {/* Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
        <span>0%</span>
        <span style={{ position: 'relative', left: '1%' }}>51% Made in Canada</span>
        <span style={{ position: 'relative', left: '-2%' }}>98% Product of Canada</span>
        <span>100%</span>
      </div>
    </div>
  );
}


// ============================================================================
// Supply Chain DAG Visualization
// ============================================================================

function SupplyChainDAG({ chain }: { chain: ChainRequest }) {
  const attestations = chain.attestations;
  if (attestations.length === 0) return null;

  // Build lookup
  const idToAtt = new Map<string, ChainAttestation>();
  attestations.forEach((att) => idToAtt.set(att.attestation_id, att));

  // Calculate depth via BFS from root (product_attestation_id is the leaf/final product)
  const depths = new Map<string, number>();

  function getDepth(id: string, visited: Set<string>): number {
    if (depths.has(id)) return depths.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);
    const att = idToAtt.get(id);
    if (!att || att.parents.length === 0) {
      depths.set(id, 0);
      return 0;
    }
    const maxParentDepth = Math.max(
      ...att.parents.map((p) => getDepth(p.attestation_id, visited))
    );
    const d = maxParentDepth + 1;
    depths.set(id, d);
    return d;
  }

  for (const att of attestations) {
    getDepth(att.attestation_id, new Set());
  }

  const maxDepth = Math.max(...Array.from(depths.values()));

  // Group by depth
  const layers: ChainAttestation[][] = [];
  for (let d = 0; d <= maxDepth; d++) layers.push([]);
  for (const att of attestations) {
    const d = depths.get(att.attestation_id) || 0;
    layers[d].push(att);
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ marginBottom: '0.75rem' }}>Supply Chain DAG</h3>
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.25rem',
        boxShadow: 'var(--shadow-sm)',
        overflowX: 'auto',
      }}>
        {layers.map((layer, layerIdx) => (
          <div key={layerIdx}>
            {/* Layer header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.5rem',
              padding: '0.3rem 0.6rem',
              background: 'var(--color-border-light)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.72rem',
              color: 'var(--color-text-muted)',
            }}>
              <span style={{ fontWeight: 600 }}>
                {layerIdx === maxDepth ? '🏁 Final Product' : `Tier ${layerIdx} — ${layer.length} node${layer.length > 1 ? 's' : ''}`}
              </span>
            </div>

            {/* Nodes */}
            <div style={{
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginBottom: '0.5rem',
            }}>
              {layer.map((att) => {
                const isCanadian = att.performed_in_country === 'CA';
                const totalCost = att.costs.material_cad + att.costs.labour_cost_cad;

                return (
                  <div key={att.attestation_id} style={{
                    border: `2px solid ${isCanadian ? '#10b981' : '#6366f1'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '0.7rem 0.9rem',
                    background: isCanadian ? '#f0fdf4' : '#f8fafc',
                    minWidth: '180px',
                    maxWidth: '250px',
                    fontSize: '0.75rem',
                    transition: 'box-shadow 0.2s',
                  }}>
                    {/* Output name */}
                    <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.3rem', lineHeight: 1.2 }}>
                      {att.output.name}
                    </div>

                    {/* Country + action badges */}
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                      <span className="badge badge-location" style={{ fontSize: '0.68rem' }}>
                        {countryFlag(att.performed_in_country)} {att.performed_in_country}
                      </span>
                      <span className="badge badge-transform" style={{ fontSize: '0.68rem' }}>
                        {att.action_type.replace(/_/g, ' ')}
                      </span>
                      {isCanadian && (
                        <span style={{
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          color: '#15803d',
                          background: '#dcfce7',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '3px',
                        }}>
                          🍁 CA
                        </span>
                      )}
                    </div>

                    {/* Costs */}
                    <div style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>
                      <div>Output: <strong>{att.output.quantity_produced} {att.output.unit}</strong></div>
                      {totalCost > 0 && <div>${totalCost.toLocaleString()} CAD</div>}
                      {att.costs.labour_hours > 0 && (
                        <div>{att.costs.labour_hours}h labour</div>
                      )}
                    </div>

                    {/* Parents consumed */}
                    {att.parents.length > 0 && (
                      <div style={{ marginTop: '0.35rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.3rem' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '0.15rem' }}>
                          Consumes:
                        </div>
                        {att.parents.map((p, pIdx) => {
                          const sourceAtt = idToAtt.get(p.attestation_id);
                          return (
                            <div key={pIdx} style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)', marginBottom: '0.1rem' }}>
                              ← {p.quantity_consumed} {p.unit} from {sourceAtt ? sourceAtt.output.name : p.attestation_id}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Arrow between layers */}
            {layerIdx < layers.length - 1 && (
              <div style={{ textAlign: 'center', padding: '0.3rem 0', color: 'var(--color-text-muted)' }}>
                <svg width="100%" height="24" style={{ display: 'block' }}>
                  <defs>
                    <marker id="dag-arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                      <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
                    </marker>
                  </defs>
                  <line x1="50%" y1="2" x2="50%" y2="20" stroke="#94a3b8" strokeWidth="2" markerEnd="url(#dag-arrowhead)" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
