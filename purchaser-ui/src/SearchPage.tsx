import { useState } from 'react';

interface SearchResult {
  id: string;
  productName: string;
  productId: string;
  location: string;
  timestamp: string;
  isTransformation: boolean;
  materialCost: number;
  labourCost: number;
}

interface SearchPageProps {
  onProductSelected: (productId: string) => void;
}

function countryFlag(code: string): string {
  const codePoints = code.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints) + ' ' + code.toUpperCase();
}

export function SearchPage({ onProductSelected }: SearchPageProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/attestations/search?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  // Group results by productId
  const grouped = results.reduce((acc, r) => {
    if (!acc.has(r.productId)) acc.set(r.productId, []);
    acc.get(r.productId)!.push(r);
    return acc;
  }, new Map<string, SearchResult[]>());

  return (
    <div>
      <h2>Search Attestations</h2>
      <p>Search by product name, supplier, or country code.</p>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. drone, carbon, CA, Shenzhen..."
          className="form-input"
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {searched && results.length === 0 && !loading && (
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          color: 'var(--color-text-muted)',
          border: '2px dashed var(--color-border)',
          borderRadius: 'var(--radius-lg)',
        }}>
          No attestations found matching "{query}"
        </div>
      )}

      {grouped.size > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {Array.from(grouped.entries()).map(([productId, attestations]) => {
            const finalProduct = attestations.find((a) => a.isTransformation) || attestations[0];
            return (
              <div key={productId} className="card" style={{ cursor: 'pointer' }} onClick={() => onProductSelected(productId)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.25rem' }}>
                      {finalProduct.productName}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                      {attestations.length} attestation(s) •
                      {' '}{[...new Set(attestations.map((a) => a.location))].map((loc) => countryFlag(loc)).join(', ')}
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); onProductSelected(productId); }}>
                    View Report
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
