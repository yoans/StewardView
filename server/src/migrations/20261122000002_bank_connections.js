/**
 * Optional SimpleFIN Bridge connection. The access URL is encrypted.
 * StewardView never stores the church's bank password.
 */
exports.up = async function up(knex) {
  const hasConnections = await knex.schema.hasTable('bank_connections');
  if (!hasConnections) {
    await knex.schema.createTable('bank_connections', (t) => {
      t.increments('id').primary();
      t.integer('tenant_id').unsigned().notNullable();
      t.string('provider').notNullable().defaultTo('simplefin');
      t.text('access_token_encrypted').notNullable();
      t.text('discovered_accounts');
      t.timestamp('last_sync_at');
      t.string('last_sync_status');
      t.text('last_sync_error');
      t.integer('created_by').unsigned().references('id').inTable('users');
      t.timestamps(true, true);
    });
  }

  const hasExternal = await knex.schema.hasColumn('bank_accounts', 'external_account_id');
  if (!hasExternal) {
    await knex.schema.alterTable('bank_accounts', (t) => {
      t.integer('connection_id').unsigned().references('id').inTable('bank_connections').onDelete('SET NULL');
      t.string('external_account_id');
      t.decimal('reported_balance', 14, 2);
      t.timestamp('reported_balance_at');
    });
  }

  const hasTxnExternal = await knex.schema.hasColumn('transactions', 'external_id');
  if (!hasTxnExternal) {
    await knex.schema.alterTable('transactions', (t) => {
      t.text('external_id');
      t.string('import_source');
    });
    await knex.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS transactions_external_id_unique
      ON transactions (tenant_id, bank_account_id, external_id)
      WHERE external_id IS NOT NULL
    `);
  }
};

exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS transactions_external_id_unique');
  const hasTxnExternal = await knex.schema.hasColumn('transactions', 'external_id');
  if (hasTxnExternal) {
    await knex.schema.alterTable('transactions', (t) => {
      t.dropColumn('external_id');
      t.dropColumn('import_source');
    });
  }
  const hasExternal = await knex.schema.hasColumn('bank_accounts', 'external_account_id');
  if (hasExternal) {
    await knex.schema.alterTable('bank_accounts', (t) => {
      t.dropColumn('reported_balance_at');
      t.dropColumn('reported_balance');
      t.dropColumn('external_account_id');
      t.dropColumn('connection_id');
    });
  }
  await knex.schema.dropTableIfExists('bank_connections');
};
