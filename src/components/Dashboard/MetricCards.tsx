import React from 'react';
import { formatMoney } from '../../engine/dateUtils';
import { Wallet, Landmark, TrendingDown, ShieldCheck } from 'lucide-react';

interface MetricCardsProps {
  totalCash: number;
  storageTotal: number;
  lowestForecastBalance: number;
  runwayMonths: number;
}

export const MetricCards: React.FC<MetricCardsProps> = ({
  totalCash,
  storageTotal,
  lowestForecastBalance,
  runwayMonths,
}) => {
  const netWorth = totalCash + storageTotal;

  return (
    <div className="metrics-grid">
      <div className="card metric-card">
        <div className="metric-label">
          <span>Liquid Cash</span>
          <Wallet size={16} color="#6366f1" />
        </div>
        <div className="metric-value">{formatMoney(totalCash)}</div>
        <div className="metric-footer">
          <span>Active balances across CIB, HSBC, Cash</span>
        </div>
      </div>

      <div className="card metric-card">
        <div className="metric-label">
          <span>Storage &amp; Gold Value</span>
          <Landmark size={16} color="#06b6d4" />
        </div>
        <div className="metric-value">{formatMoney(storageTotal)}</div>
        <div className="metric-footer">
          <span>Valued at live market buy rates</span>
        </div>
      </div>

      <div className="card metric-card">
        <div className="metric-label">
          <span>Total Net Worth</span>
          <ShieldCheck size={16} color="#10b981" />
        </div>
        <div className="metric-value" style={{ color: '#10b981' }}>
          {formatMoney(netWorth)}
        </div>
        <div className="metric-footer">
          <span>Liquid Cash + Reserve Holdings</span>
        </div>
      </div>

      <div className="card metric-card">
        <div className="metric-label">
          <span>Lowest 12M Horizon</span>
          <TrendingDown size={16} color={lowestForecastBalance < 0 ? '#f43f5e' : '#f59e0b'} />
        </div>
        <div
          className="metric-value"
          style={{ color: lowestForecastBalance < 0 ? '#f43f5e' : 'inherit' }}
        >
          {formatMoney(lowestForecastBalance)}
        </div>
        <div className="metric-footer">
          <span>{runwayMonths} months estimated runway</span>
        </div>
      </div>
    </div>
  );
};
