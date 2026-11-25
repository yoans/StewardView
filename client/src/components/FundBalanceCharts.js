import React from 'react';

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const WINDOWS = [
  ['3m', '3 months'],
  ['6m', '6 months'],
  ['1y', '1 year'],
  ['ytd', 'This year'],
  ['all', 'All'],
];

function dayValue(iso) {
  const [year, month, day] = String(iso).slice(0, 10).split('-').map(Number);
  return Date.UTC(year, (month || 1) - 1, day || 1);
}

function Sparkline({ fund }) {
  const points = fund.points || [];
  const width = 320;
  const height = 96;
  const pad = 6;
  const values = points.map((point) => Number(point.balance) || 0);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const span = max - min || 1;
  const start = points[0] ? dayValue(points[0].date) : 0;
  const end = points.length ? dayValue(points[points.length - 1].date) : start;
  const xSpan = Math.max(1, end - start);
  const x = (date) => pad + ((dayValue(date) - start) / xSpan) * (width - pad * 2);
  const y = (value) => pad + (1 - ((value - min) / span)) * (height - pad * 2);
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.date).toFixed(1)},${y(Number(point.balance) || 0).toFixed(1)}`).join(' ');

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="font-medium text-gray-900 text-sm">{fund.name}</p>
        <p className="font-semibold text-emerald-800 text-sm whitespace-nowrap">{fmt(fund.balance)}</p>
      </div>
      {points.length > 1 ? (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-24" role="img" aria-label={`${fund.name} balance from ${fmt(points[0].balance)} to ${fmt(points[points.length - 1].balance)}`}>
          <path d={line} fill="none" stroke="#047857" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      ) : (
        <p className="text-sm text-gray-400 h-24 flex items-center">No balance history in this window.</p>
      )}
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>{points[0]?.date || ''}</span>
        <span>{fmt(min)} – {fmt(max)}</span>
        <span>{points[points.length - 1]?.date || ''}</span>
      </div>
    </div>
  );
}

export default function FundBalanceCharts({ windowId, onWindowChange, data, loading }) {
  return (
    <section className="card mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Balance over time</h3>
          <p className="text-sm text-gray-500 mt-1">Each fund uses its own scale. The line ends at the balance today.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {WINDOWS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={id === windowId ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
              onClick={() => onWindowChange(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {loading && !data ? (
        <p className="text-sm text-gray-400">Loading balances…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {(data?.series || []).map((fund) => <Sparkline key={fund.id} fund={fund} />)}
        </div>
      )}
    </section>
  );
}

export { WINDOWS };
