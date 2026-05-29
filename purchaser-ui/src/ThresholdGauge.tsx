interface ThresholdGaugeProps {
  percent: number;
  designation: 'PRODUCT_OF_CANADA' | 'MADE_IN_CANADA' | 'NONE';
}

export function ThresholdGauge({ percent, designation }: ThresholdGaugeProps) {
  const clampedPercent = Math.min(100, Math.max(0, percent));

  // Calculate position on the bar (0-100%)
  const markerPos = clampedPercent;

  // How far to next threshold
  const distTo51 = 51 - percent;
  const distTo98 = 98 - percent;

  let hint = '';
  if (designation === 'NONE' && percent < 51) {
    hint = `Need ${distTo51.toFixed(1)}% more Canadian content for "Made in Canada"`;
  } else if (designation === 'MADE_IN_CANADA') {
    hint = `Need ${distTo98.toFixed(1)}% more Canadian content for "Product of Canada"`;
  }

  return (
    <div style={{
      margin: '1.5rem 0',
      padding: '1.25rem',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Designation Thresholds</h3>

      {/* Threshold bar */}
      <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
        {/* Track */}
        <div style={{
          height: '1.5rem',
          borderRadius: '999px',
          background: 'linear-gradient(90deg, #ef4444 0%, #ef4444 51%, #f59e0b 51%, #f59e0b 98%, #10b981 98%, #10b981 100%)',
          position: 'relative',
          overflow: 'visible',
        }}>
          {/* 51% threshold marker */}
          <div style={{
            position: 'absolute',
            left: '51%',
            top: '-4px',
            bottom: '-4px',
            width: '2px',
            background: '#fff',
            boxShadow: '0 0 4px rgba(0,0,0,0.3)',
          }} />
          {/* 98% threshold marker */}
          <div style={{
            position: 'absolute',
            left: '98%',
            top: '-4px',
            bottom: '-4px',
            width: '2px',
            background: '#fff',
            boxShadow: '0 0 4px rgba(0,0,0,0.3)',
          }} />
        </div>

        {/* Current position indicator */}
        <div style={{
          position: 'absolute',
          left: `${markerPos}%`,
          top: '-8px',
          transform: 'translateX(-50%)',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: '#1e293b',
          border: '3px solid #fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          transition: 'left 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />

        {/* Labels below */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
          <span>0%</span>
          <span style={{ position: 'absolute', left: '51%', transform: 'translateX(-50%)' }}>51%</span>
          <span style={{ position: 'absolute', left: '98%', transform: 'translateX(-50%)' }}>98%</span>
          <span>100%</span>
        </div>

        {/* Zone labels */}
        <div style={{ display: 'flex', marginTop: '1.25rem', fontSize: '0.72rem', fontWeight: 500 }}>
          <span style={{ width: '51%', textAlign: 'center', color: '#991b1b' }}>No Designation</span>
          <span style={{ width: '47%', textAlign: 'center', color: '#92400e' }}>Made in Canada</span>
          <span style={{ width: '2%', textAlign: 'right', color: '#065f46', whiteSpace: 'nowrap', marginLeft: '0.25rem' }}>Product of Canada</span>
        </div>
      </div>

      {/* Hint */}
      {hint && (
        <p style={{
          margin: 0,
          fontSize: '0.82rem',
          color: 'var(--color-primary)',
          fontWeight: 500,
          textAlign: 'center',
        }}>
          {hint}
        </p>
      )}
    </div>
  );
}
