/**
 * Add account_type column to bank_accounts.
 * Supports: checking, savings, investment, cash, other
 *
 * Guard against re-running on a DB that already has the column (e.g. the
 * column was included in the initial schema before this migration existed).
 */
exports.up = async function (knex) {
  const exists = await knex.schema.hasColumn('bank_accounts', 'account_type');
  if (exists) return;
  return knex.schema.table('bank_accounts', (t) => {
    t.string('account_type').defaultTo('checking');
  });
};

exports.down = async function (knex) {
  const exists = await knex.schema.hasColumn('bank_accounts', 'account_type');
  if (!exists) return;
  return knex.schema.table('bank_accounts', (t) => {
    t.dropColumn('account_type');
  });
};
