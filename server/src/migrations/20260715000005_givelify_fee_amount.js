/**
 * Track Givelify processing fees separately from gift gross.
 * Fees reduce General Fund (operating absorbs card/processing cost).
 */
exports.up = async function (knex) {
  const hasFee = await knex.schema.hasColumn('givelify_contributions', 'fee_amount');
  if (!hasFee) {
    await knex.schema.table('givelify_contributions', (t) => {
      t.decimal('fee_amount', 14, 2).defaultTo(0);
      t.decimal('net_amount', 14, 2);
    });
  }
};

exports.down = async function (knex) {
  const hasFee = await knex.schema.hasColumn('givelify_contributions', 'fee_amount');
  if (!hasFee) return;
  await knex.schema.table('givelify_contributions', (t) => {
    t.dropColumn('fee_amount');
    t.dropColumn('net_amount');
  });
};
