/**
 * Add account_type column to bank_accounts.
 * Supports: checking, savings, investment, cash, other
 */
exports.up = function (knex) {
  return knex.schema.table('bank_accounts', (t) => {
    t.string('account_type').defaultTo('checking');
  });
};

exports.down = function (knex) {
  return knex.schema.table('bank_accounts', (t) => {
    t.dropColumn('account_type');
  });
};
