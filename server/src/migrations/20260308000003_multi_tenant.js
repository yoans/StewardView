/**
 * Multi-tenant: tenants table + tenant_id on all data tables.
 * Existing data is migrated to a default "Legacy" tenant (id = 1).
 *
 * NOTE: We use plain integer columns (no FK references) when altering existing
 * tables because SQLite requires a full table rebuild to add FKs to existing
 * columns, which fails when other tables reference them via FK.
 */
exports.up = async function (knex) {
  // ── 1. Create tenants table ─────────────────────────────
  await knex.schema.createTable('tenants', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable();
    t.string('slug').notNullable().unique();
    t.string('status').defaultTo('active');
    t.string('plan').defaultTo('free');
    t.decimal('plan_amount', 10, 2).defaultTo(0);
    t.string('stripe_customer_id');
    t.string('stripe_subscription_id');
    t.string('admin_email').notNullable();
    t.string('primary_color').defaultTo('#1e3a8a');
    t.string('accent_color').defaultTo('#c7a10e');
    t.string('logo_url');
    t.text('notes');
    t.timestamp('trial_ends_at');
    t.timestamp('suspended_at');
    t.timestamps(true, true);
  });

  // ── 2. Insert default tenant for existing data ──────────
  await knex('tenants').insert({
    id: 1,
    name: process.env.ORG_NAME || 'My Church', // tenant name set via ORG_NAME env var
    slug: 'default',
    status: 'active',
    plan: 'free',
    admin_email: 'admin@church.local',
  });

  // ── 3. Add tenant_id to ALL data tables as a plain integer (no FK reference)
  //       SQLite cannot add FK-constrained columns to existing tables without
  //       a full table rebuild, which would fail due to existing FK relationships.
  const allDataTables = [
    'users', 'bank_accounts', 'funds', 'categories', 'transactions', 'budgets',
    'fund_transactions', 'audit_log', 'bank_sync_log', 'monthly_reports',
    'data_backups', 'app_settings', 'givelify_contributions',
  ];

  for (const table of allDataTables) {
    const exists = await knex.schema.hasTable(table);
    if (!exists) continue;
    const hasTenantId = await knex.schema.hasColumn(table, 'tenant_id');
    if (!hasTenantId) {
      await knex.schema.table(table, (t) => {
        t.integer('tenant_id').unsigned().defaultTo(1);
      });
      await knex(table).update({ tenant_id: 1 });
    }
  }
};

exports.down = async function (knex) {
  const allTables = [
    'users', 'bank_accounts', 'funds', 'categories', 'transactions', 'budgets',
    'fund_transactions', 'audit_log', 'bank_sync_log', 'monthly_reports',
    'data_backups', 'app_settings', 'givelify_contributions',
  ];
  for (const table of allTables) {
    const exists = await knex.schema.hasTable(table);
    if (exists) {
      const has = await knex.schema.hasColumn(table, 'tenant_id');
      if (has) await knex.schema.table(table, t => t.dropColumn('tenant_id'));
    }
  }
  await knex.schema.dropTableIfExists('tenants');
};

