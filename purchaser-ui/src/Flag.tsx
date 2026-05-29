/**
 * Renders a country flag using the flag-icons CSS library.
 * Falls back to country code text if the class doesn't match.
 */
export function Flag({ code, showCode = true }: { code: string; showCode?: boolean }) {
  const lower = code.toLowerCase();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
      <span
        className={`fi fi-${lower}`}
        style={{ fontSize: '1em', lineHeight: 1 }}
      />
      {showCode && <span>{code.toUpperCase()}</span>}
    </span>
  );
}
