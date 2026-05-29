import { useMemo, useState } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  Line,
} from 'react-simple-maps';
import { Flag } from './Flag';

// ============================================================================
// Country coordinates
// ============================================================================

const COUNTRY_COORDS: Record<string, [number, number]> = {
  CA: [-96.8, 56.1],
  US: [-98.6, 39.8],
  CN: [104.2, 35.9],
  MX: [-102.6, 23.6],
  BR: [-51.9, -14.2],
  DE: [10.5, 51.2],
  FR: [2.2, 46.2],
  GB: [-1.2, 52.9],
  IN: [78.9, 20.6],
  IT: [12.6, 41.9],
  JP: [138.3, 36.2],
  KR: [127.8, 35.9],
  AU: [133.8, -25.3],
  IL: [34.8, 31.0],
  TW: [121.0, 23.7],
};

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// ============================================================================
// Types
// ============================================================================

interface ChainAttestation {
  id: string;
  productName: string;
  location: string;
  isTransformation: boolean;
  materialCost: number;
  labourCost: number;
  timestamp: string;
  inputs: Array<{ attestationId: string; quantityUsed: number; unit: string }>;
}

interface SupplyChainMapProps {
  chain: ChainAttestation[];
}

interface MapNode {
  country: string;
  coords: [number, number];
  attestations: ChainAttestation[];
}

function countryFlag(code: string): string {
  return code.toUpperCase();
}

// ============================================================================
// Component
// ============================================================================

export function SupplyChainMap({ chain }: SupplyChainMapProps) {
  const [selectedNode, setSelectedNode] = useState<MapNode | null>(null);

  const { nodes, edges } = useMemo(() => {
    const idToAttestation = new Map<string, ChainAttestation>();
    chain.forEach((att) => idToAttestation.set(att.id, att));

    // Group by country
    const countryNodes = new Map<string, MapNode>();
    for (const att of chain) {
      const existing = countryNodes.get(att.location);
      if (existing) {
        existing.attestations.push(att);
      } else {
        const coords = COUNTRY_COORDS[att.location] || [0, 30];
        countryNodes.set(att.location, { country: att.location, coords, attestations: [att] });
      }
    }

    // Build edges between countries
    const edgeSet = new Set<string>();
    const edgeList: Array<{ from: [number, number]; to: [number, number] }> = [];
    for (const att of chain) {
      for (const input of att.inputs) {
        const sourceAtt = idToAttestation.get(input.attestationId);
        if (sourceAtt && sourceAtt.location !== att.location) {
          const key = `${sourceAtt.location}->${att.location}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            const fromNode = countryNodes.get(sourceAtt.location);
            const toNode = countryNodes.get(att.location);
            if (fromNode && toNode) {
              edgeList.push({ from: fromNode.coords, to: toNode.coords });
            }
          }
        }
      }
    }

    return { nodes: Array.from(countryNodes.values()), edges: edgeList };
  }, [chain]);

  if (chain.length === 0) return null;

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ marginBottom: '0.75rem' }}>Supply Chain Map</h3>
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
        position: 'relative',
      }}>
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 120, center: [0, 30] }}
          style={{ width: '100%', height: 'auto' }}
          width={800}
          height={400}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#e2e8f0"
                  stroke="#cbd5e1"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: 'none' },
                    hover: { outline: 'none', fill: '#cbd5e1' },
                    pressed: { outline: 'none' },
                  }}
                />
              ))
            }
          </Geographies>

          {edges.map((edge, idx) => (
            <Line
              key={idx}
              from={edge.from}
              to={edge.to}
              stroke="#6366f1"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray="4 4"
            />
          ))}

          {nodes.map((node) => {
            const isCanadian = node.country === 'CA';
            const hasTransformation = node.attestations.some((a) => a.isTransformation);
            const isSelected = selectedNode?.country === node.country;
            return (
              <Marker key={node.country} coordinates={node.coords}>
                {isCanadian && (
                  <circle r={14} fill="none" stroke="#10b981" strokeWidth={2} opacity={0.4}>
                    <animate attributeName="r" from="10" to="20" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.6" to="0" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle
                  r={hasTransformation ? 10 : 7}
                  fill={isSelected ? '#f59e0b' : isCanadian ? '#10b981' : '#6366f1'}
                  stroke="#fff"
                  strokeWidth={2}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedNode(isSelected ? null : node)}
                />
                <text
                  textAnchor="middle"
                  y={-16}
                  style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', fontWeight: 600, fill: '#1e293b', pointerEvents: 'none' }}
                >
                  {countryFlag(node.country)}
                </text>
                <text
                  textAnchor="middle"
                  y={4}
                  style={{ fontFamily: 'Inter, sans-serif', fontSize: '9px', fontWeight: 700, fill: '#fff', pointerEvents: 'none' }}
                >
                  {node.attestations.length}
                </text>
              </Marker>
            );
          })}
        </ComposableMap>

        {/* Popup */}
        {selectedNode && (
          <div style={{
            position: 'absolute',
            bottom: '1rem',
            left: '1rem',
            right: '1rem',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            boxShadow: 'var(--shadow-lg)',
            maxHeight: '180px',
            overflowY: 'auto',
            zIndex: 10,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: '0.85rem' }}>
                <Flag code={selectedNode.country} /> — {selectedNode.attestations.length} attestation(s)
              </strong>
              <button
                onClick={() => setSelectedNode(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}
              >
                ✕
              </button>
            </div>
            {selectedNode.attestations.map((att) => (
              <div key={att.id} style={{
                padding: '0.5rem 0.6rem',
                marginBottom: '0.35rem',
                background: 'var(--color-border-light)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
              }}>
                <div style={{ fontWeight: 600 }}>{att.productName}</div>
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem', marginTop: '0.15rem' }}>
                  Cost: ${(att.materialCost + att.labourCost).toFixed(2)}
                  {att.isTransformation && <span style={{ marginLeft: '0.5rem', color: 'var(--color-primary)' }}>⚙ transformation</span>}
                  <span style={{ marginLeft: '0.5rem' }}>{new Date(att.timestamp).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: '1.5rem',
        justifyContent: 'center',
        marginTop: '0.75rem',
        fontSize: '0.78rem',
        color: 'var(--color-text-muted)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
          Canadian
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />
          Non-Canadian
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: 16, height: 2, background: '#6366f1', display: 'inline-block', borderRadius: 1 }} />
          Material flow
        </span>
      </div>
    </div>
  );
}
