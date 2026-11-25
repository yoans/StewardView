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

  const handleFillYear = async () => {
    if (!window.confirm(`Use ${MONTHS[month]} ${year} as the plan for every month of ${year}? Other months of ${year} will be replaced.`)) return;
    setError(''); setSuccess('');
    try {
      const res = await budgetsAPI.fillYear({ year, month });
      setSuccess(res.data?.message || 'Year updated');
      await loadEditData();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not copy this month to the year');
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
          onFillYear={handleFillYear}
          transferNote={transferNote(categories)}
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

function transferNote(categories) {
  const covered = (categories || []).filter((category) => category.covered_by_transfer);
  if (!covered.length) return '';
  const bits = covered.map((category) => `${category.transfer_fund || category.name} ${fmt(category.transfer_amount)}`);
  return `Automatic fund transfers stay on the Funds page and are not spending: ${bits.join(', ')}.`;
}

function EditView({ budgets, categories, year, month, editEpoch, onUpsert, onDelete, onCopyPrevious, onFillYear, transferNote: aside }) {
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
  const incomeCats = sortCats(categories.filter(c => c.type === 'income' && !c.covered_by_transfer));
  const expenseCats = sortCats(categories.filter(c => c.type === 'expense' && !c.covered_by_transfer));

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

  const renderSection = (title, cats, tone) => {
    const sectionTotal = cats.reduce((sum, category) => sum + (parseDraft(category.id) || 0), 0);
    return (
    <div className="mb-6 last:mb-0">
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg ${tone === 'income' ? 'bg-green-50' : 'bg-red-50'}`}>
        <h4 className={`text-sm font-bold ${tone === 'income' ? 'text-green-800' : 'text-red-800'}`}>{title}</h4>
        <span className={`text-sm font-medium ${tone === 'income' ? 'text-green-700' : 'text-red-700'}`}>
          {fmt(sectionTotal)}
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
  };

  const grouped = (cats, fallback) => {
    const map = new Map();
    cats.forEach((category) => {
      const key = category.group_name || fallback;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(category);
    });
    return [...map.entries()];
  };

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
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary text-sm" onClick={onCopyPrevious}>
              Copy previous month
            </button>
            <button type="button" className="btn-secondary text-sm" onClick={onFillYear}>
              Use for the whole year
            </button>
          </div>
        </div>

        {aside && <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-4">{aside}</p>}

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
            {grouped(incomeCats, 'Giving').map(([name, cats]) => renderSection(name, cats, 'income'))}
            {grouped(expenseCats, 'Spending').map(([name, cats]) => renderSection(name, cats, 'expense'))}
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
      <RulesPanel categories={active} onChanged={onChanged} onError={onError} />
    </div>
  );
}

function ruleLabel(rule) {
  const how = rule.match_mode === 'exact' ? 'is exactly' : 'contains';
  const bounds = [
    rule.min_amount != null ? `at least ${fmt(rule.min_amount)}` : '',
    rule.max_amount != null ? `at most ${fmt(rule.max_amount)}` : '',
  ].filter(Boolean).join(' and ');
  const rank = rule.day_rank === 'lowest' ? 'the smaller amount that day' : rule.day_rank === 'highest' ? 'the larger amount that day' : '';
  return `When the description ${how} “${rule.pattern}”${bounds ? ` and the amount is ${bounds}` : ''}${rank ? ` (${rank})` : ''}`;
}

function RulesPanel({ categories, onChanged, onError }) {
  const [rules, setRules] = useState([]);
  const [pattern, setPattern] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await categoriesAPI.rules();
      setRules(res.data || []);
    } catch (err) {
      onError(err.response?.data?.error || 'Could not load categorization rules');
    }
  };

  useEffect(() => { load(); }, []);

  const addRule = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await categoriesAPI.createRule({ pattern, category_id: Number(categoryId) });
      setPattern('');
      setCategoryId('');
      await load();
      await onChanged('Rule saved');
    } catch (err) {
      onError(err.response?.data?.error || 'Could not save that rule');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    try {
      const res = await categoriesAPI.applyRules();
      await onChanged(res.data?.message || 'Categorized');
    } catch (err) {
      onError(err.response?.data?.error || 'Could not apply the rules');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Always the same</h3>
          <p className="text-sm text-gray-500 mt-1">Payroll, utilities, insurance, plate deposits, and online giving are filed automatically. A category you already chose is left alone.</p>
        </div>
        <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={apply}>Categorize uncategorized</button>
      </div>
      <ul className="divide-y border border-gray-200 rounded-lg mb-4">
        {rules.length === 0 && <li className="px-3 py-3 text-sm text-gray-400">No rules yet. They are added with the workbook categories.</li>}
        {rules.map((rule) => (
          <li key={rule.id} className="px-3 py-2 flex items-center gap-3 text-sm">
            <span className="flex-1 text-gray-700">{ruleLabel(rule)} → <span className="font-medium text-gray-900">{rule.category_name}</span></span>
            <button type="button" className="text-xs text-red-500" onClick={async () => {
              await categoriesAPI.removeRule(rule.id);
              await load();
            }}>Remove</button>
          </li>
        ))}
      </ul>
      <form onSubmit={addRule} className="flex flex-col md:flex-row gap-2">
        <input className="input flex-1" placeholder="Description contains…" value={pattern} onChange={(e) => setPattern(e.target.value)} required />
        <select className="input md:w-64" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
          <option value="">Category</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <button type="submit" className="btn-primary text-sm" disabled={busy || !pattern.trim() || !categoryId}>Add rule</button>
      </form>
    </div>
  );
}

function groupLines(items) {
  const map = new Map();
  [...items]
    .sort((a, b) => (b.budgeted || 0) - (a.budgeted || 0) || a.category_name.localeCompare(b.category_name))
    .forEach((item) => {
      const key = item.group_name || (item.category_type === 'income' ? 'Giving' : 'Spending');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
  return [...map.entries()].sort((a, b) => {
    const aPlan = a[1].reduce((sum, row) => sum + (row.budgeted || 0), 0);
    const bPlan = b[1].reduce((sum, row) => sum + (row.budgeted || 0), 0);
    return bPlan - aPlan || a[0].localeCompare(b[0]);
  });
}

function Meter({ actual, budget, income = false }) {
  if (!budget) return null;
  const pct = Math.max(0, Math.min(100, (actual / budget) * 100));
  const over = actual > budget + 0.009;
  const bar = income || !over ? 'bg-emerald-600' : 'bg-amber-500';
  return (
    <div className="h-1.5 w-24 bg-gray-100 rounded-full overflow-hidden" title={`${Math.round((actual / budget) * 100)}% of plan`}>
      <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function aheadOfPlan(actual, plan) {
  return (plan || 0) > 0 && actual > plan + 0.009;
}

function PlanTable({ items, income = false }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-500 border-b">
          <th className="pb-2 font-medium">Category</th>
          <th className="pb-2 text-right font-medium">Plan</th>
          <th className="pb-2 text-right font-medium">{income ? 'Received' : 'Spent'}</th>
          <th className="pb-2 text-right font-medium">Left</th>
          <th className="pb-2 w-28"></th>
        </tr>
      </thead>
      <tbody>
        {groupLines(items).map(([group, rows]) => {
          const plan = rows.reduce((sum, row) => sum + (row.budgeted || 0), 0);
          const actual = rows.reduce((sum, row) => sum + (row.actual || 0), 0);
          const left = plan - actual;
          const ahead = income && aheadOfPlan(actual, plan);
          const overSpent = !income && left < -0.009;
          return (
            <React.Fragment key={group}>
              <tr className="bg-gray-50">
                <td className="py-2 font-semibold text-gray-800">{group}</td>
                <td className="py-2 text-right text-gray-700">{fmt(plan)}</td>
                <td className={`py-2 text-right font-medium ${ahead ? 'text-emerald-700' : 'text-gray-900'}`}>{fmt(actual)}</td>
                <td className={`py-2 text-right font-medium ${ahead ? 'text-emerald-700' : overSpent ? 'text-amber-700' : 'text-gray-700'}`}>
                  {ahead ? `+${fmt(actual - plan)}` : fmt(left)}
                </td>
                <td className="py-2 pl-3"><Meter actual={actual} budget={plan} income={income} /></td>
              </tr>
              {rows.map((row) => {
                const rowLeft = (row.budgeted || 0) - (row.actual || 0);
                const rowAhead = income && aheadOfPlan(row.actual, row.budgeted);
                const over = !income && row.budgeted > 0 && row.actual > row.budgeted + 0.009;
                return (
                  <tr key={row.category_id} className="border-b last:border-0">
                    <td className="py-2 pl-4 text-gray-800">{row.category_name}</td>
                    <td className="py-2 text-right text-gray-600">{row.budgeted ? fmt(row.budgeted) : '—'}</td>
                    <td className={`py-2 text-right font-medium ${rowAhead ? 'text-emerald-700' : 'text-gray-900'}`}>{fmt(row.actual)}</td>
                    <td className={`py-2 text-right ${rowAhead || over ? 'font-medium' : ''} ${rowAhead ? 'text-emerald-700' : over ? 'text-amber-700' : 'text-gray-600'}`}>
                      {row.budgeted ? (rowAhead ? `+${fmt(row.actual - row.budgeted)}` : fmt(rowLeft)) : '—'}
                    </td>
                    <td className="py-2 pl-3"><Meter actual={row.actual} budget={row.budgeted} income={income} /></td>
                  </tr>
                );
              })}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function givingLine(items, pattern) {
  return items.find((item) => pattern.test(item.category_name));
}

function MonthlyView({ data }) {
  const incomeItems = (data.line_items || []).filter((item) => item.category_type === 'income');
  const expenseItems = (data.line_items || []).filter((item) => item.category_type === 'expense');
  const general = givingLine(incomeItems, /general contribution|offering/i);
  const online = givingLine(incomeItems, /online/i);
  const plan = data.summary?.total_budgeted_expense || 0;
  const spent = data.summary?.total_actual_expense || 0;
  const left = plan - spent;
  const pct = plan > 0 ? Math.max(0, Math.min(100, (spent / plan) * 100)) : 0;
  const uncategorized = data.uncategorized?.expense || 0;

  return (
    <div>
      {uncategorized > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          {fmt(uncategorized)} of spending this month is not on a budget line yet. Assign it on Transactions, or add a rule under Categories.
        </p>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-3">This month’s budget</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className={`card ${aheadOfPlan(general?.actual || 0, general?.budgeted || 0) ? 'ring-1 ring-emerald-200' : ''}`}>
              <p className="text-sm text-gray-500">General contributions</p>
              <p className={`text-2xl font-bold ${aheadOfPlan(general?.actual || 0, general?.budgeted || 0) ? 'text-emerald-700' : 'text-gray-900'}`}>{fmt(general?.actual || 0)}</p>
              <p className="text-xs text-gray-500 mt-1">Plan {fmt(general?.budgeted || 0)}</p>
            </div>
            <div className={`card ${aheadOfPlan(online?.actual || 0, online?.budgeted || 0) ? 'ring-1 ring-emerald-200' : ''}`}>
              <p className="text-sm text-gray-500">Online contributions</p>
              <p className={`text-2xl font-bold ${aheadOfPlan(online?.actual || 0, online?.budgeted || 0) ? 'text-emerald-700' : 'text-gray-900'}`}>{fmt(online?.actual || 0)}</p>
              <p className="text-xs text-gray-500 mt-1">Plan {fmt(online?.budgeted || 0)}</p>
            </div>
            <div className="card">
              <p className="text-sm text-gray-500">Spending plan</p>
              <p className="text-2xl font-bold text-gray-900">{fmt(plan)}</p>
              <p className="text-xs text-gray-500 mt-1">{left < -0.009 ? 'Over' : 'Left'} {fmt(Math.abs(left))} · spent {fmt(spent)}</p>
              <div className="h-2 bg-gray-100 rounded-full mt-2 overflow-hidden">
                <div className={`h-full ${spent > plan + 0.009 ? 'bg-amber-500' : 'bg-emerald-600'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
          <section className="mb-6">
            <h3 className="text-base font-bold text-gray-900 mb-3">Income</h3>
            {incomeItems.length > 0 ? (
              <div className="card overflow-x-auto">
                <PlanTable items={incomeItems} income />
              </div>
            ) : (
              <p className="text-sm text-gray-400">No income recorded for this month.</p>
            )}
          </section>
          <section>
            <h3 className="text-base font-bold text-gray-900 mb-3">Expenses</h3>
            <div className="card overflow-x-auto">
              {expenseItems.length === 0 ? (
                <p className="py-8 text-center text-gray-400 text-sm">No regular bills in this month’s plan yet.</p>
              ) : (
                <PlanTable items={expenseItems} />
              )}
            </div>
          </section>
        </div>
        <FundMonthPanel funds={data.funds} generalFund={data.general_fund} addedLabel="Added" spentLabel="Spent" />
      </div>
    </div>
  );
}

function moneyTone(amount) {
  if (amount > 0.009) return 'text-emerald-700';
  if (amount < -0.009) return 'text-rose-700';
  return 'text-gray-400';
}

function FundMonthPanel({ funds, generalFund, addedLabel, spentLabel }) {
  const rows = funds || [];
  const totals = rows.reduce((sum, fund) => ({
    transfer: sum.transfer + (fund.monthly_transfer || 0),
    added: sum.added + (fund.added_this_month || 0),
    spent: sum.spent + (fund.spent || 0),
    change: sum.change + (fund.change || 0),
  }), { transfer: 0, added: 0, spent: 0, change: 0 });

  return (
    <section className="card">
      <h3 className="text-lg font-bold text-gray-900">Funds this month</h3>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        Next to the budget, and not part of it. The set-aside is the same each month. Spending from a fund is listed here because it varies.
      </p>
      <GeneralReserve reserve={generalFund} />
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">No fund activity.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-2 pr-3 font-medium">Fund</th>
                <th className="py-2 px-2 text-right font-medium">Set aside</th>
                <th className="py-2 px-2 text-right font-medium">{addedLabel}</th>
                <th className="py-2 px-2 text-right font-medium">{spentLabel}</th>
                <th className="py-2 px-2 text-right font-medium">Change</th>
                <th className="py-2 pl-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((fund) => (
                <React.Fragment key={fund.id}>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 pr-3 font-medium text-gray-900">{fund.name.replace(/ Fund$/, '')}</td>
                    <td className="py-2 px-2 text-right text-sky-800">{fund.monthly_transfer ? fmt(fund.monthly_transfer) : '—'}</td>
                    <td className={`py-2 px-2 text-right font-medium ${fund.monthly_transfer > 0 && !(fund.added_this_month > 0.009) ? 'text-amber-700' : moneyTone(fund.added_this_month || 0)}`}>{fmt(fund.added_this_month || 0)}</td>
                    <td className={`py-2 px-2 text-right font-medium ${(fund.spent || 0) > 0.009 ? 'text-rose-700' : 'text-gray-400'}`}>{fmt(fund.spent || 0)}</td>
                    <td className={`py-2 px-2 text-right font-medium ${moneyTone(fund.change || 0)}`}>{fmt(fund.change || 0)}</td>
                    <td className={`py-2 pl-2 text-right font-medium ${(fund.balance || 0) > 0.009 ? 'text-emerald-800' : 'text-gray-400'}`}>{fmt(fund.balance || 0)}</td>
                  </tr>
                  {(fund.debits || []).map((debit) => (
                    <tr key={debit.id} className="border-b border-gray-50">
                      <td className="pb-2 pl-3 text-gray-500" colSpan={5}>
                        {debit.date} {debit.description}{debit.check_number ? ` · check ${debit.check_number}` : ''}
                      </td>
                      <td className="pb-2 pl-2 text-right text-gray-600 whitespace-nowrap">{fmt(debit.amount)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t">
                <td className="py-2 pr-3 font-semibold text-gray-900">Total</td>
                <td className="py-2 px-2 text-right font-semibold text-sky-800">{fmt(totals.transfer)}</td>
                <td className={`py-2 px-2 text-right font-semibold ${moneyTone(totals.added)}`}>{fmt(totals.added)}</td>
                <td className={`py-2 px-2 text-right font-semibold ${(totals.spent || 0) > 0.009 ? 'text-rose-700' : 'text-gray-400'}`}>{fmt(totals.spent)}</td>
                <td className={`py-2 px-2 text-right font-semibold ${moneyTone(totals.change)}`}>{fmt(totals.change)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-3">Set aside posts from General on the 1st. Added is what has posted. Change is added minus spent. Balance is the fund today.</p>
    </section>
  );
}

function GeneralReserve({ reserve }) {
  if (!reserve) return null;
  const met = reserve.target > 0 && reserve.difference >= -0.009;
  const monthShort = reserve.monthly_fixed > 0 ? Math.max(0, -reserve.difference) / reserve.monthly_fixed : 0;
  const severe = reserve.target > 0 && !met && monthShort >= 1;
  const tone = !reserve.target
    ? 'border-gray-200 bg-gray-50'
    : met
      ? 'border-emerald-200 bg-emerald-50'
      : severe
        ? 'border-red-200 bg-red-50'
        : 'border-amber-200 bg-amber-50';
  const valueTone = !reserve.target ? 'text-gray-900' : met ? 'text-emerald-800' : severe ? 'text-red-800' : 'text-amber-900';
  const filled = reserve.target > 0 ? Math.max(0, Math.min(100, (reserve.balance / reserve.target) * 100)) : 0;

  return (
    <div className={`rounded-lg border px-4 py-3 mb-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">General Fund target</p>
          <p className="text-xs text-gray-600 mt-0.5">3 × fixed monthly bills ({fmt(reserve.monthly_fixed)})</p>
        </div>
        {reserve.target > 0 && (
          <p className={`text-sm font-semibold ${valueTone}`}>{met ? 'At target' : 'Below target'}</p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3">
        <div>
          <p className="text-xs text-gray-500">Target</p>
          <p className="font-semibold text-gray-900">{fmt(reserve.target)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Balance</p>
          <p className={`font-semibold ${reserve.target ? valueTone : 'text-gray-900'}`}>{fmt(reserve.balance)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">{!reserve.target ? 'No plan yet' : met ? 'Above target' : 'Short'}</p>
          <p className={`font-semibold ${reserve.target ? valueTone : 'text-gray-900'}`}>{fmt(Math.abs(reserve.difference || 0))}</p>
        </div>
      </div>
      {reserve.target > 0 && (
        <div className="h-2 bg-white/80 rounded-full mt-3 overflow-hidden">
          <div className={`h-full ${met ? 'bg-emerald-600' : severe ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${filled}%` }} />
        </div>
      )}
    </div>
  );
}

function YTDView({ data }) {
  const incomeItems = (data.line_items || []).filter((item) => item.category_type === 'income');
  const expenseItems = (data.line_items || []).filter((item) => item.category_type === 'expense');
  const plan = data.summary?.total_budgeted_expense || 0;
  const spent = data.summary?.total_actual_expense || 0;
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="card">
          <p className="text-sm text-gray-500">Plan through {MONTHS[data.through_month]}</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(plan)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Spent on the plan</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(spent)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Giving received</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(data.summary?.total_actual_income || 0)}</p>
        </div>
      </div>
      <div className="card overflow-x-auto">
        <h3 className="text-lg font-bold mb-4">Year-to-date through {MONTHS[data.through_month]} {data.year}</h3>
        <h3 className="text-lg font-bold mb-3">Income</h3>
        {incomeItems.length > 0 ? <PlanTable items={incomeItems} income /> : <p className="text-sm text-gray-400 mb-4">No income recorded.</p>}
        <h3 className="text-lg font-bold mt-6 mb-3">Expenses</h3>
        {expenseItems.length === 0 ? (
          <p className="py-8 text-center text-gray-400 text-sm">No spending plan for this year yet.</p>
        ) : (
          <PlanTable items={expenseItems} />
        )}
      </div>
      <div className="mt-4">
        <FundMonthPanel funds={data.funds} generalFund={data.general_fund} addedLabel="Added this year" spentLabel="Spent this year" />
      </div>
    </div>
  );
}
