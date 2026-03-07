import React, { useState, useEffect } from 'react';
import { transactionsAPI, categoriesAPI, fundsAPI } from '../services/api';

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function TransactionsPage({ user }) {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [funds, setFunds] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({ type: '', start_date: '', end_date: '' });
  const [form, setForm] = useState({
    type: 'income', amount: '', date: new Date().toISOString().slice(0, 10),
    description: '', payee_payer: '', check_number: '', category_id: '',
    bank_account_id: 1, fund_id: '', notes: '',
  });
  const [loading, setLoading] = useState(true);
  const canEdit = ['admin', 'treasurer', 'finance_committee'].includes(user.role);

  const loadData = async () => {
    setLoading(true);
    try {
      const [txnRes, catRes, fundRes] = await Promise.all([
        transactionsAPI.list(filters),
        categoriesAPI.list(),
        fundsAPI.list(),
      ]);
      setTransactions(txnRes.data);
      setCategories(catRes.data);
      setFunds(fundRes.data);
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
        fund_id: form.fund_id ? parseInt(form.fund_id) : null,
      });
      setShowForm(false);
      setForm({ type: 'income', amount: '', date: new Date().toISOString().slice(0, 10), description: '', payee_payer: '', check_number: '', category_id: '', bank_account_id: 1, fund_id: '', notes: '' });
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create transaction');
    }
  };

  const handleVoid = async (id) => {
    if (!window.confirm('Are you sure you want to void this transaction?')) return;
    const reason = prompt('Reason for voiding:');
    try {
      await transactionsAPI.void(id, reason);
      loadData();
    } catch (err) { alert('Failed to void transaction'); }
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

      {/* New Transaction Form */}
      {showForm && (
        <div className="card mb-6">
          <h3 className="text-lg font-bold mb-4">Record New Transaction</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.type} onChange={e => setForm({...form, type: e.target.value, category_id: ''})}>
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
              <label className="label">Direct to Fund (Earmark)</label>
              <select className="input" value={form.fund_id} onChange={e => setForm({...form, fund_id: e.target.value})}>
                <option value="">— General —</option>
                {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
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

      {/* Filters */}
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

      {/* Transaction Table */}
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
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right">Amount</th>
                {canEdit && <th className="pb-2"></th>}
              </tr>
            </thead>
            <tbody>
              {transactions.map(txn => (
                <tr key={txn.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2 text-gray-600">{txn.date}</td>
                  <td className="py-2 text-xs text-gray-400 font-mono">{txn.ref_number?.slice(0, 8)}</td>
                  <td className="py-2 font-medium text-gray-900">{txn.description}</td>
                  <td className="py-2 text-gray-600">{txn.payee_payer || '—'}</td>
                  <td className="py-2 text-gray-600">{txn.category_name || '—'}</td>
                  <td className="py-2 text-gray-600">{txn.fund_name || '—'}</td>
                  <td className="py-2"><span className={`badge-${txn.status}`}>{txn.status}</span></td>
                  <td className={`py-2 text-right font-medium ${txn.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                    {txn.type === 'income' ? '+' : '-'}{fmt(txn.amount)}
                  </td>
                  {canEdit && (
                    <td className="py-2">
                      {txn.status !== 'void' && (
                        <button className="text-xs text-red-500 hover:text-red-700" onClick={() => handleVoid(txn.id)}>Void</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr><td colSpan="9" className="py-8 text-center text-gray-400">No transactions found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
