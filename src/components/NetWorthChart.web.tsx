import React, { useState } from 'react';

interface NetWorthChartProps {
  currentValue: number;
  isDark: boolean;
}

const dataFor = (period: string, value: number) => {
  const offsets: Record<string, number[]> = {
    '1W': [-320, -240, -410, -150, 80, -30, 0],
    '1M': [-1850, -1200, -750, -420, 0],
    '3M': [-3900, -2800, -1400, 0],
    '1Y': [-8500, -6200, -3800, -1200, 0],
  };
  const dates: Record<string, string[]> = {
    '1W': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'],
    '1M': ['Sep 18', 'Sep 25', 'Oct 02', 'Oct 09', 'Today'],
    '3M': ['Jul', 'Aug', 'Sep', 'Today'],
    '1Y': ['Q4 25', 'Q1 26', 'Q2 26', 'Q3 26', 'Now'],
  };
  return (offsets[period] ?? offsets['1M']).map((offset, index) => ({
    date: dates[period]?.[index] ?? `Point ${index + 1}`,
    value: value + offset,
  }));
};

export const NetWorthChart: React.FC<NetWorthChartProps> = ({ currentValue, isDark }) => {
  const [period, setPeriod] = useState('1M');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const points = dataFor(period, currentValue);
  const low = Math.min(...points.map(point => point.value));
  const high = Math.max(...points.map(point => point.value));
  const x = (index: number) => 10 + index / Math.max(1, points.length - 1) * 580;
  const y = (value: number) => 160 - (value - low) / (high - low || 1) * 120;
  const coords = points.map((point, index) => `${x(index)},${y(point.value)}`);
  const selected = activeIndex ?? points.length - 1;
  const textColor = isDark ? '#fafafa' : '#18181b';
  const muted = isDark ? '#a1a1aa' : '#71717a';

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div>
          <strong style={{ color: textColor, fontSize: 21 }}>
            {points[selected].value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </strong>
          <div style={{ color: '#10b981', fontSize: 11, fontWeight: 700 }}>{period} net worth trend</div>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {['1W', '1M', '3M', '1Y'].map(value => (
            <button key={value} onClick={() => { setPeriod(value); setActiveIndex(null); }} style={{
              color: value === period ? '#fff' : muted,
              background: value === period ? '#7c3aed' : 'transparent',
              border: 0, borderRadius: 8, padding: '6px 8px', fontWeight: 700,
            }}>{value}</button>
          ))}
        </div>
      </div>
      <svg viewBox="0 0 600 180" style={{ width: '100%', height: 135 }}>
        <defs><linearGradient id="webWorthFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity=".32" /><stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient></defs>
        <path d={`M ${x(0)},180 L ${coords.join(' L ')} L ${x(points.length - 1)},180 Z`} fill="url(#webWorthFill)" />
        <path d={`M ${coords.join(' L ')}`} fill="none" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" />
        {points.map((point, index) => (
          <g key={point.date}>
            {index === selected ? <line x1={x(index)} x2={x(index)} y1="0" y2="180" stroke={muted} strokeDasharray="4 5" /> : null}
            <circle cx={x(index)} cy={y(point.value)} r={index === selected ? 5 : 3} fill="#8b5cf6" onMouseEnter={() => setActiveIndex(index)} />
            <rect x={x(index) - 20} y="0" width="40" height="180" fill="transparent" onMouseEnter={() => setActiveIndex(index)} />
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: muted, fontSize: 10 }}>
        {points.map((point, index) => <span key={`${point.date}-${index}`}>{point.date}</span>)}
      </div>
    </div>
  );
};
