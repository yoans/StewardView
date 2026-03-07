import React, { useState, useEffect } from 'react';
import { budgetsAPI } from '../services/api';

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function BudgetPage({ user }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [comparison, setComparison] = useState(null);
  const [ytd, setYtd] = useState(null);
  const [view, setView] = useState('monthly'); // 'monthly' | 'ytd'
  const [loading, setLoading] = useState(true);

  const loadMonthly = async () => {
    setLoading(true);
    try {
      const res = await budgetsAPI.vsActual(year, month);
      setComparison(res.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const loadYTD = async () => {
    setLoading(true);
    try {
      const res = await budgetsAPI.ytd(year);
      setYtd(res.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => {
    if (view === 'monthly') loadMonthly();
    else loadYTD();
  }, [year, month, view]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Budget vs. Actual</h2>
        <div className="flex items-center space-x-2">
          <button
            className={view === 'monthly' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
            onClick={() => setView('monthly')}
          >Monthly</button>
          <button
            className={view === 'ytd' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
            onClick={() => setView('ytd')}
          >Year-to-Date</button>
        </div>
      </div>

      {/* Period Selector */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="label">Year</label>
            <select className="input w-32" value={year} onChange={e => setYear(parseInt(e.target.value))}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {view === 'monthly' && (
            <div>
              <label className="label">Month</label>
              <select className="input w-40" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
                {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-center py-8 text-gray-500">Loading...</p>
      ) : view === 'monthly' && comparison ? (
        <MonthlyView data={comparison} />
      ) : view === 'ytd' && ytd ? (
        <YTDView data={ytd} />
      ) : null}
    </div>
  );
}

function MonthlyView({ data }) {
  const incomeItems = data.line_items.filter(i => i.category_type === 'income');
  const expenseItems = data.line_items.filter(i => i.category_type === 'expense');

  return (
    <div>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card bg-green-50 border border-green-200">
          <p className="text-sm text-green-700">Total Income</p>
          <p className="text-xl font-bold text-green-700">{fmt(data.summary.total_actual_income)}</p>
          <p className="text-xs text-green-600">Budget: {fmt(data.summary.total_budgeted_income)}</p>
        </div>
        <div className="card bg-red-50 border border-red-200">
          <p className="text-sm text-red-700">Total Expenses</p>
          <p className="text-xl font-bold text-red-700">{fmt(data.summary.total_actual_expense)}</p>
          <p className="text-xs text-red-600">Budget: {fmt(data.summary.total_budgeted_expense)}</p>
        </div>
        <div className={`card border ${data.summary.actual_net >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
          <p className="text-sm text-gray-700">Net</p>
          <p className={`text-xl font-bold ${data.summary.actual_net >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{fmt(data.summary.actual_net)}</p>
          <p className="text-xs text-gray-600">Budget: {fmt(data.summary.budgeted_net)}</p>
        </div>
      </div>

      {/* Budget Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2">Category</th>
              <th className="pb-2 text-right">Budgeted</th>
              <th className="pb-2 text-right">Actual</th>
              <th className="pb-2 text-right">Variance</th>
              <th className="pb-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {incomeItems.length > 0 && (
              <>
                <tr className="bg-green-50"><td colSpan="5" className="py-2 font-bold text-green-800">INCOME</td></tr>
                {incomeItems.map((item, i) => <BudgetRow key={i} item={item} isIncome />)}
              </>
            )}
            {expenseItems.length > 0 && (
              <>
                <tr className="bg-red-50"><td colSpan="5" className="py-2 font-bold text-red-800">EXPENSES</td></tr>
                {expenseItems.map((item, i) => <BudgetRow key={i} item={item} />)}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BudgetRow({ item, isIncome }) {
  const overBudget = isIncome ? item.variance < 0 : item.variance > 0;
  const varColor = overBudget ? 'text-red-600' : 'text-green-600';

  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="py-2 pl-4 text-gray-900">{item.category_name}</td>
      <td className="py-2 text-right text-gray-600">{fmt(item.budgeted)}</td>
      <td className="py-2 text-right font-medium text-gray-900">{fmt(item.actual)}</td>
      <td className={`py-2 text-right font-medium ${varColor}`}>{fmt(item.variance)}</td>
      <td className={`py-2 text-right text-sm ${varColor}`}>{item.variance_pct}%</td>
    </tr>
  );
}

function YTDView({ data }) {
  const incomeItems = data.line_items.filter(i => i.category_type === 'income');
  const expenseItems = data.line_items.filter(i => i.category_type === 'expense');

  return (
    <div className="card overflow-x-auto">
      <h3 className="text-lg font-bold mb-4">Year-to-Date through {MONTHS[data.through_month]} {data.year}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="pb-2">Category</th>
            <th className="pb-2 text-right">YTD Budgeted</th>
            <th className="pb-2 text-right">YTD Actual</th>
            <th className="pb-2 text-right">YTD Variance</th>
          </tr>
        </thead>
        <tbody>
          {incomeItems.length > 0 && (
            <>
              <tr className="bg-green-50"><td colSpan="4" className="py-2 font-bold text-green-800">INCOME</td></tr>
              {incomeItems.map((item, i) => (
                <tr key={i} className="border-b hover:bg-gray-50">
                  <td className="py-2 pl-4">{item.category_name}</td>
                  <td className="py-2 text-right text-gray-600">{fmt(item.ytd_budgeted)}</td>
                  <td className="py-2 text-right font-medium">{fmt(item.ytd_actual)}</td>
                  <td className={`py-2 text-right font-medium ${item.ytd_variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(item.ytd_variance)}</td>
                </tr>
              ))}
            </>
          )}
          {expenseItems.length > 0 && (
            <>
              <tr className="bg-red-50"><td colSpan="4" className="py-2 font-bold text-red-800">EXPENSES</td></tr>
              {expenseItems.map((item, i) => (
                <tr key={i} className="border-b hover:bg-gray-50">
                  <td className="py-2 pl-4">{item.category_name}</td>
                  <td className="py-2 text-right text-gray-600">{fmt(item.ytd_budgeted)}</td>
                  <td className="py-2 text-right font-medium">{fmt(item.ytd_actual)}</td>
                  <td className={`py-2 text-right font-medium ${item.ytd_variance <= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(item.ytd_variance)}</td>
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
