import React, { useState, useEffect } from 'react';
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
  const [filters, setFilters] = useState({ type: '', start_date: '', end_date: '' });
  const [form, setForm] = useState({
    type: 'expense', amount: '', date: new Date().toISOString().slice(0, 10),
    description: '', payee_payer: '', check_number: '', category_id: '',
    bank_account_id: 1, fund_id: '', notes: '',
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
    bank_account_id: 1,
    fund_id: generalFundId ? String(generalFundId) : '',
    notes: '',
  });

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
      // Non-Givelify rows with no fund → assign General Fund (only Givelify stays untagged / Automatic)
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
      setTransactions(txns);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleFilter = () => loadData();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await transactionsAPI.create({
        ...form,
        amount: parseFloat(form.amount),
        category_id: form.category_id ? parseInt(form.category_id) : null,
        fund_id: form.fund_id ? parseInt(form.fund_id) : (generalFundId || null),
      });
      setShowForm(false);
      setForm(emptyForm());
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create transaction');
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

  const filteredCategories = categories.filter(c => !form.type || c.type === form.type);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Transactions</h2>
        {canEdit && (
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ New Transaction'}
          </button>
        )}
      </div>

      {showForm && (
        <div className="card mb-6">
          <h3 className="text-lg font-bold mb-4">Record New Transaction</h3>
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
                Defaults to General Fund. Givelify bank settlements are labeled Automatic and skip a fund so gifts aren’t double-counted.
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
                    <td className="py-2 text-gray-600">{txn.category_name || '—'}</td>
                    <td className="py-2 text-gray-600">
                      {(() => {
                        const givelifyAuto = isGivelifyBankSettlement(txn);
                        if (givelifyAuto) {
                          return (
                            <span
                              className="inline-block text-xs font-medium bg-slate-100 text-slate-700 px-2 py-1 rounded"
                              title="Givelify settlement via 5/3 BANKCARD — funds already counted on Givelify import"
                            >
                              Automatic
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
                      <td className="py-2 text-right">
                        {!isCanceled && (
                          <button
                            type="button"
                            className="text-xs text-red-500 hover:text-red-700"
                            onClick={() => handleCancel(txn.id)}
                          >
                            Cancel
                          </button>
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
