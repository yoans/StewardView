/**
 * Recurring fund transfers — scheduled monthly/weekly transfers between funds
 */
exports.up = function (knex) {
  return knex.schema.createTable('recurring_transfers', (t) => {
    t.increments('id').primary();
    t.integer('from_fund_id').unsigned().notNullable().references('id').inTable('funds');
    t.integer('to_fund_id').unsigned().notNullable().references('id').inTable('funds');
    t.decimal('amount', 14, 2).notNullable();
    t.string('description');
    t.string('frequency').notNullable().defaultTo('monthly'); // 'monthly', 'weekly'
    t.integer('day_of_month'); // 1-28 for monthly
    t.integer('day_of_week'); // 0-6 for weekly (0=Sunday)
    t.date('next_run_date').notNullable();
    t.date('last_run_date');
    t.boolean('is_active').defaultTo(true);
    t.integer('tenant_id').unsigned().notNullable();
    t.integer('created_by').unsigned().references('id').inTable('users');
    t.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('recurring_transfers');
};
