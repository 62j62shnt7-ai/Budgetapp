import React, { useState, useMemo } from 'react';
import type { CashEntry } from '../../types';
import { DateUtils, formatMoney } from '../../engine/dateUtils';

interface ForecastChartProps {
  entries: CashEntry[];
  totalCash: number;
  rangeMonths: number;
  mode: 'entries' | 'monthly';
  simAmount?: number;
  simDate?: string;
  onSelectDate?: (date: string) => void;
}

interface SeriesPoint {
  index: number;
  date: string;
  shortLabel: string;
  fullLabel: string;
  category?: string;
  type?: 'income' | 'expense';
  amount?: number;
  delta?: number;
  openingBalance: number;
  closingBalance: number;
  balance: number;
  simulatedBalance: number;
  isPostSim: boolean;
  safeToSpend: number;
  net: number;
  isOpening?: boolean;
  income?: number;
  expense?: number;
  incomeCount?: number;
  expenseCount?: number;
}

export const ForecastChart: React.FC<ForecastChartProps> = ({
  entries,
  totalCash,
  rangeMonths,
  mode,
  simAmount = 0,
  simDate = '',
  onSelectDate,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const today = DateUtils.todayString();
  const currentYm = DateUtils.currentYearMonth();
  const cutoffDate = DateUtils.addMonths(today, rangeMonths);
  const isSimActive = simAmount > 0 && !!simDate;

  // Build time series based on mode
  const series: SeriesPoint[] = useMemo(() => {
    const list: SeriesPoint[] = [];

    if (mode === 'entries') {
      // Starting balance node at Today
      list.push({
        index: 0,
        date: today,
        shortLabel: 'Today',
        fullLabel: `${DateUtils.formatDisplayDate(today)} (Starting Balance)`,
        category: 'Starting Balance',
        openingBalance: totalCash,
        closingBalance: totalCash,
        balance: totalCash,
        simulatedBalance: totalCash,
        isPostSim: false,
        safeToSpend: totalCash,
        net: 0,
        isOpening: true,
      });

      // Filter entries within date range [today, cutoffDate]
      const filtered = entries
        .filter((e) => e.date && e.date >= today && e.date <= cutoffDate)
        .sort((a, b) => {
          if (a.date !== b.date) return a.date < b.date ? -1 : 1;
          if (a.type !== b.type) return a.type === 'income' ? -1 : 1;
          return 0;
        });

      let running = totalCash;
      filtered.forEach((entry, idx) => {
        const amt = Number(entry.amount || 0);
        const delta = entry.type === 'income' ? amt : -amt;
        const prevBal = running;
        running = Math.round((running + delta) * 100) / 100;

        const [ey, em, ed] = DateUtils.parseDate(entry.date);
        const dObj = new Date(Date.UTC(ey, em - 1, ed));
        const shortLabel = dObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
        const fullLabel = DateUtils.formatDisplayDate(entry.date);

        list.push({
          index: idx + 1,
          date: entry.date,
          shortLabel,
          fullLabel,
          category: entry.category || (entry.type === 'income' ? 'Income' : 'Expense'),
          type: entry.type,
          amount: amt,
          delta,
          openingBalance: prevBal,
          closingBalance: running,
          balance: running,
          simulatedBalance: running,
          isPostSim: false,
          safeToSpend: 0,
          net: delta,
        });
      });
    } else {
      // Monthly mode
      const monthlyIncomes: Record<string, number> = {};
      const monthlyExpenses: Record<string, number> = {};
      const monthlyIncomeCount: Record<string, number> = {};
      const monthlyExpenseCount: Record<string, number> = {};

      entries.forEach((entry) => {
        const month = DateUtils.getMonthKey(entry.date);
        if (!month) return;
        const amount = Number(entry.amount || 0);
        if (entry.type === 'income') {
          monthlyIncomes[month] = (monthlyIncomes[month] || 0) + amount;
          monthlyIncomeCount[month] = (monthlyIncomeCount[month] || 0) + 1;
        } else {
          monthlyExpenses[month] = (monthlyExpenses[month] || 0) + amount;
          monthlyExpenseCount[month] = (monthlyExpenseCount[month] || 0) + 1;
        }
      });

      const [startYear, startMonth] = currentYm.split('-').map(Number);
      let running = totalCash;

      for (let i = 0; i < rangeMonths; i++) {
        const y = startYear + Math.floor((startMonth - 1 + i) / 12);
        const m = ((startMonth - 1 + i) % 12) + 1;
        const monthKey = `${y}-${String(m).padStart(2, '0')}`;

        const income = monthlyIncomes[monthKey] || 0;
        const expense = monthlyExpenses[monthKey] || 0;
        const net = Math.round((income - expense) * 100) / 100;
        const opening = running;
        running = Math.round((running + net) * 100) / 100;

        const dateObj = new Date(Date.UTC(y, m - 1, 1));
        const shortLabel = dateObj.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
        const fullLabel = dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

        list.push({
          index: i,
          date: `${monthKey}-01`,
          shortLabel,
          fullLabel,
          openingBalance: opening,
          closingBalance: running,
          balance: running,
          simulatedBalance: running,
          isPostSim: false,
          safeToSpend: 0,
          net,
          income,
          expense,
          incomeCount: monthlyIncomeCount[monthKey] || 0,
          expenseCount: monthlyExpenseCount[monthKey] || 0,
        });
      }
    }

    // Backward pass for safeToSpend
    let minFromRight = Infinity;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i].balance;
      if (b < minFromRight) minFromRight = b;
      list[i].safeToSpend = Math.max(0, minFromRight);
    }

    // Apply simulation if active
    if (isSimActive) {
      list.forEach((s) => {
        let isPost = false;
        if (s.date) {
          isPost = s.date >= simDate;
        }
        s.isPostSim = isPost;
        s.simulatedBalance = isPost ? s.balance - simAmount : s.balance;
      });
    }

    return list;
  }, [entries, totalCash, rangeMonths, mode, today, cutoffDate, currentYm, isSimActive, simAmount, simDate]);

  if (series.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
        No forecast data available
      </div>
    );
  }

  // Layout & Coordinate system
  const viewBoxW = 1000;
  const viewBoxH = 340;
  const padL = 75;
  const padR = 40;
  const padT = 30;
  const padB = 45;

  const chartW = viewBoxW - padL - padR;
  const chartH = viewBoxH - padT - padB;

  const baseValues = series.map((s) => s.balance);
  const simValues = isSimActive ? series.map((s) => s.simulatedBalance) : [];
  const allValues = [...baseValues, ...simValues];

  let rawMin = Math.min(...allValues);
  let rawMax = Math.max(...allValues);

  if (rawMin === rawMax) {
    if (rawMin >= 0) {
      rawMin = 0;
      rawMax = rawMin === 0 ? 1000 : rawMin * 1.35;
    } else {
      rawMin = rawMin * 1.35;
      rawMax = 0;
    }
  }

  const valMargin = (rawMax - rawMin) * 0.1 || 1000;
  const minVal = Math.min(0, rawMin - valMargin);
  const maxVal = rawMax + valMargin;
  const range = maxVal - minVal || 1;

  const getY = (val: number) => padT + chartH - ((val - minVal) / range) * chartH;
  const getX = (idx: number) => padL + (idx / Math.max(1, series.length - 1)) * chartW;

  const zeroY = getY(0);
  const points = series.map((s, idx) => ({ x: getX(idx), y: getY(s.balance) }));
  const simPoints = isSimActive ? series.map((s, idx) => ({ x: getX(idx), y: getY(s.simulatedBalance) })) : [];
  const simulatedPostIndices = isSimActive
    ? series.map((point, index) => point.isPostSim ? index : -1).filter((index) => index >= 0)
    : [];
  const simulatedLowestIndex = simulatedPostIndices.length > 0
    ? simulatedPostIndices.reduce((lowestIndex, index) =>
        series[index].simulatedBalance < series[lowestIndex].simulatedBalance ? index : lowestIndex)
    : null;
  const simulatedLowestPoint = simulatedLowestIndex === null
    ? null
    : { series: series[simulatedLowestIndex], coordinate: simPoints[simulatedLowestIndex] };

  // Bezier curve generator
  const buildSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return `M ${pts[0]?.x || 0},${pts[0]?.y || 0}`;
    let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  };

  const pathD = buildSmoothPath(points);
  const simPathD = isSimActive ? buildSmoothPath(simPoints) : '';

  // Area under curve
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)},${(padT + chartH).toFixed(1)} L ${points[0].x.toFixed(1)},${(padT + chartH).toFixed(1)} Z`;

  // Grid ticks
  const numGridLines = 5;
  const gridTicks = Array.from({ length: numGridLines + 1 }, (_, i) => {
    const val = minVal + (i / numGridLines) * range;
    return { val, y: getY(val) };
  });

  // Active hover data
  const activePoint = hoverIndex !== null && series[hoverIndex] ? series[hoverIndex] : null;
  const activeCoord = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;

  const cumChange = activePoint ? activePoint.balance - totalCash : 0;
  const cumPct = totalCash !== 0 && activePoint ? ((cumChange / Math.abs(totalCash)) * 100).toFixed(1) : '0';
  const sign = cumChange >= 0 ? '+' : '';

  return (
    <div className="forecast-line-svg-wrap" style={{ position: 'relative', width: '100%', userSelect: 'none' }}>
      <svg
        className="forecast-line-svg"
        viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', display: 'block', overflow: 'hidden' }}
      >
        <defs>
          <linearGradient id="forecastAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f766e" stopOpacity="0.32" />
            <stop offset="60%" stopColor="#0f766e" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#0f766e" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="forecastLineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0f766e" />
            <stop offset="50%" stopColor="#14b8a6" />
            <stop offset="100%" stopColor="#2dd4bf" />
          </linearGradient>
        </defs>

        {/* Deficit hazard area if balance drops below zero */}
        {minVal < 0 && zeroY < padT + chartH && (
          <rect
            x={padL}
            y={Math.max(padT, zeroY)}
            width={chartW}
            height={Math.max(0, padT + chartH - Math.max(padT, zeroY))}
            fill="rgba(239, 68, 68, 0.08)"
          />
        )}

        {/* Horizontal grid lines */}
        {gridTicks.map((t, idx) => (
          <g key={idx}>
            <line
              x1={padL}
              y1={t.y}
              x2={padL + chartW}
              y2={t.y}
              stroke="var(--line)"
              strokeDasharray="4 4"
              strokeWidth="1"
              opacity="0.6"
            />
            <text
              x={padL - 10}
              y={t.y + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--muted)"
              fontFamily="var(--font-main)"
            >
              {formatMoney(t.val)}
            </text>
          </g>
        ))}

        {/* Zero line */}
        {minVal < 0 && zeroY >= padT && zeroY <= padT + chartH && (
          <line
            x1={padL}
            y1={zeroY}
            x2={padL + chartW}
            y2={zeroY}
            stroke="#ef4444"
            strokeDasharray="4 3"
            strokeWidth="1.5"
            opacity="0.85"
          />
        )}

        {/* Area fill */}
        <path d={areaD} fill="url(#forecastAreaGrad)" />

        {/* Trajectory line */}
        <path
          d={pathD}
          fill="none"
          stroke="url(#forecastLineGrad)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Simulated trajectory curve */}
        {isSimActive && simPathD && (
          <path
            d={simPathD}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2.5"
            strokeDasharray="5 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {simulatedLowestPoint && (
          <g pointerEvents="none">
            <line
              x1={simulatedLowestPoint.coordinate.x}
              y1={padT}
              x2={simulatedLowestPoint.coordinate.x}
              y2={padT + chartH}
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              opacity="0.8"
            />
            <circle
              cx={simulatedLowestPoint.coordinate.x}
              cy={simulatedLowestPoint.coordinate.y}
              r="8"
              fill="#f59e0b"
              stroke="var(--surface)"
              strokeWidth="3"
            />
            <g transform={`translate(${Math.min(Math.max(simulatedLowestPoint.coordinate.x - 78, padL), padL + chartW - 156)}, ${Math.max(simulatedLowestPoint.coordinate.y - 42, padT + 4)})`}>
              <rect width="156" height="32" rx="6" fill="#92400e" opacity="0.96" />
              <text x="78" y="13" textAnchor="middle" fontSize="10" fill="#fff" fontFamily="var(--font-main)">
                Simulated lowest point
              </text>
              <text x="78" y="25" textAnchor="middle" fontSize="10" fill="#fef3c7" fontFamily="var(--font-main)">
                {formatMoney(simulatedLowestPoint.series.simulatedBalance)} · {simulatedLowestPoint.series.shortLabel}
              </text>
            </g>
          </g>
        )}

        {/* Hover vertical crosshair line */}
        {activeCoord && (
          <line
            x1={activeCoord.x}
            y1={padT}
            x2={activeCoord.x}
            y2={padT + chartH}
            stroke="var(--teal)"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            opacity="0.9"
            pointerEvents="none"
          />
        )}

        {/* Point nodes & X-axis labels */}
        {points.map((pt, idx) => {
          const s = series[idx];
          const isNegative = s.balance < 0;
          const isHovered = hoverIndex === idx;

          // Only show labels on periodic points to prevent clutter
          const labelStep = Math.max(1, Math.floor(series.length / 10));
          const showLabel = idx === 0 || idx === series.length - 1 || idx % labelStep === 0;

          return (
            <g key={idx}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 7 : series.length > 36 ? 3 : 4.5}
                fill={isNegative ? '#ef4444' : s.isOpening ? '#0f766e' : '#14b8a6'}
                stroke="var(--surface)"
                strokeWidth={isHovered ? 3.5 : 2}
                style={{ transition: 'r 0.15s ease' }}
              />

              {showLabel && (
                <text
                  x={pt.x}
                  y={viewBoxH - 12}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--muted)"
                  fontFamily="var(--font-main)"
                >
                  {s.shortLabel}
                </text>
              )}
            </g>
          );
        })}

        {/* Transparent interactive hover columns */}
        {points.map((pt, idx) => {
          const colW = chartW / Math.max(1, series.length);
          return (
            <rect
              key={idx}
              x={pt.x - colW / 2}
              y={padT}
              width={colW}
              height={chartH}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseMove={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
              onClick={() => {
                if (onSelectDate) {
                  onSelectDate(series[idx].date || today);
                }
              }}
            />
          );
        })}
      </svg>

      {/* Floating Glass Tooltip */}
      {activePoint && activeCoord && (
        <div
          className="forecast-tooltip"
          style={{
            left: `${(activeCoord.x / viewBoxW) * 100}%`,
            top: `${(activeCoord.y / viewBoxH) * 100}%`,
            transform: (() => {
              const leftPct = (activeCoord.x / viewBoxW) * 100;
              const topPct = (activeCoord.y / viewBoxH) * 100;
              const xAlign = leftPct < 22 ? '0%' : leftPct > 78 ? '-100%' : '-50%';
              const yAlign = topPct < 45 ? '16px' : 'calc(-100% - 14px)';
              return `translate(${xAlign}, ${yAlign})`;
            })(),
            display: 'block',
          }}
        >
          {activePoint.isOpening ? (
            <>
              <div className="forecast-tooltip-title">
                <span>Starting Balance</span>
                <span className="forecast-tooltip-badge up">Opening</span>
              </div>
              <div className="forecast-tooltip-row">
                <span style={{ color: 'var(--muted)' }}>Current Cash:</span>
                <strong style={{ color: 'var(--ink)' }}>{formatMoney(activePoint.balance)}</strong>
              </div>
              <div className="forecast-tooltip-row sub">
                <span>Safe-to-Spend Today:</span>
                <strong style={{ color: activePoint.safeToSpend > 0 ? '#10b981' : '#ef4444' }}>
                  {formatMoney(activePoint.safeToSpend)}
                </strong>
              </div>
              <div className="forecast-tooltip-row sub">
                <span>Date:</span>
                <span>{activePoint.fullLabel}</span>
              </div>
            </>
          ) : mode === 'entries' ? (
            <>
              <div className="forecast-tooltip-title">
                <span style={{ maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activePoint.category}
                </span>
                <span className={`forecast-tooltip-badge ${activePoint.type === 'income' ? 'up' : 'down'}`}>
                  {activePoint.type === 'income' ? '▲ +' : '▼ -'}{formatMoney(activePoint.amount || 0)}
                </span>
              </div>
              <div className="forecast-tooltip-row">
                <span style={{ color: 'var(--muted)' }}>Running Cash:</span>
                <strong style={{ color: activePoint.balance < 0 ? '#ef4444' : 'var(--ink)' }}>
                  {formatMoney(activePoint.balance)}
                </strong>
              </div>
              <div className="forecast-tooltip-row sub">
                <span>Date:</span>
                <span>{activePoint.fullLabel}</span>
              </div>
              <div className="forecast-tooltip-row sub">
                <span>Type:</span>
                <span style={{ textTransform: 'capitalize', color: activePoint.type === 'income' ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                  {activePoint.type}
                </span>
              </div>
              <div className="forecast-tooltip-row sub" style={{ marginTop: '5px', borderTop: '1px dashed var(--line)', paddingTop: '4px' }}>
                <span>Safe-to-Spend Here:</span>
                <strong style={{ color: activePoint.safeToSpend > 0 ? '#10b981' : '#ef4444' }}>
                  {formatMoney(activePoint.safeToSpend)}
                </strong>
              </div>
              <div className="forecast-tooltip-row sub">
                <span>Net from Start:</span>
                <span style={{ fontWeight: 700, color: cumChange >= 0 ? '#10b981' : '#ef4444' }}>
                  {sign}{formatMoney(cumChange)} ({cumPct}%)
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="forecast-tooltip-title">
                <span>{activePoint.fullLabel}</span>
                <span className={`forecast-tooltip-badge ${(activePoint.net || 0) >= 0 ? 'up' : 'down'}`}>
                  {(activePoint.net || 0) >= 0 ? '▲' : '▼'} {(activePoint.net || 0) >= 0 ? '+' : ''}{formatMoney(activePoint.net || 0)}
                </span>
              </div>
              <div className="forecast-tooltip-row">
                <span style={{ color: 'var(--muted)' }}>Closing Balance:</span>
                <strong style={{ color: activePoint.balance < 0 ? '#ef4444' : 'var(--ink)' }}>
                  {formatMoney(activePoint.balance)}
                </strong>
              </div>
              <div className="forecast-tooltip-row sub">
                <span>Safe-to-Spend Here:</span>
                <strong style={{ color: activePoint.safeToSpend > 0 ? '#10b981' : '#ef4444' }}>
                  {formatMoney(activePoint.safeToSpend)}
                </strong>
              </div>
              <div className="forecast-tooltip-row sub">
                <span>Forecast Income ({activePoint.incomeCount || 0}):</span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>+{formatMoney(activePoint.income || 0)}</span>
              </div>
              <div className="forecast-tooltip-row sub">
                <span>Forecast Expenses ({activePoint.expenseCount || 0}):</span>
                <span style={{ color: '#ef4444', fontWeight: 600 }}>-{formatMoney(activePoint.expense || 0)}</span>
              </div>
              <div className="forecast-tooltip-row sub" style={{ marginTop: '5px', borderTop: '1px dashed var(--line)', paddingTop: '4px' }}>
                <span>Net from Start:</span>
                <span style={{ fontWeight: 700, color: cumChange >= 0 ? '#10b981' : '#ef4444' }}>
                  {sign}{formatMoney(cumChange)} ({cumPct}%)
                </span>
              </div>
            </>
          )}

          {isSimActive && activePoint.isPostSim && (
            <div className="forecast-tooltip-row sub" style={{ borderTop: '1px dashed rgba(245, 158, 11, 0.4)', marginTop: '5px', paddingTop: '4px' }}>
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>With Test Spend (-{formatMoney(simAmount)}):</span>
              <strong style={{ color: activePoint.simulatedBalance < 0 ? '#ef4444' : '#f59e0b' }}>
                {formatMoney(activePoint.simulatedBalance)}
              </strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
