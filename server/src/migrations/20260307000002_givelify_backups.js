/**
 * Add Givelify integration table, data_backups table, and signup_enabled setting.
 */
exports.up = function (knex) {
  return knex.schema
    // ── Givelify Contributions ──────────────────────────────
    .createTable('givelify_contributions', (t) => {
      t.increments('id').primary();
      t.string('givelify_id').unique(); // external Givelify transaction ID
      t.string('donor_name');
      t.string('donor_email');
      t.decimal('amount', 14, 2).notNullable();
      t.date('date').notNullable();
      t.string('envelope'); // Givelify envelope / category label
      t.string('fund_mapping'); // which local fund this maps to
      t.integer('fund_id').unsigned().references('id').inTable('funds');
      t.integer('transaction_id').unsigned().references('id').inTable('transactions');
      t.string('status').defaultTo('pending'); // 'pending', 'matched', 'imported'
      t.text('raw_data'); // full JSON from CSV/API row
      t.timestamps(true, true);
    })

    // ── Data Backups ────────────────────────────────────────
    .createTable('data_backups', (t) => {
      t.increments('id').primary();
      t.string('backup_type').notNullable(); // 'scheduled', 'manual', 'pre-deploy'
      t.string('status').notNullable().defaultTo('pending'); // 'pending', 'success', 'failed'
      t.text('tables_included'); // JSON array of table names
      t.integer('row_count').defaultTo(0);
      t.text('backup_data'); // JSON dump (for PG, we can also use pg_dump reference)
      t.string('file_path'); // optional external file reference
      t.text('error_message');
      t.integer('created_by').unsigned().references('id').inTable('users');
      t.timestamp('created_at').defaultTo(knex.fn.now());
    })

    // ── App Settings ────────────────────────────────────────
    .createTable('app_settings', (t) => {
      t.increments('id').primary();
      t.string('key').notNullable().unique();
      t.text('value');
      t.timestamps(true, true);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('app_settings')
    .dropTableIfExists('data_backups')
    .dropTableIfExists('givelify_contributions');
};
