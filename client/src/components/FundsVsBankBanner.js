import React from 'react';

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/**
 * Shows whether sum of fund balances matches checking book balance.
 */
export default function FundsVsBankBanner({ recon, className = 'mb-6' }) {
  if (!recon) return null;

  const ok = !!recon.balanced;
  const border = ok ? 'border-green-200 bg-green-50 text-green-900' : 'border-red-200 bg-red-50 text-red-900';
  const title = ok
    ? 'Funds match checking'
    : 'Funds and checking are out of balance';

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${border} ${className}`}>
      <p className="font-medium mb-1">{title}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span>All funds: <strong>{fmt(recon.total_funds)}</strong></span>
        <span>Checking book: <strong>{fmt(recon.checking_balance)}</strong></span>
        <span>Difference: <strong>{fmt(recon.difference)}</strong></span>
      </div>
      <p className={`mt-2 text-xs ${ok ? 'text-green-800' : 'text-red-800'}`}>
        {recon.note ||
          (ok
            ? 'Fund totals match checking book balance.'
            : 'Fund totals should equal the checking book balance. Pending Givelify deposits, expenses not on General Fund, or starting-balance misalignment are common causes.')}
      </p>
    </div>
  );
}
