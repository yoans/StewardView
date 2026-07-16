import React, { useState, useEffect, useMemo } from 'react';
import { budgetsAPI, categoriesAPI } from '../services/api';

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function prevPeriod(year, month) {
  if (month <= 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export default function BudgetPage({ user }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [comparison, setComparison] = useState(null);
  const [ytd, setYtd] = useState(null);
  const [allBudgets, setAllBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editEpoch, setEditEpoch] = useState(0);
  const [view, setView] = useState('monthly'); // 'monthly' | 'ytd' | 'edit' | 'categories'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const canEdit = ['admin', 'treasurer'].includes(user?.role);
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return [current - 1, current, current + 1, current + 2];
  }, []);

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
      setEditEpoch(e => e + 1);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await categoriesAPI.list({ include_inactive: '1' });
      setCategories(res.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => {
    setError('');
    setSuccess('');
    if (view === 'monthly') loadMonthly();
    else if (view === 'ytd') loadYTD();
    else if (view === 'edit') loadEditData();
    else if (view === 'categories') loadCategories();
  }, [year, month, view]);

  const handleUpsertAmount = async (categoryId, amount) => {
    setError(''); setSuccess('');
    try {
      const res = await budgetsAPI.create({
        year,
        month,
        category_id: categoryId,
        budgeted_amount: parseFloat(amount) || 0,
      });
      const saved = res.data;
      setAllBudgets(prev => {
        const without = prev.filter(b => !(b.month === month && b.category_id === categoryId));
        const cat = categories.find(c => c.id === categoryId);
        return [...without, {
          ...saved,
          category_name: cat?.name || saved.category_name,
          category_type: cat?.type || saved.category_type,
          month,
          year,
          category_id: categoryId,
          budgeted_amount: parseFloat(amount) || 0,
        }];
      });
      setSuccess('Saved');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save budget line');
      throw err;
    }
  };

  const handleBudgetDelete = async (budgetId) => {
    setError(''); setSuccess('');
    try {
      await budgetsAPI.delete(budgetId);
      setAllBudgets(prev => prev.filter(b => b.id !== budgetId));
      setSuccess('Budget line removed');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete');
      throw err;
    }
  };

  const handleCopyPrevious = async () => {
    const from = prevPeriod(year, month);
    if (!window.confirm(`Replace ${MONTHS[month]} ${year} with the budget from ${MONTHS[from.month]} ${from.year}?`)) return;
    setError(''); setSuccess('');
    try {
      const res = await budgetsAPI.copy({
        from_year: from.year,
        from_month: from.month,
        to_year: year,
        to_month: month,
      });
      setSuccess(res.data?.message || 'Copied previous month');
      await loadEditData();
    } catch (err) {
      setError(err.response?.data?.error || 'Nothing to copy from the previous month');
    }
  };

  const title = view === 'edit'
    ? 'Build Budget'
    : view === 'ytd'
      ? 'Budget Year-to-Date'
      : view === 'categories'
        ? 'Budget Categories'
        : 'Budget vs. Actual';

  return (
    <div>
      <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
          {view === 'edit' && (
            <p className="text-sm text-gray-500 mt-1">Set planned income and expenses for the month. Amounts save when you leave a field.</p>
          )}
          {view === 'categories' && (
            <p className="text-sm text-gray-500 mt-1">Add, rename, or deactivate lines used by budgets and transactions.</p>
          )}
        </div>
        <div className="flex items-center space-x-2 flex-wrap">
          <button className={view === 'monthly' ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setView('monthly')}>Monthly</button>
          <button className={view === 'ytd' ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setView('ytd')}>Year-to-Date</button>
          {canEdit && <button className={view === 'edit' ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setView('edit')}>Build Budget</button>}
          {canEdit && <button className={view === 'categories' ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setView('categories')}>Categories</button>}
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm mb-4">{success}</div>}

      {view !== 'categories' && (
        <div className="card mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="label">Year</label>
              <select className="input w-32" value={year} onChange={e => setYear(parseInt(e.target.value))}>
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
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
      )}

      {loading ? (
        <p className="text-center py-8 text-gray-500">Loading...</p>
      ) : view === 'monthly' && comparison ? (
        <MonthlyView data={comparison} />
      ) : view === 'ytd' && ytd ? (
        <YTDView data={ytd} />
      ) : view === 'edit' ? (
        <EditView
          budgets={allBudgets.filter(b => b.month === month)}
          categories={categories.filter(c => c.is_active !== false)}
          year={year}
          month={month}
          editEpoch={editEpoch}
          onUpsert={handleUpsertAmount}
          onDelete={handleBudgetDelete}
          onCopyPrevious={handleCopyPrevious}
        />
      ) : view === 'categories' ? (
        <CategoriesView
          categories={categories}
          onChanged={async (msg) => {
            setSuccess(msg || 'Saved');
            await loadCategories();
          }}
          onError={(msg) => setError(msg)}
        />
      ) : null}
    </div>
  );
}

function EditView({ budgets, categories, year, month, editEpoch, onUpsert, onDelete, onCopyPrevious }) {
  const budgetByCategory = useMemo(() => {
    const map = {};
    budgets.forEach(b => { map[b.category_id] = b; });
    return map;
  }, [budgets]);

  const sortCats = (list) => [...list].sort((a, b) => {
    const ao = a.sort_order ?? 0;
    const bo = b.sort_order ?? 0;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
  const incomeCats = sortCats(categories.filter(c => c.type === 'income'));
  const expenseCats = sortCats(categories.filter(c => c.type === 'expense'));

  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);

  // Resync drafts when period loads or after copy — not after every single-row save
  useEffect(() => {
    const next = {};
    categories.forEach(c => {
      const existing = budgetByCategory[c.id];
      next[c.id] = existing != null ? String(parseFloat(existing.budgeted_amount) || 0) : '';
    });
    setDrafts(next);
  }, [year, month, editEpoch, categories]);

  const parseDraft = (categoryId) => {
    const raw = drafts[categoryId];
    if (raw === '' || raw == null) return null;
    const n = parseFloat(raw);
    return Number.isNaN(n) ? null : n;
  };

  const incomeTotal = incomeCats.reduce((s, c) => s + (parseDraft(c.id) || 0), 0);
  const expenseTotal = expenseCats.reduce((s, c) => s + (parseDraft(c.id) || 0), 0);
  const net = incomeTotal - expenseTotal;
  const linesSet = [...incomeCats, ...expenseCats].filter(c => parseDraft(c.id) != null).length;

  const setDraft = (categoryId, value) => {
    setDrafts(prev => ({ ...prev, [categoryId]: value }));
  };

  const commitRow = async (category) => {
    const existing = budgetByCategory[category.id];
    const amount = parseDraft(category.id);
    const raw = drafts[category.id];

    // Empty field + no existing line → nothing to do
    if ((raw === '' || raw == null) && !existing) return;

    // Empty field + existing line → remove
    if ((raw === '' || raw == null) && existing) {
      setSavingId(category.id);
      try {
        await onDelete(existing.id);
      } finally {
        setSavingId(null);
      }
      return;
    }

    if (amount == null || amount < 0) return;

    const prevAmount = existing != null ? parseFloat(existing.budgeted_amount) : null;
    if (prevAmount != null && Math.abs(prevAmount - amount) < 0.005) return;

    setSavingId(category.id);
    try {
      await onUpsert(category.id, amount);
    } finally {
      setSavingId(null);
    }
  };

  const renderSection = (title, cats, tone) => (
    <div className="mb-6 last:mb-0">
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg ${tone === 'income' ? 'bg-green-50' : 'bg-red-50'}`}>
        <h4 className={`text-sm font-bold ${tone === 'income' ? 'text-green-800' : 'text-red-800'}`}>{title}</h4>
        <span className={`text-sm font-medium ${tone === 'income' ? 'text-green-700' : 'text-red-700'}`}>
          {fmt(tone === 'income' ? incomeTotal : expenseTotal)}
        </span>
      </div>
      <div className="border border-t-0 border-gray-200 rounded-b-lg divide-y">
        {cats.length === 0 ? (
          <p className="px-3 py-4 text-sm text-gray-400">No {tone} categories yet. Use the Categories tab to add them.</p>
        ) : cats.map(c => {
          const existing = budgetByCategory[c.id];
          const isSaving = savingId === c.id;
          return (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                {!existing && drafts[c.id] === '' && (
                  <p className="text-xs text-gray-400">Not in this month&apos;s budget</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input w-32 text-right py-1.5 text-sm"
                  placeholder="—"
                  value={drafts[c.id] ?? ''}
                  disabled={isSaving}
                  onChange={e => setDraft(c.id, e.target.value)}
                  onBlur={() => commitRow(c)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    }
                  }}
                />
                {existing && (
                  <button
                    type="button"
                    className="text-xs text-red-400 hover:text-red-600 px-1"
                    title="Remove from this month"
                    disabled={isSaving}
                    onClick={async () => {
                      setDraft(c.id, '');
                      setSavingId(c.id);
                      try { await onDelete(existing.id); } finally { setSavingId(null); }
                    }}
                  >
                    Clear
                  </button>
                )}
                {isSaving && <span className="text-xs text-gray-400 w-10">…</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{MONTHS[month]} {year}</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {linesSet === 0
                ? 'No amounts set yet — enter amounts below or copy last month.'
                : `${linesSet} categor${linesSet === 1 ? 'y' : 'ies'} budgeted`}
            </p>
          </div>
          <button type="button" className="btn-secondary text-sm" onClick={onCopyPrevious}>
            Copy previous month
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2">
            <p className="text-xs text-green-700">Planned income</p>
            <p className="text-lg font-bold text-green-800">{fmt(incomeTotal)}</p>
          </div>
          <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2">
            <p className="text-xs text-red-700">Planned expenses</p>
            <p className="text-lg font-bold text-red-800">{fmt(expenseTotal)}</p>
          </div>
          <div className={`rounded-lg border px-3 py-2 ${net >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}>
            <p className="text-xs text-gray-600">Planned net</p>
            <p className={`text-lg font-bold ${net >= 0 ? 'text-blue-800' : 'text-amber-800'}`}>{fmt(net)}</p>
          </div>
        </div>

        {categories.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">No categories available. Create income and expense categories before building a budget.</p>
        ) : (
          <>
            {renderSection('Income', incomeCats, 'income')}
            {renderSection('Expenses', expenseCats, 'expense')}
          </>
        )}
      </div>
    </div>
  );
}

function CategoriesView({ categories, onChanged, onError }) {
  const [form, setForm] = useState({ name: '', type: 'expense', description: '', sort_order: '' });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', sort_order: '' });

  const sortCats = (list) => [...list].sort((a, b) => {
    const ao = a.sort_order ?? 0;
    const bo = b.sort_order ?? 0;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
  const active = sortCats(categories.filter((c) => c.is_active !== false));
  const inactive = sortCats(categories.filter((c) => c.is_active === false));

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await categoriesAPI.create({
        name: form.name.trim(),
        type: form.type,
        description: form.description.trim() || null,
        sort_order: form.sort_order === '' ? 0 : parseInt(form.sort_order, 10),
      });
      setForm({ name: '', type: 'expense', description: '', sort_order: '' });
      await onChanged('Category created');
    } catch (err) {
      onError(err.response?.data?.error || 'Failed to create category');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (cat) => {
    setEditingId(cat.id);
    setEditForm({
      name: cat.name,
      description: cat.description || '',
      sort_order: String(cat.sort_order ?? 0),
    });
  };

  const saveEdit = async (cat) => {
    setSaving(true);
    try {
      await categoriesAPI.update(cat.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        sort_order: editForm.sort_order === '' ? 0 : parseInt(editForm.sort_order, 10),
      });
      setEditingId(null);
      await onChanged('Category updated');
    } catch (err) {
      onError(err.response?.data?.error || 'Failed to update category');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (cat) => {
    if (!window.confirm(`Deactivate “${cat.name}”? Existing transactions keep the history; it won’t appear on new budgets.`)) return;
    try {
      await categoriesAPI.remove(cat.id);
      await onChanged('Category deactivated');
    } catch (err) {
      onError(err.response?.data?.error || 'Failed to deactivate');
    }
  };

  const reactivate = async (cat) => {
    try {
      await categoriesAPI.update(cat.id, { is_active: true });
      await onChanged('Category reactivated');
    } catch (err) {
      onError(err.response?.data?.error || 'Failed to reactivate');
    }
  };

  const ensureDefaults = async () => {
    try {
      const res = await categoriesAPI.ensureDefaults();
      await onChanged(
        `Workbook categories ready (${res.data.added || 0} added, ${res.data.reactivated || 0} reactivated)`
      );
    } catch (err) {
      onError(err.response?.data?.error || 'Failed to ensure defaults');
    }
  };

  const renderList = (list, inactiveList = false) => (
    <div className="border border-gray-200 rounded-lg divide-y">
      {list.length === 0 ? (
        <p className="px-3 py-4 text-sm text-gray-400">None</p>
      ) : list.map((c) => (
        <div key={c.id} className="px-3 py-2.5 flex flex-wrap items-center gap-3 hover:bg-gray-50">
          {editingId === c.id ? (
            <>
              <input className="input flex-1 min-w-[10rem] py-1 text-sm" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              <input className="input flex-1 min-w-[10rem] py-1 text-sm" placeholder="Description" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
              <input className="input w-20 py-1 text-sm" type="number" title="Sort order" value={editForm.sort_order} onChange={(e) => setEditForm({ ...editForm, sort_order: e.target.value })} />
              <button type="button" className="btn-primary text-xs" disabled={saving} onClick={() => saveEdit(c)}>Save</button>
              <button type="button" className="btn-secondary text-xs" onClick={() => setEditingId(null)}>Cancel</button>
            </>
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{c.name}</p>
                <p className="text-xs text-gray-500">{c.description || c.type}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${c.type === 'income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{c.type}</span>
              {!inactiveList ? (
                <>
                  <button type="button" className="text-xs text-blue-600 hover:text-blue-800" onClick={() => startEdit(c)}>Edit</button>
                  <button type="button" className="text-xs text-red-500 hover:text-red-700" onClick={() => deactivate(c)}>Deactivate</button>
                </>
              ) : (
                <button type="button" className="text-xs text-blue-600 hover:text-blue-800" onClick={() => reactivate(c)}>Reactivate</button>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Manage categories</h3>
            <p className="text-sm text-gray-500 mt-1">
              These are the lines used in Build Budget and when categorizing transactions.
            </p>
          </div>
          <button type="button" className="btn-secondary text-sm" onClick={ensureDefaults}>
            Ensure workbook defaults
          </button>
        </div>

        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
          <div className="md:col-span-2">
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Grounds" />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          <div>
            <label className="label">Sort</label>
            <input className="input" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} placeholder="0" />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full" disabled={saving || !form.name.trim()}>Add</button>
          </div>
          <div className="md:col-span-5">
            <label className="label">Description (optional)</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </form>

        <h4 className="text-sm font-bold text-green-800 mb-2">Income</h4>
        {renderList(active.filter((c) => c.type === 'income'))}
        <h4 className="text-sm font-bold text-red-800 mt-4 mb-2">Expenses</h4>
        {renderList(active.filter((c) => c.type === 'expense'))}

        {inactive.length > 0 && (
          <>
            <h4 className="text-sm font-bold text-gray-600 mt-6 mb-2">Inactive</h4>
            {renderList(inactive, true)}
          </>
        )}
      </div>
    </div>
  );
}

function MonthlyView({ data }) {
  const incomeItems = data.line_items.filter(i => i.category_type === 'income');
  const expenseItems = data.line_items.filter(i => i.category_type === 'expense');

  return (
    <div>
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

      <BudgetVsActualChart summary={data.summary} />

      <div className="card overflow-x-auto">
        {data.line_items.length === 0 ? (
          <p className="py-8 text-center text-gray-400 text-sm">No budget lines for this month yet. Use Build Budget to set them.</p>
        ) : (
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
        )}
      </div>
    </div>
  );
}

function BudgetVsActualChart({ summary }) {
  const groups = [
    {
      label: 'Income',
      budgeted: summary.total_budgeted_income || 0,
      actual: summary.total_actual_income || 0,
      budgetColor: '#86efac',
      actualColor: '#16a34a',
    },
    {
      label: 'Expenses',
      budgeted: summary.total_budgeted_expense || 0,
      actual: summary.total_actual_expense || 0,
      budgetColor: '#fca5a5',
      actualColor: '#dc2626',
    },
  ];

  const maxVal = Math.max(
    ...groups.flatMap(g => [g.budgeted, g.actual]),
    1
  );

  const width = 560;
  const height = 220;
  const padL = 48;
  const padB = 36;
  const padT = 24;
  const chartH = height - padT - padB;
  const groupWidth = (width - padL - 24) / groups.length;

  return (
    <div className="card mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-lg font-bold text-gray-900">Budget vs Actual</h3>
        <div className="flex gap-4 text-xs text-gray-600">
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-300 inline-block" /> Budgeted</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-700 inline-block" /> Actual</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-2xl h-auto" role="img" aria-label="Budget versus actual bar chart">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = padT + chartH * (1 - t);
            const val = maxVal * t;
            return (
              <g key={t}>
                <line x1={padL} x2={width - 8} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
                  {val >= 1000 ? `${Math.round(val / 1000)}k` : Math.round(val)}
                </text>
              </g>
            );
          })}
          {groups.map((g, i) => {
            const cx = padL + groupWidth * i + groupWidth / 2;
            const barW = Math.min(36, groupWidth * 0.28);
            const gap = 8;
            const budgetH = (g.budgeted / maxVal) * chartH;
            const actualH = (g.actual / maxVal) * chartH;
            return (
              <g key={g.label}>
                <rect
                  x={cx - barW - gap / 2}
                  y={padT + chartH - budgetH}
                  width={barW}
                  height={Math.max(budgetH, 0)}
                  fill={g.budgetColor}
                  rx="3"
                />
                <rect
                  x={cx + gap / 2}
                  y={padT + chartH - actualH}
                  width={barW}
                  height={Math.max(actualH, 0)}
                  fill={g.actualColor}
                  rx="3"
                />
                <text x={cx} y={height - 12} textAnchor="middle" fontSize="12" fontWeight="600" fill="#374151">
                  {g.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-2 text-sm">
        {groups.map(g => (
          <div key={g.label} className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="font-medium text-gray-800">{g.label}</p>
            <p className="text-gray-500">Budgeted {fmt(g.budgeted)}</p>
            <p className="text-gray-900 font-medium">Actual {fmt(g.actual)}</p>
          </div>
        ))}
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
      {data.line_items.length === 0 ? (
        <p className="py-8 text-center text-gray-400 text-sm">No budget data for this year yet.</p>
      ) : (
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
      )}
    </div>
  );
}
