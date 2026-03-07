import React, { useState, useEffect } from 'react';
import { reportsAPI } from '../services/api';

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function ReportsPage({ user }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [report, setReport] = useState(null);
  const [pastReports, setPastReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const canGenerate = ['admin', 'treasurer'].includes(user.role);

  useEffect(() => {
    reportsAPI.list().then(res => setPastReports(res.data)).catch(() => {});
  }, []);

  const loadReport = async () => {
    setLoading(true);
    try {
      const res = await reportsAPI.monthly(year, month);
      setReport(res.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const generatePDF = async () => {
    setGenerating(true);
    try {
      await reportsAPI.generate(year, month);
      alert(`PDF report generated for ${MONTHS[month]} ${year}!`);
      const res = await reportsAPI.list();
      setPastReports(res.data);
    } catch (err) {
      alert('Failed to generate PDF');
    }
    setGenerating(false);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Monthly Reports</h2>

      {/* Period Selector */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="label">Year</label>
            <select className="input w-32" value={year} onChange={e => setYear(parseInt(e.target.value))}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Month</label>
            <select className="input w-40" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
              {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <button className="btn-primary" onClick={loadReport} disabled={loading}>
            {loading ? 'Loading...' : 'View Report'}
          </button>
          {canGenerate && (
            <button className="btn-secondary" onClick={generatePDF} disabled={generating}>
              {generating ? 'Generating...' : '📄 Generate PDF'}
            </button>
          )}
        </div>
      </div>

      {/* Report Display */}
      {report && (
        <div className="space-y-6">
          <div className="card bg-blue-50 border border-blue-200">
            <h3 className="text-xl font-bold text-blue-900">{report.title}</h3>
            <p className="text-sm text-blue-600">Period: {report.period.start_date} to {report.period.end_date}</p>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card bg-green-50 border border-green-200">
              <p className="text-sm text-green-700">Total Income</p>
              <p className="text-2xl font-bold text-green-700">{fmt(report.income.total)}</p>
            </div>
            <div className="card bg-red-50 border border-red-200">
              <p className="text-sm text-red-700">Total Expenses</p>
              <p className="text-2xl font-bold text-red-700">{fmt(report.expenses.total)}</p>
            </div>
            <div className={`card border ${report.net_income >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-sm text-gray-700">Net Income</p>
              <p className={`text-2xl font-bold ${report.net_income >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{fmt(report.net_income)}</p>
            </div>
          </div>

          {/* Bank Balances */}
          <div className="card">
            <h4 className="font-bold text-gray-900 mb-3">🏦 Bank Balances</h4>
            {report.bank_accounts.map(acc => (
              <div key={acc.id} className="flex justify-between py-2 border-b last:border-0">
                <span className="text-gray-700">{acc.name}</span>
                <span className="font-bold text-blue-700">{fmt(acc.current_balance)}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 mt-2 border-t-2 border-blue-200">
              <span className="font-bold text-gray-900">Total</span>
              <span className="font-bold text-blue-800 text-lg">{fmt(report.total_bank_balance)}</span>
            </div>
          </div>

          {/* Income Detail */}
          <div className="card">
            <h4 className="font-bold text-gray-900 mb-3">📈 Income by Category</h4>
            {report.income.by_category.map((c, i) => (
              <div key={i} className="flex justify-between py-2 border-b last:border-0">
                <span className="text-gray-700">{c.category}</span>
                <span className="font-medium text-green-700">{fmt(c.total)}</span>
              </div>
            ))}
          </div>

          {/* Expense Detail */}
          <div className="card">
            <h4 className="font-bold text-gray-900 mb-3">📉 Expenses by Category</h4>
            {report.expenses.by_category.map((c, i) => (
              <div key={i} className="flex justify-between py-2 border-b last:border-0">
                <span className="text-gray-700">{c.category}</span>
                <span className="font-medium text-red-700">{fmt(c.total)}</span>
              </div>
            ))}
          </div>

          {/* Fund Balances */}
          <div className="card">
            <h4 className="font-bold text-gray-900 mb-3">📌 Earmarked Fund Balances</h4>
            {report.funds.map(fund => (
              <div key={fund.id} className="flex justify-between py-2 border-b last:border-0">
                <span className="text-gray-700">
                  {fund.name}
                  {fund.is_restricted && <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-1 py-0.5 rounded">Restricted</span>}
                </span>
                <span className="font-medium text-green-700">{fmt(fund.current_balance)}</span>
              </div>
            ))}
          </div>

          {/* Budget vs Actual */}
          {report.budget_comparison.length > 0 && (
            <div className="card overflow-x-auto">
              <h4 className="font-bold text-gray-900 mb-3">📋 Budget vs. Actual</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2">Category</th>
                    <th className="pb-2 text-right">Budgeted</th>
                    <th className="pb-2 text-right">Actual</th>
                    <th className="pb-2 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {report.budget_comparison.map((item, i) => {
                    const overBudget = item.type === 'income' ? item.variance < 0 : item.variance > 0;
                    return (
                      <tr key={i} className="border-b">
                        <td className="py-2">{item.category}</td>
                        <td className="py-2 text-right text-gray-600">{fmt(item.budgeted)}</td>
                        <td className="py-2 text-right">{fmt(item.actual)}</td>
                        <td className={`py-2 text-right font-medium ${overBudget ? 'text-red-600' : 'text-green-600'}`}>{fmt(item.variance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Transaction List */}
          <div className="card overflow-x-auto">
            <h4 className="font-bold text-gray-900 mb-3">📝 All Transactions</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Description</th>
                  <th className="pb-2">Category</th>
                  <th className="pb-2">Fund</th>
                  <th className="pb-2">Check #</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {report.transactions.map(txn => (
                  <tr key={txn.id} className="border-b last:border-0">
                    <td className="py-2 text-gray-600">{txn.date}</td>
                    <td className="py-2 text-gray-900">{txn.description}</td>
                    <td className="py-2 text-gray-600">{txn.category_name || '—'}</td>
                    <td className="py-2 text-gray-600">{txn.fund_name || '—'}</td>
                    <td className="py-2 text-gray-400">{txn.check_number || '—'}</td>
                    <td className={`py-2 text-right font-medium ${txn.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                      {txn.type === 'income' ? '+' : '-'}{fmt(txn.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Past Reports */}
      <div className="card mt-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">📁 Generated Reports Archive</h3>
        {pastReports.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">Period</th>
                <th className="pb-2">Generated</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {pastReports.map(r => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{MONTHS[r.month]} {r.year}</td>
                  <td className="py-2 text-gray-600">{new Date(r.generated_at).toLocaleString()}</td>
                  <td className="py-2">
                    <button className="text-blue-600 hover:text-blue-800 text-sm" onClick={() => {
                      setYear(r.year); setMonth(r.month); loadReport();
                    }}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-400 text-center py-4">No reports generated yet</p>
        )}
      </div>
    </div>
  );
}
