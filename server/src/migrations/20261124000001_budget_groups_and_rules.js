const { syncTenantCategories } = require('../services/workbookSync');
const { isHomeTenant } = require('../utils/homeTenant');

/**
 * Workbook sections, the categories from the spending plan, and rules that
 * file recurring bank descriptions onto those categories.
 *
 * Only the home church (utils/homeTenant) gets its categories renamed,
 * reordered and pruned to match the workbook. Other organizations keep their
 * own categories; they just get section headers filled in where names match,
 * plus generic starter rules.
 */
exports.up = async function up(knex) {
  const hasGroup = await knex.schema.hasColumn('categories', 'group_name');
  if (!hasGroup) {
    await knex.schema.alterTable('categories', (t) => {
      t.string('group_name');
    });
  }

  const hasRules = await knex.schema.hasTable('category_rules');
  if (!hasRules) {
    await knex.schema.createTable('category_rules', (t) => {
      t.increments('id').primary();
      t.integer('tenant_id').unsigned().notNullable();
      t.string('pattern').notNullable();
      t.string('match_mode').notNullable().defaultTo('contains');
      t.string('transaction_type');
      t.decimal('min_amount', 14, 2);
      t.decimal('max_amount', 14, 2);
      t.string('day_rank');
      t.integer('category_id').unsigned().notNullable().references('id').inTable('categories');
      t.integer('priority').notNullable().defaultTo(100);
      t.boolean('is_active').notNullable().defaultTo(true);
      t.timestamps(true, true);
    });
  }

  const tenants = await knex('tenants').select('id');
  const tenantIds = tenants.map((tenant) => tenant.id);
  if (tenantIds.length === 0) {
    await syncTenantCategories(knex, null, { home: true });
    return;
  }
  for (const tenantId of tenantIds) {
    await syncTenantCategories(knex, tenantId, { home: isHomeTenant(tenantId) });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('category_rules');
  const hasGroup = await knex.schema.hasColumn('categories', 'group_name');
  if (hasGroup) {
    await knex.schema.alterTable('categories', (t) => {
      t.dropColumn('group_name');
    });
  }
};
