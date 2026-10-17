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
  if (!data || data.length === 0) return null;

  const total = data.reduce((sum, item) => sum + (item.amount || 0), 0);
  if (total === 0) return null;

  // Compute angles for SVG pie slices
  let cumulativeAngle = 0;
  const radius = 55;
  const cx = 65;
  const cy = 65;

  const slices = data.map((item, index) => {
    const value = item.amount || 0;
    const fraction = value / total;
    const angle = fraction * 360;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle += angle;

    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((endAngle - 90) * Math.PI) / 180;

    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy + radius * Math.sin(endRad);

    const largeArcFlag = angle > 180 ? 1 : 0;
    // Single slice full circle special case
    const pathData =
      angle >= 359.99
        ? `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx} ${cy + radius} A ${radius} ${radius} 0 1 1 ${cx} ${cy - radius}`
        : `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

    const color = colors[index % colors.length];

    return {
      ...item,
      color,
      pathData,
      percentage: Math.round(fraction * 100),
    };
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 py-2 w-full">
      <div className="relative shrink-0">
        <svg width="130" height="130" viewBox="0 0 130 130" className="transform -rotate-90">
          {slices.map((slice, i) => (
            <path
              key={i}
              d={slice.pathData}
              fill={slice.color}
              stroke={isDark ? '#27272a' : '#ffffff'}
              strokeWidth="2"
              className="transition-all duration-300 hover:opacity-90"
            />
          ))}
        </svg>
      </div>

      <div className="flex flex-col gap-1.5 w-full text-xs">
        {slices.map((slice, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 truncate">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: slice.color }}
              />
              <span className={`truncate font-medium ${isDark ? 'text-zinc-300' : 'text-neutral-700'}`}>
                {slice.category}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`font-semibold ${isDark ? 'text-zinc-100' : 'text-neutral-900'}`}>
                ${slice.amount.toLocaleString()}
              </span>
              <span className="text-zinc-400 text-[11px] w-7 text-right">
                {slice.percentage}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
