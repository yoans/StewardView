exports.up = async function (knex) {
  const hasBankAccounts = await knex.schema.hasTable('bank_accounts');
  if (hasBankAccounts) {
    const hasPlaidAccountId = await knex.schema.hasColumn('bank_accounts', 'plaid_account_id');
    const hasPlaidAccessToken = await knex.schema.hasColumn('bank_accounts', 'plaid_access_token');

    if (hasPlaidAccountId || hasPlaidAccessToken) {
      await knex.schema.table('bank_accounts', (t) => {
        if (hasPlaidAccountId) t.dropColumn('plaid_account_id');
        if (hasPlaidAccessToken) t.dropColumn('plaid_access_token');
      });
    }
  }

  await knex.schema.dropTableIfExists('bank_sync_log');
};

exports.down = async function (knex) {
  const hasBankAccounts = await knex.schema.hasTable('bank_accounts');
  if (hasBankAccounts) {
    const hasPlaidAccountId = await knex.schema.hasColumn('bank_accounts', 'plaid_account_id');
    const hasPlaidAccessToken = await knex.schema.hasColumn('bank_accounts', 'plaid_access_token');

    if (!hasPlaidAccountId || !hasPlaidAccessToken) {
      await knex.schema.table('bank_accounts', (t) => {
        if (!hasPlaidAccountId) t.string('plaid_account_id');
        if (!hasPlaidAccessToken) t.string('plaid_access_token');
      });
    }
  }

  const hasBankSyncLog = await knex.schema.hasTable('bank_sync_log');
  if (!hasBankSyncLog) {
    await knex.schema.createTable('bank_sync_log', (t) => {
      t.increments('id').primary();
      t.integer('bank_account_id').unsigned().references('id').inTable('bank_accounts');
      t.string('status').notNullable();
      t.integer('transactions_synced').defaultTo(0);
      t.text('error_message');
      t.timestamp('synced_at').defaultTo(knex.fn.now());
      t.integer('tenant_id').unsigned().defaultTo(1);
    });
  }
};