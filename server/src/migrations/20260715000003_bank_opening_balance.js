/**
 * Track opening (starting) balance separately from book balance.
 * Book balance is calculated as opening + bank-linked income - expenses.
 */
exports.up = async function (knex) {
  const hasOpening = await knex.schema.hasColumn('bank_accounts', 'opening_balance');
  if (!hasOpening) {
    await knex.schema.table('bank_accounts', (t) => {
      t.decimal('opening_balance', 14, 2).defaultTo(0);
      t.date('opening_balance_date');
    });
  }

  // Seed opening from whatever was stored as current_balance
  await knex('bank_accounts').update({
    opening_balance: knex.ref('current_balance'),
  });
};

exports.down = async function (knex) {
  const hasOpening = await knex.schema.hasColumn('bank_accounts', 'opening_balance');
  if (!hasOpening) return;
  await knex.schema.table('bank_accounts', (t) => {
    t.dropColumn('opening_balance');
    t.dropColumn('opening_balance_date');
  });
};
