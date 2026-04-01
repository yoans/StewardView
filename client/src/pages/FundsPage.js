import React, { useState, useEffect } from 'react';
import { fundsAPI } from '../services/api';

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function FundsPage({ user }) {
  const [funds, setFunds] = useState([]);
  const [selectedFund, setSelectedFund] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [recurringTransfers, setRecurringTransfers] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', target_amount: '', is_restricted: true });
  const [transferForm, setTransferForm] = useState({ to_fund_id: '', amount: '', description: '' });
  const [adjustForm, setAdjustForm] = useState({ type: 'increase', amount: '', description: '' });
  const [recurringForm, setRecurringForm] = useState({ from_fund_id: '', to_fund_id: '', amount: '', description: '', frequency: 'monthly', day_of_month: 1 });
  const canEdit = ['admin', 'treasurer'].includes(user.role);

  const loadFunds = async () => {
    const res = await fundsAPI.list();
    setFunds(res.data);
  };

  const loadRecurring = async () => {
    try {
      const res = await fundsAPI.recurringList();
      setRecurringTransfers(res.data);
    } catch { /* table may not exist yet */ }
  };

  useEffect(() => { loadFunds(); loadRecurring(); }, []);

  const selectFund = async (id) => {
    const res = await fundsAPI.get(id);
    setSelectedFund(res.data);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await fundsAPI.create({ ...form, target_amount: form.target_amount ? parseFloat(form.target_amount) : null });
      setShowCreate(false);
      setForm({ name: '', description: '', target_amount: '', is_restricted: true });
      loadFunds();
    } catch (err) { alert(err.response?.data?.error || 'Failed to create fund'); }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    try {
      await fundsAPI.transfer(selectedFund.id, {
        to_fund_id: parseInt(transferForm.to_fund_id),
        amount: parseFloat(transferForm.amount),
        description: transferForm.description,
      });
      setShowTransfer(false);
      setTransferForm({ to_fund_id: '', amount: '', description: '' });
      loadFunds();
      selectFund(selectedFund.id);
    } catch (err) { alert(err.response?.data?.error || 'Transfer failed'); }
  };

  const handleAdjust = async (e) => {
    e.preventDefault();
    try {
      await fundsAPI.adjust(selectedFund.id, {
        type: adjustForm.type,
        amount: parseFloat(adjustForm.amount),
        description: adjustForm.description,
      });
      setShowAdjust(false);
      setAdjustForm({ type: 'increase', amount: '', description: '' });
      loadFunds();
      selectFund(selectedFund.id);
    } catch (err) { alert(err.response?.data?.error || 'Adjustment failed'); }
  };

  const handleCreateRecurring = async (e) => {
    e.preventDefault();
    try {
      await fundsAPI.recurringCreate({
        ...recurringForm,
        from_fund_id: parseInt(recurringForm.from_fund_id),
        to_fund_id: parseInt(recurringForm.to_fund_id),
        amount: parseFloat(recurringForm.amount),
        day_of_month: parseInt(recurringForm.day_of_month),
      });
      setRecurringForm({ from_fund_id: '', to_fund_id: '', amount: '', description: '', frequency: 'monthly', day_of_month: 1 });
      loadRecurring();
    } catch (err) { alert(err.response?.data?.error || 'Failed to create recurring transfer'); }
  };

  const handleDeleteRecurring = async (id) => {
    if (!window.confirm('Deactivate this recurring transfer?')) return;
    try {
      await fundsAPI.recurringDelete(id);
      loadRecurring();
    } catch (err) { alert(err.response?.data?.error || 'Failed to deactivate'); }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Earmarked Funds</h2>
        <div className="flex space-x-2">
          {canEdit && (
            <>
              <button className="btn-secondary text-sm" onClick={() => setShowRecurring(!showRecurring)}>
                {showRecurring ? 'Hide Recurring' : 'Recurring Transfers'}
              </button>
              <button className="btn-primary" onClick={() => setShowCreate(!showCreate)}>
                {showCreate ? 'Cancel' : '+ New Fund'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Create Fund Form */}
      {showCreate && (
        <div className="card mb-6">
          <h3 className="text-lg font-bold mb-4">Create New Earmarked Fund</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Fund Name</label>
              <input type="text" className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
            </div>
            <div>
              <label className="label">Target Amount (optional)</label>
              <input type="number" step="0.01" className="input" value={form.target_amount} onChange={e => setForm({...form, target_amount: e.target.value})} />
            </div>
            <div>
              <label className="label">Description</label>
              <input type="text" className="input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
            </div>
            <div className="flex items-center space-x-2 pt-6">
              <input type="checkbox" checked={form.is_restricted} onChange={e => setForm({...form, is_restricted: e.target.checked})} />
              <label className="text-sm text-gray-700">Donor-Restricted Fund</label>
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn-primary">Create Fund</button>
            </div>
          </form>
        </div>
      )}

      {/* Recurring Transfers Section */}
      {showRecurring && canEdit && (
        <div className="card mb-6">
          <h3 className="text-lg font-bold mb-4">Recurring Fund Transfers</h3>
          <p className="text-sm text-gray-500 mb-4">Set up automatic monthly or weekly transfers between funds. Transfers run daily at 7 AM when due.</p>

          <form onSubmit={handleCreateRecurring} className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
            <div>
              <label className="label">From Fund</label>
              <select className="input" value={recurringForm.from_fund_id} onChange={e => setRecurringForm({...recurringForm, from_fund_id: e.target.value})} required>
                <option value="">Select...</option>
                {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">To Fund</label>
              <select className="input" value={recurringForm.to_fund_id} onChange={e => setRecurringForm({...recurringForm, to_fund_id: e.target.value})} required>
                <option value="">Select...</option>
                {funds.filter(f => String(f.id) !== recurringForm.from_fund_id).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Amount</label>
              <input type="number" step="0.01" min="0.01" className="input" value={recurringForm.amount} onChange={e => setRecurringForm({...recurringForm, amount: e.target.value})} required />
            </div>
            <div>
              <label className="label">Day of Month</label>
              <input type="number" min="1" max="28" className="input" value={recurringForm.day_of_month} onChange={e => setRecurringForm({...recurringForm, day_of_month: e.target.value})} />
            </div>
            <div>
              <label className="label">Description</label>
              <input type="text" className="input" value={recurringForm.description} onChange={e => setRecurringForm({...recurringForm, description: e.target.value})} placeholder="e.g. Building maintenance" />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn-primary whitespace-nowrap">+ Add</button>
            </div>
          </form>

          {recurringTransfers.filter(rt => rt.is_active).length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2">From</th>
                  <th className="pb-2">To</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Frequency</th>
                  <th className="pb-2">Next Run</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {recurringTransfers.filter(rt => rt.is_active).map(rt => (
                  <tr key={rt.id} className="border-b last:border-0">
                    <td className="py-2">{rt.from_fund_name}</td>
                    <td className="py-2">{rt.to_fund_name}</td>
                    <td className="py-2 font-medium">{fmt(rt.amount)}</td>
                    <td className="py-2 text-gray-600">{rt.frequency} (day {rt.day_of_month || rt.day_of_week})</td>
                    <td className="py-2 text-gray-600">{rt.next_run_date}</td>
                    <td className="py-2">
                      <button onClick={() => handleDeleteRecurring(rt.id)} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-400">No recurring transfers set up yet.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fund List */}
        <div className="lg:col-span-1 space-y-3">
          {funds.map(fund => (
            <div
              key={fund.id}
              onClick={() => selectFund(fund.id)}
              className={`card cursor-pointer transition-all hover:shadow-lg ${selectedFund?.id === fund.id ? 'ring-2 ring-blue-500' : ''}`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-gray-900">{fund.name}</h4>
                  <p className="text-xs text-gray-500">{fund.description}</p>
                  {fund.is_restricted && (
                    <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded mt-1 inline-block">Restricted</span>
                  )}
                </div>
                <p className="text-lg font-bold text-green-700">{fmt(fund.current_balance)}</p>
              </div>
              {fund.target_amount && (
                <div className="mt-3">
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${Math.min(100, fund.current_balance / fund.target_amount * 100)}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{fmt(fund.current_balance)} / {fmt(fund.target_amount)}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Fund Detail */}
        <div className="lg:col-span-2">
          {selectedFund ? (
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900">{selectedFund.name}</h3>
                {canEdit && (
                  <div className="flex space-x-2">
                    <button className="btn-secondary text-sm" onClick={() => { setShowAdjust(!showAdjust); setShowTransfer(false); }}>
                      Adjust Balance
                    </button>
                    <button className="btn-secondary text-sm" onClick={() => { setShowTransfer(!showTransfer); setShowAdjust(false); }}>
                      Transfer Funds
                    </button>
                  </div>
                )}
              </div>

              {/* Transfer Form */}
              {showTransfer && (
                <form onSubmit={handleTransfer} className="bg-yellow-50 p-4 rounded-lg mb-4">
                  <h4 className="font-medium mb-3">Transfer from {selectedFund.name}</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="label">To Fund</label>
                      <select className="input" value={transferForm.to_fund_id} onChange={e => setTransferForm({...transferForm, to_fund_id: e.target.value})} required>
                        <option value="">Select fund...</option>
                        {funds.filter(f => f.id !== selectedFund.id).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Amount</label>
                      <input type="number" step="0.01" className="input" value={transferForm.amount} onChange={e => setTransferForm({...transferForm, amount: e.target.value})} required />
                    </div>
                    <div className="flex items-end">
                      <button type="submit" className="btn-primary">Transfer</button>
                    </div>
                  </div>
                </form>
              )}

              {/* Adjust Balance Form */}
              {showAdjust && (
                <form onSubmit={handleAdjust} className="bg-blue-50 p-4 rounded-lg mb-4">
                  <h4 className="font-medium mb-3">Adjust {selectedFund.name} Balance</h4>
                  <p className="text-xs text-gray-500 mb-3">Use this to correct balances, set opening amounts, or reclassify funds.</p>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="label">Type</label>
                      <select className="input" value={adjustForm.type} onChange={e => setAdjustForm({...adjustForm, type: e.target.value})}>
                        <option value="increase">Increase</option>
                        <option value="decrease">Decrease</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Amount</label>
                      <input type="number" step="0.01" min="0.01" className="input" value={adjustForm.amount} onChange={e => setAdjustForm({...adjustForm, amount: e.target.value})} required />
                    </div>
                    <div>
                      <label className="label">Reason</label>
                      <input type="text" className="input" value={adjustForm.description} onChange={e => setAdjustForm({...adjustForm, description: e.target.value})} placeholder="e.g. Opening balance" />
                    </div>
                    <div className="flex items-end">
                      <button type="submit" className="btn-primary">Apply</button>
                    </div>
                  </div>
                </form>
              )}

              <p className="text-gray-600 mb-2">{selectedFund.description}</p>
              <p className="text-2xl font-bold text-green-700 mb-6">{fmt(selectedFund.current_balance)}</p>

              <h4 className="font-bold text-gray-900 mb-3">Transaction History</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Type</th>
                      <th className="pb-2">Description</th>
                      <th className="pb-2">Donor</th>
                      <th className="pb-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedFund.recent_activity || []).map(txn => {
                      const isPositive = ['contribution', 'transfer_in', 'adjustment_in'].includes(txn.type);
                      return (
                        <tr key={txn.id} className="border-b last:border-0">
                          <td className="py-2 text-gray-600">{txn.date}</td>
                          <td className="py-2">
                            <span className={isPositive ? 'badge-income' : 'badge-expense'}>
                              {txn.type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-2 text-gray-900">{txn.description}</td>
                          <td className="py-2 text-gray-600">{txn.donor_name || '\u2014'}</td>
                          <td className={`py-2 text-right font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            {isPositive ? '+' : '-'}{fmt(txn.amount)}
                          </td>
                        </tr>
                      );
                    })}
                    {(!selectedFund.recent_activity || selectedFund.recent_activity.length === 0) && (
                      <tr><td colSpan="5" className="py-4 text-center text-gray-400">No activity yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="card text-center py-12 text-gray-400">
              Select a fund to view details and history
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
