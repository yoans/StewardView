/**
 * Manual fund transfers and adjustments were inserted without tenant_id, so
 * the column default (1) filed them under tenant 1 instead of the church that
 * owns the fund. Re-file every fund_transactions row under its fund's tenant.
 */
exports.up = async function up(knex) {
  await knex.raw(`
    UPDATE fund_transactions ft
    SET tenant_id = f.tenant_id
    FROM funds f
    WHERE ft.fund_id = f.id
      AND f.tenant_id IS NOT NULL
      AND ft.tenant_id IS DISTINCT FROM f.tenant_id`);
};

exports.down = async function down() {
  // Not reversible: the old values were wrong.
};
