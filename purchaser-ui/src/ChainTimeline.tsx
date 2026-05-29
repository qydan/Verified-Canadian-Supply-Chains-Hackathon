import { Flag } from './Flag';

interface Attestation {
  id: string;
  productName: string;
  location: string;
  isTransformation: boolean;
  timestamp: string;
  materialCost: number;
  labourCost: number;
}

interface ChainTimelineProps {
  chain: Attestation[];
}

// Flag component used instead

export function ChainTimeline({ chain }: ChainTimelineProps) {
  if (chain.length === 0) return null;

  // Sort by timestamp
  const sorted = [...chain].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ marginBottom: '0.75rem' }}>Chain of Custody Timeline</h3>
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.25rem',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ position: 'relative', paddingLeft: '2rem' }}>
          {/* Vertical line */}
          <div style={{
            position: 'absolute',
            left: '0.6rem',
            top: '0.5rem',
            bottom: '0.5rem',
            width: '2px',
            background: 'var(--color-border)',
          }} />

          {sorted.map((att, idx) => {
            const isCA = att.location === 'CA';
            const date = new Date(att.timestamp);
            return (
              <div key={att.id} style={{
                position: 'relative',
                paddingBottom: idx < sorted.length - 1 ? '1.25rem' : 0,
              }}>
                {/* Dot */}
                <div style={{
                  position: 'absolute',
                  left: '-1.65rem',
                  top: '0.3rem',
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: isCA ? '#10b981' : '#6366f1',
                  border: '2px solid var(--color-surface)',
                  boxShadow: '0 0 0 2px ' + (isCA ? '#10b981' : '#6366f1'),
                }} />

                {/* Content */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text)' }}>
                      {att.productName}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
                      <Flag code={att.location} />
                      {att.isTransformation && <span style={{ marginLeft: '0.5rem', color: 'var(--color-primary)' }}>⚙ transformation</span>}
                      <span style={{ marginLeft: '0.5rem' }}>• ${(att.materialCost + att.labourCost).toFixed(0)}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    {date.toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
