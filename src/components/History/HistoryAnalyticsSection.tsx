import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatMoney } from '../../engine/dateUtils';

export interface GroupData {
  count: number;
  total: number;
  type: 'income' | 'expense';
}

interface HistoryAnalyticsSectionProps {
  groupBy: 'category' | 'tag';
  setGroupBy: (groupBy: 'category' | 'tag') => void;
  viewMode: 'chart' | 'table' | 'both';
  setViewMode: (viewMode: 'chart' | 'table' | 'both') => void;
  analyticsCollapsed: boolean;
  setAnalyticsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  sortedGroups: [string, GroupData][];
  totalAnalyticsAmount: number;
}

const PALETTE = ['#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#6366f1', '#14b8a6', '#f43f5e'];

export const HistoryAnalyticsSection: React.FC<HistoryAnalyticsSectionProps> = ({
  groupBy,
  setGroupBy,
  viewMode,
  setViewMode,
  analyticsCollapsed,
  setAnalyticsCollapsed,
  sortedGroups,
  totalAnalyticsAmount,
}) => {
  return (
    <section className="panel collapsible-panel history-analytics-panel" style={{ marginBottom: '18px' }}>
      <div
        className="panel-heading history-analytics-heading"
        onClick={() => setAnalyticsCollapsed(!analyticsCollapsed)}
      >
        <div className="history-analytics-header-top">
          <div className="history-analytics-title">
            <h3 style={{ margin: 0 }}>Spending Analytics</h3>
            <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
              Filtered actuals · {sortedGroups.length} groups
            </span>
          </div>
          <button
            className="ghost-button collapse-toggle-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAnalyticsCollapsed(!analyticsCollapsed);
            }}
            aria-label={analyticsCollapsed ? 'Expand analytics' : 'Collapse analytics'}
          >
            {analyticsCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
        <div
          className="history-analytics-actions"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="subnav-tabs history-groupby-tabs">
            <button
              type="button"
              className={`subnav-tab ${groupBy === 'category' ? 'active' : ''}`}
              onClick={() => setGroupBy('category')}
            >
              📁 Category
            </button>
            <button
              type="button"
              className={`subnav-tab ${groupBy === 'tag' ? 'active' : ''}`}
              onClick={() => setGroupBy('tag')}
            >
              🏷️ Tag
            </button>
          </div>
          <div className="subnav-tabs history-view-tabs">
            <button
              type="button"
              className={`subnav-tab ${viewMode === 'chart' ? 'active' : ''}`}
              onClick={() => setViewMode('chart')}
            >
              📊 Breakdown
            </button>
            <button
              type="button"
              className={`subnav-tab ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              📋 Table
            </button>
            <button
              type="button"
              className={`subnav-tab ${viewMode === 'both' ? 'active' : ''}`}
              onClick={() => setViewMode('both')}
            >
              📑 Both
            </button>
          </div>
        </div>
      </div>

      {!analyticsCollapsed && (
        <div className="collapsible-content" style={{ marginTop: '12px' }}>
          {(viewMode === 'chart' || viewMode === 'both') && (
            <div className="history-chart-layout" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <div className="donut-chart-container" style={{ width: '160px', height: '160px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="150" height="150" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="50" cy="50" r="38" fill="transparent" stroke="var(--line)" strokeWidth="16" />
                  {sortedGroups.reduce<{ offset: number; elements: React.ReactNode[] }>((acc, [name, data], idx) => {
                    const percent = totalAnalyticsAmount > 0 ? (data.total / totalAnalyticsAmount) * 100 : 0;
                    const circumference = 2 * Math.PI * 38;
                    const strokeDash = (percent / 100) * circumference;
                    const strokeOffset = -acc.offset;
                    const color = PALETTE[idx % PALETTE.length];

                    acc.elements.push(
                      <circle
                        key={name}
                        cx="50"
                        cy="50"
                        r="38"
                        fill="transparent"
                        stroke={color}
                        strokeWidth="16"
                        strokeDasharray={`${strokeDash} ${circumference - strokeDash}`}
                        strokeDashoffset={strokeOffset}
                      />
                    );
                    acc.offset += strokeDash;
                    return acc;
                  }, { offset: 0, elements: [] }).elements}
                </svg>
                <div className="donut-center-label" style={{ position: 'absolute', textAlign: 'center' }}>
                  <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'block' }}>Total</span>
                  <strong style={{ fontSize: '13px' }}>{formatMoney(totalAnalyticsAmount)}</strong>
                </div>
              </div>
              <div className="stack-list history-scroll-list" style={{ flex: 1, minWidth: '260px', maxHeight: '200px', overflowY: 'auto' }}>
                {sortedGroups.map(([name, data], idx) => {
                  const percent = totalAnalyticsAmount > 0 ? Math.round((data.total / totalAnalyticsAmount) * 100) : 0;
                  const color = PALETTE[idx % PALETTE.length];
                  return (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: '6px', background: 'var(--surface-soft)', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{name}</span>
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>({data.count})</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <strong style={{ fontSize: '13px' }}>{formatMoney(data.total)}</strong>
                        <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '6px' }}>{percent}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(viewMode === 'table' || viewMode === 'both') && (
            <div className="table-wrap compact history-scroll-table" style={{ maxHeight: '250px', overflowY: 'auto' }}>
              <table>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
                  <tr>
                    <th>Group / Category</th>
                    <th>Type</th>
                    <th className="number">Entries</th>
                    <th className="number">Total Actual</th>
                    <th className="number">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedGroups.map(([name, data]) => {
                    const percent = totalAnalyticsAmount > 0 ? Math.round((data.total / totalAnalyticsAmount) * 100) : 0;
                    return (
                      <tr key={name}>
                        <td><strong>{name}</strong></td>
                        <td><span className={`badge ${data.type === 'income' ? 'badge-income' : 'badge-expense'}`}>{data.type}</span></td>
                        <td className="number">{data.count}</td>
                        <td className="number"><strong>{formatMoney(data.total)}</strong></td>
                        <td className="number">{percent}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
