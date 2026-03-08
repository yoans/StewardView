import React, { useState, useEffect } from 'react';
import { budgetsAPI, categoriesAPI } from '../services/api';

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function BudgetPage({ user }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [comparison, setComparison] = useState(null);
  const [ytd, setYtd] = useState(null);
  const [allBudgets, setAllBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [view, setView] = useState('monthly'); // 'monthly' | 'ytd' | 'edit'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const canEdit = ['admin', 'treasurer'].includes(user?.role);

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

  const loadEditData = async () => {
    setLoading(true);
    try {
      const [budgetRes, catRes] = await Promise.all([
        budgetsAPI.list(year),
        categoriesAPI.list(),
      ]);
      setAllBudgets(budgetRes.data);
      setCategories(catRes.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => {
    if (view === 'monthly') loadMonthly();
    else if (view === 'ytd') loadYTD();
    else if (view === 'edit') loadEditData();
  }, [year, month, view]);

  const handleBudgetUpdate = async (budgetId, newAmount) => {
    setError(''); setSuccess('');
    try {
      await budgetsAPI.update(budgetId, { budgeted_amount: parseFloat(newAmount) });
      setSuccess('Budget updated');
      loadEditData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update budget');
    }
  };

  const handleBudgetDelete = async (budgetId) => {
    if (!window.confirm('Delete this budget line?')) return;
    setError(''); setSuccess('');
    try {
      await budgetsAPI.delete(budgetId);
      setSuccess('Budget line deleted');
      loadEditData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleAddBudget = async (categoryId) => {
    setError(''); setSuccess('');
    try {
      await budgetsAPI.create({ year, month, category_id: categoryId, budgeted_amount: 0 });
      setSuccess('Budget line added');
      loadEditData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add budget line');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Budget vs. Actual</h2>
        <div className="flex items-center space-x-2">
          <button className={view === 'monthly' ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setView('monthly')}>Monthly</button>
          <button className={view === 'ytd' ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setView('ytd')}>Year-to-Date</button>
          {canEdit && <button className={view === 'edit' ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setView('edit')}>Edit Budget</button>}
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm mb-4">{success}</div>}

      {/* Period Selector */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="label">Year</label>
            <select className="input w-32" value={year} onChange={e => setYear(parseInt(e.target.value))}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {(view === 'monthly' || view === 'edit') && (
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
      ) : view === 'edit' ? (
        <EditView
          budgets={allBudgets.filter(b => b.month === month)}
          categories={categories}
          year={year}
          month={month}
          onUpdate={handleBudgetUpdate}
          onDelete={handleBudgetDelete}
          onAdd={handleAddBudget}
        />
      ) : null}
    </div>
  );
}

function EditView({ budgets, categories, year, month, onUpdate, onDelete, onAdd }) {
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  const budgetedCategoryIds = budgets.map(b => b.category_id);
  const missingCategories = categories.filter(c => !budgetedCategoryIds.includes(c.id));

  const incBudgets = budgets.filter(b => b.category_type === 'income');
  const expBudgets = budgets.filter(b => b.category_type === 'expense');

  const startEdit = (budget) => {
    setEditingId(budget.id);
    setEditValue(budget.budgeted_amount);
  };

  const saveEdit = (budgetId) => {
    onUpdate(budgetId, editValue);
    setEditingId(null);
  };

  const renderRow = (b) => (
    <tr key={b.id} className="border-b hover:bg-gray-50">
      <td className="py-2 pl-4 text-gray-900">{b.category_name}</td>
      <td className="py-2 text-right">
        {editingId === b.id ? (
          <div className="flex items-center justify-end gap-1">
            <span className="text-gray-400">$</span>
            <input
              type="number"
              step="0.01"
              className="input w-28 text-right py-1 text-sm"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveEdit(b.id)}
              autoFocus
            />
            <button className="text-green-600 hover:text-green-800 text-xs font-medium ml-1" onClick={() => saveEdit(b.id)}>Save</button>
            <button className="text-gray-400 hover:text-gray-600 text-xs ml-1" onClick={() => setEditingId(null)}>Cancel</button>
          </div>
        ) : (
          <span className="cursor-pointer hover:text-blue-600" onClick={() => startEdit(b)}>
            {fmt(b.budgeted_amount)} ✏️
          </span>
        )}
      </td>
      <td className="py-2 text-right">
        <button className="text-red-400 hover:text-red-600 text-xs" onClick={() => onDelete(b.id)}>Delete</button>
      </td>
    </tr>
  );

  return (
    <div className="card overflow-x-auto">
      <h3 className="text-lg font-bold mb-4">Edit Budget — {MONTHS[month]} {year}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="pb-2">Category</th>
            <th className="pb-2 text-right">Budgeted Amount</th>
            <th className="pb-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {incBudgets.length > 0 && (
            <>
              <tr className="bg-green-50"><td colSpan="3" className="py-2 font-bold text-green-800">INCOME</td></tr>
              {incBudgets.map(renderRow)}
            </>
          )}
          {expBudgets.length > 0 && (
            <>
              <tr className="bg-red-50"><td colSpan="3" className="py-2 font-bold text-red-800">EXPENSES</td></tr>
              {expBudgets.map(renderRow)}
            </>
          )}
        </tbody>
      </table>

      {/* Add missing categories */}
      {missingCategories.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <p className="text-sm text-gray-500 mb-2">Add budget line for:</p>
          <div className="flex flex-wrap gap-2">
            {missingCategories.map(c => (
              <button
                key={c.id}
                className="text-xs bg-gray-100 hover:bg-blue-100 text-gray-700 hover:text-blue-700 px-3 py-1 rounded-full transition-colors"
                onClick={() => onAdd(c.id)}
              >
                + {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
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
