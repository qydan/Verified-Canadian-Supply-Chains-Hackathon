import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Attestation {
  location: string;
  materialCost: number;
  labourCost: number;
}

interface CostPieChartProps {
  chain: Attestation[];
}

const COLORS: Record<string, string> = {
  CA: '#10b981',
  US: '#6366f1',
  CN: '#f59e0b',
  DE: '#ec4899',
  JP: '#8b5cf6',
  KR: '#14b8a6',
  GB: '#f97316',
  FR: '#06b6d4',
  IL: '#ef4444',
  IN: '#84cc16',
  TW: '#a855f7',
};

const COUNTRY_NAMES: Record<string, string> = {
  CA: 'Canada',
  US: 'United States',
  CN: 'China',
  DE: 'Germany',
  JP: 'Japan',
  KR: 'South Korea',
  GB: 'United Kingdom',
  FR: 'France',
  IL: 'Israel',
  IN: 'India',
  TW: 'Taiwan',
  MX: 'Mexico',
  BR: 'Brazil',
  AU: 'Australia',
  IT: 'Italy',
};

export function CostPieChart({ chain }: CostPieChartProps) {
  const data = useMemo(() => {
    const costByCountry = new Map<string, number>();
    for (const att of chain) {
      const cost = att.materialCost + att.labourCost;
      costByCountry.set(att.location, (costByCountry.get(att.location) || 0) + cost);
    }
    return Array.from(costByCountry.entries())
      .map(([country, value]) => ({
        name: COUNTRY_NAMES[country] || country,
        value,
        country,
      }))
      .sort((a, b) => b.value - a.value);
  }, [chain]);

  if (data.length === 0) return null;

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ marginBottom: '0.75rem' }}>Cost by Country</h3>
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1rem',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              outerRadius={95}
              dataKey="value"
              label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(1)}%`}
              labelLine={true}
            >
              {data.map((entry) => (
                <Cell key={entry.country} fill={COLORS[entry.country] || '#64748b'} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => `$${Number(value).toFixed(2)} CAD`}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
