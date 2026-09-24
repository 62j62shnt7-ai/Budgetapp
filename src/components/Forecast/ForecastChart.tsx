import React from 'react';
import type { MonthlyForecast } from '../../types';
import { formatMoney } from '../../engine/dateUtils';

interface ForecastChartProps {
  data: MonthlyForecast[];
}

export const ForecastChart: React.FC<ForecastChartProps> = ({ data }) => {
  if (!data || data.length === 0) return null;

  const width = 800;
  const height = 260;
  const padding = { top: 30, right: 30, bottom: 40, left: 60 };

  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const balances = data.map((d) => d.balance);
  const minVal = Math.min(0, ...balances);
  const maxVal = Math.max(10000, ...balances);
  const range = maxVal - minVal || 1;

  const getY = (val: number) => padding.top + chartH - ((val - minVal) / range) * chartH;
  const getX = (idx: number) => padding.left + (idx / Math.max(1, data.length - 1)) * chartW;

  const zeroY = getY(0);

  const points = data.map((d, idx) => ({ x: getX(idx), y: getY(d.balance) }));

  // Generate smooth cubic bezier curve path
  let pathD = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    pathD += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }

  // Area under curve down to zero or bottom
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)},${(padding.top + chartH).toFixed(1)} L ${points[0].x.toFixed(1)},${(padding.top + chartH).toFixed(1)} Z`;

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', minWidth: '600px', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Zero baseline */}
        {minVal < 0 && (
          <line
            x1={padding.left}
            y1={zeroY}
            x2={width - padding.right}
            y2={zeroY}
            stroke="#f43f5e"
            strokeDasharray="4 4"
            strokeWidth="1.5"
            opacity="0.8"
          />
        )}

        {/* Area fill */}
        <path d={areaD} fill="url(#chartGradient)" />

        {/* Main curve */}
        <path d={pathD} fill="none" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" />

        {/* Data points & labels */}
        {points.map((pt, idx) => {
          const item = data[idx];
          const isNegative = item.balance < 0;
          return (
            <g key={item.month}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={4.5}
                fill={isNegative ? '#f43f5e' : '#6366f1'}
                stroke="var(--bg-surface)"
                strokeWidth="2"
              />
              {/* X axis month labels */}
              <text
                x={pt.x}
                y={height - 12}
                textAnchor="middle"
                fontSize="11"
                fill="var(--text-muted)"
                fontFamily="var(--font-main)"
              >
                {item.month.slice(5)}
              </text>
            </g>
          );
        })}

        {/* Y Axis ticks */}
        <text
          x={padding.left - 8}
          y={padding.top + 5}
          textAnchor="end"
          fontSize="10"
          fill="var(--text-dim)"
        >
          {formatMoney(maxVal)}
        </text>
        <text
          x={padding.left - 8}
          y={padding.top + chartH}
          textAnchor="end"
          fontSize="10"
          fill="var(--text-dim)"
        >
          {formatMoney(minVal)}
        </text>
      </svg>
    </div>
  );
};
