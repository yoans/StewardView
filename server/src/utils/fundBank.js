const db = require('../models/db');

async function getGeneralFund(tenantId, trx = db) {
  return trx('funds').where({ name: 'General Fund', is_active: true, tenant_id: tenantId }).first();
}

function fundBalanceDelta(type, amount) {
  const n = parseFloat(amount) || 0;
  return type === 'income' ? n : -n;
}

/**
 * Apply a cleared transaction to a fund ledger + balance.
 * Income increases the fund; expense (debit) decreases it.
 */
async function applyFundMovement({
  fundId,
  transactionId,
  type,
  amount,
  date,
  description,
  payeePayer,
  userId,
  tenantId,
  trx = db,
}) {
  if (!fundId) return;
  const fundType = type === 'income' ? 'contribution' : 'disbursement';
  await trx('fund_transactions').insert({
    fund_id: fundId,
    transaction_id: transactionId || null,
    type: fundType,
    amount,
    date,
    description,
    donor_name: payeePayer || null,
    created_by: userId,
    tenant_id: tenantId,
  });
  await trx('funds')
    .where({ id: fundId, tenant_id: tenantId })
    .increment('current_balance', fundBalanceDelta(type, amount));
}

/**
 * Fund-ledger adjustment with no cash/bank transaction row.
 * Used for Givelify gifts (contribution) and fees (disbursement from General Fund).
 */
async function postFundAdjustment({
  fundId,
  fundTxnType,
  amount,
  date,
  description,
  userId,
  tenantId,
  balanceDelta,
  trx = db,
}) {
  const [row] = await trx('fund_transactions').insert({
    fund_id: fundId,
    transaction_id: null,
    type: fundTxnType,
    amount,
    date,
    description,
    donor_name: null,
    created_by: userId,
    tenant_id: tenantId,
  }).returning('id');

  await trx('funds')
    .where({ id: fundId, tenant_id: tenantId })
    .increment('current_balance', balanceDelta);

  return row.id;
}

/**
 * Undo a transaction's effect on its fund (e.g. cancel / reassign).
 */
async function reverseFundMovement({
  fundId,
  type,
  amount,
  tenantId,
  transactionId = null,
  trx = db,
}) {
  if (!fundId) return;
  await trx('funds')
    .where({ id: fundId, tenant_id: tenantId })
    .increment('current_balance', -fundBalanceDelta(type, amount));
  if (transactionId) {
    await trx('fund_transactions')
      .where({ transaction_id: transactionId, tenant_id: tenantId })
      .del();
  }
}

/**
 * Resolve fund for an expense/debit. Defaults to General Fund.
 * Returns fund id or throws if none available.
 */
async function resolveExpenseFundId(tenantId, fundId, trx = db) {
  if (fundId) {
    const fund = await trx('funds').where({ id: fundId, is_active: true, tenant_id: tenantId }).first();
    if (!fund) throw new Error('Fund not found');
    return fund.id;
  }
  const general = await getGeneralFund(tenantId, trx);
  if (!general) throw new Error('General Fund is required for expenses (debits)');
  return general.id;
}

function roundMoney(n) {
  return Math.round((parseFloat(n) || 0) * 100) / 100;
}

/**
 * Compare sum of active fund balances to checking account book balance(s).
 * accounts should already include calculated_balance when available.
 */
function buildFundsBankReconciliation(funds, bankAccounts) {
  const total_funds = roundMoney(
    (funds || []).reduce((s, f) => s + (parseFloat(f.current_balance) || 0), 0)
  );

  const checking = (bankAccounts || []).filter((a) => {
    const t = String(a.account_type || 'checking').toLowerCase();
    return t === 'checking' || !a.account_type;
  });
  const checkingAccounts = checking.length ? checking : (bankAccounts || []);

  const checking_balance = roundMoney(
    checkingAccounts.reduce(
      (s, a) => s + (parseFloat(a.calculated_balance != null ? a.calculated_balance : a.current_balance) || 0),
      0
    )
  );

  const difference = roundMoney(total_funds - checking_balance);
  const balanced = Math.abs(difference) < 0.005;

  return {
    total_funds,
    checking_balance,
    difference,
    balanced,
    note: balanced
      ? 'Fund totals match checking book balance.'
      : 'Fund totals should equal the checking book balance. Pending Givelify deposits (gifts already on funds), missing fees, unassigned expenses, or starting-balance misalignment are common causes.',
  };
}

module.exports = {
  getGeneralFund,
  applyFundMovement,
  postFundAdjustment,
  reverseFundMovement,
  resolveExpenseFundId,
  buildFundsBankReconciliation,
  roundMoney,
  fundBalanceDelta,
};
