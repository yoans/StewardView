/**
 * Store budget category mapping on Givelify contributions (funds-only posting).
 */
exports.up = async function (knex) {
  const hasIncome = await knex.schema.hasColumn('givelify_contributions', 'income_category_id');
  if (!hasIncome) {
    await knex.schema.table('givelify_contributions', (t) => {
      t.integer('income_category_id').unsigned().references('id').inTable('categories');
      t.integer('fee_category_id').unsigned().references('id').inTable('categories');
    });
  }

  // Backfill income category for already-imported gifts so budget actuals keep working
  const rows = await knex('givelify_contributions')
    .leftJoin('funds', 'givelify_contributions.fund_id', 'funds.id')
    .where('givelify_contributions.status', 'imported')
    .whereNull('givelify_contributions.income_category_id')
    .select(
      'givelify_contributions.id',
      'givelify_contributions.tenant_id',
      'funds.name as fund_name',
      'funds.is_restricted'
    );

  for (const row of rows) {
    const preferred = !row.fund_name || row.fund_name === 'General Fund' || row.is_restricted === false || row.is_restricted === 0
      ? 'Tithes & Offerings'
      : 'Directed Contributions';
    let cat = await knex('categories')
      .where({ name: preferred, type: 'income', tenant_id: row.tenant_id })
      .first();
    if (!cat) {
      cat = await knex('categories')
        .where({ type: 'income', tenant_id: row.tenant_id })
        .orderBy('id')
        .first();
    }
    if (cat) {
      await knex('givelify_contributions').where({ id: row.id }).update({ income_category_id: cat.id });
    }
  }
};

exports.down = async function (knex) {
  const hasIncome = await knex.schema.hasColumn('givelify_contributions', 'income_category_id');
  if (!hasIncome) return;
  await knex.schema.table('givelify_contributions', (t) => {
    t.dropColumn('income_category_id');
    t.dropColumn('fee_category_id');
  });
};
