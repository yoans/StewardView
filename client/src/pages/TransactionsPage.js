import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { transactionsAPI, categoriesAPI, fundsAPI } from '../services/api';
import { formatDate } from '../utils/format';

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** Bank settlement from Givelify (5/3 BANKCARD) — funds already counted on Givelify import. */
function isGivelifyBankSettlement(txn) {
  if (!txn || txn.type !== 'income') return false;
  const hay = `${txn.description || ''} ${txn.payee_payer || ''} ${txn.notes || ''}`.toLowerCase();
  if (hay.includes('givelify')) return true;
  if (/5\s*\/\s*3/.test(hay) && hay.includes('bankcard')) return true;
  if (hay.includes('likely givelify settlement')) return true;
  return false;
}

export default function TransactionsPage({ user }) {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [funds, setFunds] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [filters, setFilters] = useState({ type: '', start_date: '', end_date: '' });
  const [form, setForm] = useState({
    type: 'expense', amount: '', date: new Date().toISOString().slice(0, 10),
    description: '', payee_payer: '', check_number: '', category_id: '',
    bank_account_id: '', fund_id: '', notes: '',
  });
  const [loading, setLoading] = useState(true);
  const canEdit = ['admin', 'treasurer', 'finance_committee'].includes(user.role);

  const generalFundId = funds.find(f => f.name === 'General Fund')?.id;

  const emptyForm = () => ({
    type: 'expense',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    description: '',
    payee_payer: '',
    check_number: '',
    category_id: '',
    bank_account_id: '',
    fund_id: generalFundId ? String(generalFundId) : '',
    notes: '',
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const startCreate = () => {
    setShowImport(false);
    if (showForm && !editingId) {
      closeForm();
      return;
    }
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const startEdit = (txn) => {
    setShowImport(false);
    setEditingId(txn.id);
    setForm({
      type: txn.type || 'expense',
      amount: txn.amount != null ? String(txn.amount) : '',
      date: formatDate(txn.date),
      description: txn.description || '',
      payee_payer: txn.payee_payer || '',
      check_number: txn.check_number || '',
      category_id: txn.category_id ? String(txn.category_id) : '',
      bank_account_id: txn.bank_account_id ? String(txn.bank_account_id) : '',
      fund_id: txn.fund_id ? String(txn.fund_id) : '',
      notes: txn.notes || '',
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [txnRes, catRes, fundRes] = await Promise.all([
        transactionsAPI.list(filters),
        categoriesAPI.list(),
        fundsAPI.list(),
      ]);
      setCategories(catRes.data);
      setFunds(fundRes.data);
      const gf = fundRes.data.find(f => f.name === 'General Fund');
      setForm(prev => (prev.fund_id || !gf ? prev : { ...prev, fund_id: String(gf.id) }));

      let txns = txnRes.data;
      // Non-Givelify rows with no fund → assign General Fund (Givelify settlements stay Various)
      if (canEdit && gf?.id) {
        const needsFund = txns.filter(
          (t) => t.status !== 'void' && !t.fund_id && !isGivelifyBankSettlement(t)
        );
        if (needsFund.length) {
          await Promise.all(
            needsFund.map((t) =>
              transactionsAPI.update(t.id, {
                fund_id: gf.id,
                change_reason: 'Defaulted to General Fund',
              }).catch(() => null)
            )
          );
          const refreshed = await transactionsAPI.list(filters);
          txns = refreshed.data;
        }
      }
      const onlineCat = catRes.data.find((c) => c.name === 'Online Contributions' && c.type === 'income');
      if (canEdit && onlineCat?.id) {
        const needsOnline = txns.filter(
          (t) => t.status !== 'void' && isGivelifyBankSettlement(t) && !t.category_id
        );
        if (needsOnline.length) {
          await Promise.all(
            needsOnline.map((t) =>
              transactionsAPI.update(t.id, {
                category_id: onlineCat.id,
                fund_id: t.fund_id || null,
                change_reason: 'Givelify bank deposit categorized as Online Contributions',
              }).catch(() => null)
            )
          );
          const refreshed = await transactionsAPI.list(filters);
          txns = refreshed.data;
        }
      }
      setTransactions(txns);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleFilter = () => loadData();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      type: form.type,
      amount: parseFloat(form.amount),
      date: form.date,
      description: form.description,
      payee_payer: form.payee_payer || null,
      check_number: form.check_number || null,
      category_id: form.category_id ? parseInt(form.category_id, 10) : null,
      bank_account_id: form.bank_account_id ? parseInt(form.bank_account_id, 10) : null,
      fund_id: form.fund_id
        ? parseInt(form.fund_id, 10)
        : (editingId ? null : (generalFundId || null)),
      notes: form.notes || null,
    };
    try {
      if (editingId) {
        await transactionsAPI.update(editingId, {
          ...payload,
          change_reason: 'Edited from transactions list',
        });
      } else {
        await transactionsAPI.create(payload);
      }
      closeForm();
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || (editingId ? 'Failed to save changes' : 'Failed to create transaction'));
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this transaction?\n\nIt stays in the list as Canceled and will not count toward totals. This is not a permanent delete.')) return;
    const reason = window.prompt('Optional note (why it was canceled):') || 'Canceled from transactions list';
    try {
      await transactionsAPI.void(id, reason);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to cancel transaction');
    }
  };

  const handleFundChange = async (txn, fundId) => {
    if (isGivelifyBankSettlement(txn)) return; // Automatic — do not assign a fund
    const next = fundId ? parseInt(fundId, 10) : (generalFundId || null);
    if (String(next || '') === String(txn.fund_id || '')) return;
    try {
      await transactionsAPI.update(txn.id, {
        fund_id: next,
        change_reason: 'Assigned to fund',
      });
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update fund');
    }
  };

  const handleCategoryChange = async (txn, categoryId) => {
    const next = categoryId ? parseInt(categoryId, 10) : null;
    if (String(next || '') === String(txn.category_id || '')) return;
    try {
      await transactionsAPI.update(txn.id, {
        category_id: next,
        change_reason: 'Assigned budget category',
      });
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update category');
    }
  };

  const filteredCategories = categories.filter(c => !form.type || c.type === form.type);
  const categoriesForTxn = (txn) => categories.filter((c) => c.type === txn.type);

  return (
    <div>
      <div className="flex justify-between items-center mb-6 gap-3 flex-wrap">
        <h2 className="text-2xl font-bold text-gray-900">Transactions</h2>
        {canEdit && (
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setShowImport((v) => !v);
                closeForm();
              }}
            >
              {showImport ? 'Close import' : 'Import from CSV'}
            </button>
            <button type="button" className="btn-primary" onClick={startCreate}>
              {showForm && !editingId ? 'Cancel' : '+ New Transaction'}
            </button>
          </div>
        )}
      </div>

      {showImport && canEdit && (
        <div className="card mb-6">
          <h3 className="text-lg font-bold mb-2">Import from CSV</h3>
          <p className="text-sm text-gray-600 mb-4">
            Download the file from the bank or Givelify, then upload it in StewardView. The bank file is cash. The Givelify file is funds.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h4 className="font-bold text-gray-900 mb-2">US Bank checking</h4>
              <ol className="text-sm text-gray-700 space-y-1.5 list-decimal list-inside">
                <li>Sign in at usbank.com</li>
                <li>Go to <strong>Accounts</strong>, then open <strong>Checking</strong></li>
                <li>Set the <strong>date range</strong> you want</li>
                <li>Click <strong>Download</strong> and choose <strong>CSV</strong></li>
                <li>In StewardView, open Bank → Import and upload that file</li>
              </ol>
              <Link to="/bank?tab=import" className="btn-primary text-sm inline-block mt-4">Open Bank import</Link>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h4 className="font-bold text-gray-900 mb-2">Givelify donations</h4>
              <ol className="text-sm text-gray-700 space-y-1.5 list-decimal list-inside">
                <li>Sign in to the church Givelify dashboard</li>
                <li>Open <strong>Reports</strong>, then the <strong>Donations</strong> report</li>
                <li>Set the <strong>date range</strong> you want</li>
                <li>Export or download as <strong>CSV</strong></li>
                <li>In StewardView, open Givelify → Import CSV and upload that file</li>
              </ol>
              <Link to="/givelify?tab=import" className="btn-primary text-sm inline-block mt-4">Open Givelify import</Link>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="card mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold">{editingId ? 'Edit Transaction' : 'Record New Transaction'}</h3>
            {editingId && (
              <button type="button" className="text-sm text-gray-500 hover:text-gray-800" onClick={closeForm}>
                Cancel edit
              </button>
            )}
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.type} onChange={e => {
                const type = e.target.value;
                setForm({
                  ...form,
                  type,
                  category_id: '',
                  fund_id: type === 'expense' && !form.fund_id && generalFundId
                    ? String(generalFundId)
                    : form.fund_id,
                });
              }}>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <div>
              <label className="label">Amount</label>
              <input type="number" step="0.01" className="input" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} required />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={form.date} onChange={e => setForm({...form, date: e.target.value})} required />
            </div>
            <div className="md:col-span-2">
              <label className="label">Description</label>
              <input type="text" className="input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} required />
            </div>
            <div>
              <label className="label">Payee / Payer</label>
              <input type="text" className="input" value={form.payee_payer} onChange={e => setForm({...form, payee_payer: e.target.value})} />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})}>
                <option value="">— Select —</option>
                {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Fund</label>
              <select
                className="input"
                value={form.fund_id || (generalFundId ? String(generalFundId) : '')}
                onChange={e => setForm({...form, fund_id: e.target.value})}
              >
                {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Defaults to General Fund. A Givelify bank deposit is labeled Various. Those gifts already went to funds when the giving file was imported.
              </p>
            </div>
            <div>
              <label className="label">Check #</label>
              <input type="text" className="input" value={form.check_number} onChange={e => setForm({...form, check_number: e.target.value})} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Notes</label>
              <input type="text" className="input" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn-primary w-full">Save Transaction</button>
            </div>
          </form>
        </div>
      )}

      <div className="card mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="label">Type</label>
            <select className="input" value={filters.type} onChange={e => setFilters({...filters, type: e.target.value})}>
              <option value="">All</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={filters.start_date} onChange={e => setFilters({...filters, start_date: e.target.value})} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={filters.end_date} onChange={e => setFilters({...filters, end_date: e.target.value})} />
          </div>
          <button className="btn-secondary" onClick={handleFilter}>Apply Filters</button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <p className="text-center py-8 text-gray-500">Loading...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">Date</th>
                <th className="pb-2">Ref</th>
                <th className="pb-2">Description</th>
                <th className="pb-2">Payee/Payer</th>
                <th className="pb-2">Category</th>
                <th className="pb-2">Fund</th>
                <th className="pb-2 text-right">Amount</th>
                {canEdit && <th className="pb-2"></th>}
              </tr>
            </thead>
            <tbody>
              {transactions.map(txn => {
                const isCanceled = txn.status === 'void';
                return (
                  <tr key={txn.id} className={`border-b last:border-0 hover:bg-gray-50 ${isCanceled ? 'opacity-60' : ''}`}>
                    <td className="py-2 text-gray-600">{formatDate(txn.date)}</td>
                    <td className="py-2 text-xs text-gray-400 font-mono">{txn.ref_number?.slice(0, 8)}</td>
                    <td className="py-2 font-medium text-gray-900">
                      {txn.description}
                      {isCanceled && <span className="badge-void ml-2">Canceled</span>}
                    </td>
                    <td className="py-2 text-gray-600">{txn.payee_payer || '—'}</td>
                    <td className="py-2 text-gray-600">
                      {canEdit && !isCanceled ? (
                        <select
                          className="input py-1 text-sm min-w-[10rem]"
                          value={txn.category_id || ''}
                          onChange={(e) => handleCategoryChange(txn, e.target.value)}
                          title="Budget category"
                        >
                          <option value="">— Uncategorized —</option>
                          {categoriesForTxn(txn).map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      ) : (
                        txn.category_name || '—'
                      )}
                    </td>
                    <td className="py-2 text-gray-600">
                      {(() => {
                        const givelifyAuto = isGivelifyBankSettlement(txn);
                        if (givelifyAuto) {
                          return (
                            <span
                              className="inline-block text-xs font-medium bg-slate-100 text-slate-700 px-2 py-1 rounded"
                              title="Givelify bank deposit. Funds already counted when the giving file was imported."
                            >
                              Various
                            </span>
                          );
                        }
                        if (canEdit && !isCanceled) {
                          return (
                            <select
                              className="input py-1 text-sm min-w-[10rem]"
                              value={txn.fund_id || generalFundId || ''}
                              onChange={(e) => handleFundChange(txn, e.target.value)}
                              title={txn.type === 'income' ? 'Fund this deposit credits' : 'Fund this debit spends from'}
                            >
                              {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                          );
                        }
                        return txn.fund_name || (generalFundId ? 'General Fund' : '—');
                      })()}
                    </td>
                    <td className={`py-2 text-right font-medium ${txn.type === 'income' ? 'text-green-600' : 'text-red-600'} ${isCanceled ? 'line-through' : ''}`}>
                      {txn.type === 'income' ? '+' : '-'}{fmt(txn.amount)}
                    </td>
                    {canEdit && (
                      <td className="py-2 text-right whitespace-nowrap">
                        {!isCanceled && (
                          <>
                            <button
                              type="button"
                              className="text-xs text-blue-600 hover:text-blue-800 mr-3"
                              onClick={() => startEdit(txn)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-xs text-red-500 hover:text-red-700"
                              onClick={() => handleCancel(txn.id)}
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {transactions.length === 0 && (
                <tr><td colSpan="8" className="py-8 text-center text-gray-400">No transactions found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
