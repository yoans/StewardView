import React, { useState, useEffect } from 'react';
import { reportsAPI } from '../services/api';

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportsAPI.dashboard().then(res => {
      setData(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-500">Loading dashboard...</div>;
  if (!data) return <div className="text-center py-12 text-red-500">Failed to load dashboard</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Financial Dashboard</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          title="Total Bank Balance"
          value={fmt(data.bank.total_balance)}
          color="blue"
          icon="🏦"
        />
        <SummaryCard
          title="Month Income"
          value={fmt(data.month.income)}
          color="green"
          icon="📈"
        />
        <SummaryCard
          title="Month Expenses"
          value={fmt(data.month.expenses)}
          color="red"
          icon="📉"
        />
        <SummaryCard
          title="Net This Month"
          value={fmt(data.month.net)}
          color={data.month.net >= 0 ? 'green' : 'red'}
          icon="💵"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Bank Accounts */}
        <div className="card">
          <h3 className="text-lg font-bold text-gray-900 mb-4">🏧 Bank Accounts</h3>
          <div className="space-y-3">
            {data.bank.accounts.map(acc => (
              <div key={acc.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{acc.name}</p>
                  <p className="text-xs text-gray-500">{acc.institution} ••••{acc.account_mask}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-blue-700">{fmt(acc.current_balance)}</p>
                  {acc.balance_last_updated && (
                    <p className="text-xs text-gray-400">Updated: {new Date(acc.balance_last_updated).toLocaleDateString()}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Earmarked Funds */}
        <div className="card">
          <h3 className="text-lg font-bold text-gray-900 mb-4">📌 Earmarked Funds</h3>
          <div className="space-y-3">
            {data.funds.map(fund => (
              <div key={fund.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium text-gray-900">
                      {fund.name}
                      {fund.is_restricted ? <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Restricted</span> : null}
                    </p>
                    <p className="text-xs text-gray-500">{fund.description}</p>
                  </div>
                  <p className="font-bold text-green-700">{fmt(fund.current_balance)}</p>
                </div>
                {fund.target_amount && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Progress</span>
                      <span>{Math.min(100, (fund.current_balance / fund.target_amount * 100)).toFixed(0)}% of {fmt(fund.target_amount)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(100, fund.current_balance / fund.target_amount * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card">
        <h3 className="text-lg font-bold text-gray-900 mb-4">🕐 Recent Transactions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">Date</th>
                <th className="pb-2">Description</th>
                <th className="pb-2">Category</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_transactions.map(txn => (
                <tr key={txn.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2 text-gray-600">{txn.date}</td>
                  <td className="py-2 font-medium text-gray-900">{txn.description}</td>
                  <td className="py-2 text-gray-600">{txn.category_name}</td>
                  <td className="py-2">
                    <span className={`badge-${txn.status}`}>{txn.status}</span>
                  </td>
                  <td className={`py-2 text-right font-medium ${txn.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                    {txn.type === 'income' ? '+' : '-'}{fmt(txn.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, color, icon }) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    red: 'bg-red-50 border-red-200 text-red-700',
  };

  return (
    <div className={`rounded-xl border-2 p-5 ${colorClasses[color] || colorClasses.blue}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="text-sm font-medium opacity-80">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
