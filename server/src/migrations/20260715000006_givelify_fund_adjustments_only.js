/**
 * Convert legacy Givelify soft transactions (cashless income/fee rows) into
 * fund-ledger-only history. Fund balances are left unchanged.
 */
exports.up = async function (knex) {
  const hasTxn = await knex.schema.hasTable('transactions');
  if (!hasTxn) return;

  const soft = await knex('transactions')
    .whereNull('bank_account_id')
    .andWhere((q) => {
      q.where('payee_payer', 'Givelify').orWhere('description', 'ilike', 'Givelify%');
    })
    .select('id');

  const ids = soft.map((r) => r.id);
  if (!ids.length) return;

  if (await knex.schema.hasTable('fund_transactions')) {
    await knex('fund_transactions').whereIn('transaction_id', ids).update({ transaction_id: null });
  }
  if (await knex.schema.hasTable('givelify_contributions')) {
    await knex('givelify_contributions').whereIn('transaction_id', ids).update({ transaction_id: null });
  }
  await knex('transactions').whereIn('id', ids).del();
};

exports.down = async function () {
  // Irreversible cleanup
};
