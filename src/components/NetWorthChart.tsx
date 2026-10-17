import React, { useState } from 'react';

interface DataPoint {
  date: string;
  value: number;
}

interface NetWorthChartProps {
  currentValue: number;
  isDark: boolean;
}

export const NetWorthChart: React.FC<NetWorthChartProps> = ({ currentValue, isDark }) => {
  const [period, setPeriod] = useState<'1W' | '1M' | '3M' | '1Y'>('1M');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Generate realistic data points anchored to the current net worth
  const getData = (): DataPoint[] => {
    switch (period) {
      case '1W':
        return [
          { date: 'Mon', value: currentValue - 320 },
          { date: 'Tue', value: currentValue - 240 },
          { date: 'Wed', value: currentValue - 410 },
          { date: 'Thu', value: currentValue - 150 },
          { date: 'Fri', value: currentValue + 80 },
          { date: 'Sat', value: currentValue - 30 },
          { date: 'Today', value: currentValue },
        ];
      case '1M':
        return [
          { date: 'Sep 18', value: currentValue - 1850 },
          { date: 'Sep 25', value: currentValue - 1200 },
          { date: 'Oct 02', value: currentValue - 750 },
          { date: 'Oct 09', value: currentValue - 420 },
          { date: 'Oct 16', value: currentValue },
        ];
      case '3M':
        return [
          { date: 'Jul', value: currentValue - 3900 },
          { date: 'Aug', value: currentValue - 2800 },
          { date: 'Sep', value: currentValue - 1400 },
          { date: 'Oct', value: currentValue },
        ];
      case '1Y':
        return [
          { date: 'Q4 25', value: currentValue - 8500 },
          { date: 'Q1 26', value: currentValue - 6200 },
          { date: 'Q2 26', value: currentValue - 3800 },
          { date: 'Q3 26', value: currentValue - 1200 },
          { date: 'Present', value: currentValue },
        ];
    }
  };

  const data = getData();
  const minVal = Math.min(...data.map(d => d.value)) * 0.98;
  const maxVal = Math.max(...data.map(d => d.value)) * 1.02;
  const range = maxVal - minVal || 1;

  const width = 600;
  const height = 180;
  const paddingX = 20;
  const paddingY = 25;

  const getX = (i: number) => paddingX + (i / (data.length - 1)) * (width - paddingX * 2);
  const getY = (val: number) => height - paddingY - ((val - minVal) / range) * (height - paddingY * 2);

  // Generate smooth SVG path
  const points = data.map((d, i) => `${getX(i)},${getY(d.value)}`);
  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `M ${getX(0)},${height} L ${points.join(' L ')} L ${getX(data.length - 1)},${height} Z`;

  const activePoint = hoverIndex !== null ? data[hoverIndex] : data[data.length - 1];
  const delta = activePoint.value - data[0].value;
  const deltaPct = data[0].value !== 0 ? (delta / data[0].value) * 100 : 0;

  return (
    <div className="w-full">
      {/* Header with live delta & Period Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-2xl font-black tracking-tight tabular-nums font-mono">
            ${activePoint.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold mt-0.5">
            <span className={delta >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
              {delta >= 0 ? '+' : ''}${Math.abs(delta).toLocaleString('en-US', { minimumFractionDigits: 2 })} ({delta >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
            </span>
            <span className="text-neutral-500">· {period} growth</span>
          </div>
        </div>

        {/* Period Selector Tabs */}
        <div
          className="flex items-center p-1 rounded-xl border text-xs font-semibold self-start sm:self-auto"
          style={{
            backgroundColor: isDark ? '#14141c' : '#f1f5f9',
            borderColor: isDark ? '#23232e' : '#e2e8f0',
          }}
        >
          {(['1W', '1M', '3M', '1Y'] as const).map(p => (
            <button
              key={p}
              onClick={() => {
                setPeriod(p);
                setHoverIndex(null);
              }}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                period === p
                  ? 'bg-violet-600 text-white shadow-xs font-bold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-36 sm:h-44 overflow-visible"
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={isDark ? 0.35 : 0.25} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaPath} fill="url(#chartGradient)" />

          {/* Main curve */}
          <path
            d={linePath}
            fill="none"
            stroke="#8b5cf6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive Data Nodes */}
          {data.map((d, i) => {
            const cx = getX(i);
            const cy = getY(d.value);
            const isHovered = hoverIndex === i || (hoverIndex === null && i === data.length - 1);

            return (
              <g key={i}>
                {/* Vertical guide line on active */}
                {isHovered && (
                  <line
                    x1={cx}
                    y1={0}
                    x2={cx}
                    y2={height}
                    stroke={isDark ? '#3f3f4e' : '#cbd5e1'}
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                )}

                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 5 : 3}
                  className="transition-all duration-150 cursor-pointer"
                  fill="#8b5cf6"
                  stroke={isDark ? '#0e0e12' : '#ffffff'}
                  strokeWidth={2}
                />

                {/* Touch/mouse hover hit area */}
                <rect
                  x={cx - 20}
                  y={0}
                  width={40}
                  height={height}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverIndex(i)}
                />
              </g>
            );
          })}
        </svg>

        {/* X-axis date labels */}
        <div className="flex justify-between text-[11px] text-neutral-400 font-mono mt-1 px-1">
          {data.map((d, i) => (
            <span key={i} className="tabular-nums">
              {d.date}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
