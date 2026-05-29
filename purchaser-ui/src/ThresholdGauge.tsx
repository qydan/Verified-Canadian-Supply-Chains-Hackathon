interface ThresholdGaugeProps {
  percent: number;
  designation: 'PRODUCT_OF_CANADA' | 'MADE_IN_CANADA' | 'NONE';
}

export function ThresholdGauge({ percent, designation }: ThresholdGaugeProps) {
  const clampedPercent = Math.min(100, Math.max(0, percent));

  // How far to next threshold
  const distTo51 = 51 - percent;
  const distTo98 = 98 - percent;

  let hint = '';
  if (designation === 'NONE' && percent < 51) {
    hint = `Need ${distTo51.toFixed(1)}% more Canadian content for "Made in Canada"`;
  } else if (designation === 'MADE_IN_CANADA') {
    hint = `Need ${distTo98.toFixed(1)}% more Canadian content for "Product of Canada"`;
  } else if (designation === 'PRODUCT_OF_CANADA') {
    hint = 'Meets highest threshold — Product of Canada';
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
      <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Designation Thresholds</h3>

      {/* Zone labels above the bar */}
      <div style={{ display: 'flex', marginBottom: '0.4rem', fontSize: '0.7rem', fontWeight: 600 }}>
        <div style={{ width: '51%', textAlign: 'center', color: '#991b1b' }}>No Designation</div>
        <div style={{ width: '47%', textAlign: 'center', color: '#92400e' }}>Made in Canada</div>
        <div style={{ width: '2%' }} />
      </div>

      {/* Track */}
      <div style={{ position: 'relative', height: '1.5rem', marginBottom: '0.5rem' }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '999px',
          overflow: 'hidden',
          display: 'flex',
        }}>
          <div style={{ width: '51%', background: '#fca5a5' }} />
          <div style={{ width: '47%', background: '#fcd34d' }} />
          <div style={{ width: '2%', background: '#6ee7b7' }} />
        </div>

        {/* 51% line */}
        <div style={{
          position: 'absolute',
          left: '51%',
          top: '-2px',
          bottom: '-2px',
          width: '2px',
          background: '#1e293b',
          borderRadius: '1px',
        }} />
        {/* 98% line */}
        <div style={{
          position: 'absolute',
          left: '98%',
          top: '-2px',
          bottom: '-2px',
          width: '2px',
          background: '#1e293b',
          borderRadius: '1px',
        }} />

        {/* Current position indicator */}
        <div style={{
          position: 'absolute',
          left: `${clampedPercent}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          background: '#1e293b',
          border: '3px solid #fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          transition: 'left 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </div>

      {/* Threshold labels below */}
      <div style={{ position: 'relative', height: '1.2rem', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
        <span style={{ position: 'absolute', left: 0 }}>0%</span>
        <span style={{ position: 'absolute', left: '51%', transform: 'translateX(-50%)' }}>51%</span>
        <span style={{ position: 'absolute', left: '98%', transform: 'translateX(-50%)' }}>98%</span>
        <span style={{ position: 'absolute', right: 0 }}>100%</span>
      </div>

      {/* Current value + hint */}
      <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text)' }}>
          Current: {percent.toFixed(2)}%
        </span>
        {hint && (
          <p style={{
            margin: '0.35rem 0 0',
            fontSize: '0.8rem',
            color: designation === 'PRODUCT_OF_CANADA' ? 'var(--color-success)' : 'var(--color-primary)',
            fontWeight: 500,
          }}>
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
