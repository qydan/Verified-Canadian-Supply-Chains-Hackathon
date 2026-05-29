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

const COLORS = [
  '#10b981', // CA - green
  '#6366f1', // US - indigo
  '#f59e0b', // CN - amber
  '#ec4899', // DE - pink
  '#8b5cf6', // JP - purple
  '#14b8a6', // KR - teal
  '#f97316', // GB - orange
  '#06b6d4', // FR - cyan
  '#ef4444', // IL - red
  '#84cc16', // IN - lime
  '#a855f7', // TW - violet
  '#64748b', // other - slate
];

function countryFlag(code: string): string {
  const codePoints = code.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function CostPieChart({ chain }: CostPieChartProps) {
  const data = useMemo(() => {
    const costByCountry = new Map<string, number>();
    for (const att of chain) {
      const cost = att.materialCost + att.labourCost;
      costByCountry.set(att.location, (costByCountry.get(att.location) || 0) + cost);
    }
    return Array.from(costByCountry.entries())
      .map(([country, value]) => ({ name: `${countryFlag(country)} ${country}`, value, country }))
      .sort((a, b) => b.value - a.value);
  }, [chain]);

  if (data.length === 0) return null;

  const countryColorMap = new Map<string, string>();
  const countries = [...new Set(chain.map((a) => a.location))].sort();
  countries.forEach((c, i) => countryColorMap.set(c, COLORS[i % COLORS.length]));

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
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              outerRadius={90}
              dataKey="value"
              label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(1)}%`}
              labelLine={true}
            >
              {data.map((entry) => (
                <Cell key={entry.country} fill={countryColorMap.get(entry.country) || '#64748b'} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
