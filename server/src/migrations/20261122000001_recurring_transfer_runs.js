/**
 * Track each posted recurring transfer so the daily job cannot post the same
 * date twice. Missed dates are not backfilled; this only guards the date that
 * actually runs.
 */
exports.up = async function up(knex) {
  const hasError = await knex.schema.hasColumn('recurring_transfers', 'last_error');
  if (!hasError) {
    await knex.schema.alterTable('recurring_transfers', (t) => {
      t.text('last_error');
      t.timestamp('last_attempt_at');
    });
  }

  const hasRuns = await knex.schema.hasTable('recurring_transfer_runs');
  if (!hasRuns) {
    await knex.schema.createTable('recurring_transfer_runs', (t) => {
      t.increments('id').primary();
      t.integer('recurring_transfer_id').unsigned().notNullable()
        .references('id').inTable('recurring_transfers');
      t.integer('tenant_id').unsigned().notNullable();
      t.date('period_date').notNullable();
      t.string('status').notNullable();
      t.decimal('amount', 14, 2).notNullable();
      t.integer('from_fund_id').unsigned();
      t.integer('to_fund_id').unsigned();
      t.string('description');
      t.timestamps(true, true);
      t.unique(['recurring_transfer_id', 'period_date']);
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('recurring_transfer_runs');
  const hasError = await knex.schema.hasColumn('recurring_transfers', 'last_error');
  if (hasError) {
    await knex.schema.alterTable('recurring_transfers', (t) => {
      t.dropColumn('last_error');
      t.dropColumn('last_attempt_at');
    });
  }
};
