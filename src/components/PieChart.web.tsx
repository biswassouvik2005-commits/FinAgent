import React from 'react';

interface CategoryItem {
  category: string;
  amount: number;
}

interface PieChartProps {
  data: CategoryItem[];
  isDark: boolean;
  colors?: string[];
}

const defaultColors = ['#1DA1F2', '#17BF63', '#F45D22', '#794BC4', '#F59E0B', '#E1E8ED'];

export const PieChart: React.FC<PieChartProps> = ({ data, isDark, colors = defaultColors }) => {
  const items = data.filter(item => Number.isFinite(item.amount) && item.amount > 0);
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  if (!total) return null;

  let angle = 0;
  const slices = items.map((item, index) => {
    const fraction = item.amount / total;
    const nextAngle = angle + fraction * 360;
    const point = (degrees: number) => {
      const radians = ((degrees - 90) * Math.PI) / 180;
      return { x: 65 + 55 * Math.cos(radians), y: 65 + 55 * Math.sin(radians) };
    };
    const from = point(angle);
    const to = point(nextAngle);
    const path = fraction > 0.999
      ? 'M65 10 A55 55 0 1 1 65 120 A55 55 0 1 1 65 10'
      : `M65 65 L${from.x} ${from.y} A55 55 0 ${fraction > 0.5 ? 1 : 0} 1 ${to.x} ${to.y} Z`;
    angle = nextAngle;
    return { ...item, color: colors[index % colors.length], percentage: Math.round(fraction * 100), path };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0' }}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        {slices.map((slice, index) => <path key={`${slice.category}-${index}`} d={slice.path} fill={slice.color} stroke={isDark ? '#27272a' : '#fff'} strokeWidth="2" />)}
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {slices.map(slice => (
          <div key={slice.category} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ width: 9, height: 9, borderRadius: 5, background: slice.color, flexShrink: 0 }} />
            <span style={{ color: isDark ? '#d4d4d8' : '#3f3f46', flex: 1 }}>{slice.category}</span>
            <strong style={{ color: isDark ? '#f4f4f5' : '#18181b' }}>{slice.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</strong>
            <span style={{ width: 26, textAlign: 'right', color: isDark ? '#a1a1aa' : '#71717a' }}>{slice.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};
