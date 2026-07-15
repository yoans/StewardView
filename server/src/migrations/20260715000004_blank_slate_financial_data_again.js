/**
 * Blank-slate financial data again while keeping tenants, users, categories,
 * funds structure, bank accounts structure, and app settings.
 *
 * Clears transactions, budgets, givelify imports, reports, fund activity,
 * recurring transfers, backups, and audit history. Resets balances to zero.
 */
exports.up = async function (knex) {
  const has = async (table) => knex.schema.hasTable(table);
  const del = async (table) => {
    if (await has(table)) await knex(table).del();
  };

  // Child / dependent tables first
  await del('monthly_reports');
  await del('audit_log');
  await del('data_backups');
  await del('bank_sync_log');
  await del('recurring_transfers');
  await del('fund_transactions');
  await del('givelify_contributions');
  await del('transactions');
  await del('budgets');

  if (await has('funds')) {
    await knex('funds').update({ current_balance: 0 });
  }

  if (await has('bank_accounts')) {
    const updates = {
      current_balance: 0,
      available_balance: 0,
      balance_last_updated: knex.fn.now(),
    };
    if (await knex.schema.hasColumn('bank_accounts', 'opening_balance')) {
      updates.opening_balance = 0;
    }
    await knex('bank_accounts').update(updates);
  }
};

exports.down = async function () {
  // Irreversible data wipe
};
