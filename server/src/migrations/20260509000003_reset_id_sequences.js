const tables = [
  'users',
  'bank_accounts',
  'funds',
  'categories',
  'transactions',
  'budgets',
  'fund_transactions',
  'audit_log',
  'monthly_reports',
  'givelify_contributions',
  'data_backups',
  'app_settings',
  'tenants',
  'recurring_transfers',
  'mfa_codes',
  'bank_imports',
  'password_reset_tokens',
];

exports.up = async function (knex) {
  for (const table of tables) {
    const exists = await knex.schema.hasTable(table);
    if (!exists) continue;

    await knex.raw(`
      SELECT setval(
        pg_get_serial_sequence(?, 'id'),
        GREATEST((SELECT COALESCE(MAX(id), 0) + 1 FROM ??), 1),
        false
      )
    `, [table, table]);
  }
};

exports.down = async function () {};