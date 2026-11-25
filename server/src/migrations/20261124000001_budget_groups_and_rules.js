const { CHURCH_CATEGORIES, CATEGORY_RENAMES } = require('../utils/defaultCategories');
const { rulesForTenant, buildRuleRows } = require('../services/categoryRules');
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
    await syncTenant(knex, null);
    return;
  }
  for (const tenantId of tenantIds) {
    await syncTenant(knex, tenantId);
  }
};

async function syncTenant(knex, tenantId) {
  const scoped = () => {
    const query = knex('categories');
    return tenantId == null ? query.whereNull('tenant_id') : query.where({ tenant_id: tenantId });
  };

  if (tenantId != null && !isHomeTenant(tenantId)) {
    await backfillGroups(knex, scoped);
    await seedRules(knex, tenantId);
    return;
  }

  const existing = await scoped().select('*');
  const byName = new Map(existing.map((row) => [row.name.toLowerCase(), row]));

  for (const [from, to] of Object.entries(CATEGORY_RENAMES)) {
    const row = byName.get(from.toLowerCase());
    if (!row || byName.has(to.toLowerCase())) continue;
    await knex('categories').where({ id: row.id }).update({
      name: to,
      updated_at: knex.fn.now(),
    });
    byName.delete(from.toLowerCase());
    byName.set(to.toLowerCase(), { ...row, name: to });
  }

  const refreshed = await scoped().select('*');
  const refreshedByName = new Map(refreshed.map((row) => [row.name.toLowerCase(), row]));

  for (const def of CHURCH_CATEGORIES) {
    const hit = refreshedByName.get(def.name.toLowerCase());
    if (hit) {
      await knex('categories').where({ id: hit.id }).update({
        description: def.description,
        type: def.type,
        group_name: def.group_name,
        sort_order: def.sort_order,
        is_active: true,
        updated_at: knex.fn.now(),
      });
    } else {
      const insert = {
        name: def.name,
        type: def.type,
        description: def.description,
        group_name: def.group_name,
        sort_order: def.sort_order,
        is_active: true,
      };
      if (tenantId != null) insert.tenant_id = tenantId;
      await knex('categories').insert(insert);
    }
  }

  const after = await scoped().select('*');
  const keep = new Set(CHURCH_CATEGORIES.map((def) => def.name.toLowerCase()));
  for (const row of after) {
    if (keep.has(row.name.toLowerCase())) continue;
    const [txnCount] = await knex('transactions').where({ category_id: row.id }).count('* as c');
    const [budgetCount] = await knex('budgets').where({ category_id: row.id }).count('* as c');
    const used = (parseInt(txnCount.c, 10) || 0) + (parseInt(budgetCount.c, 10) || 0);
    if (used === 0 && row.is_active !== false) {
      await knex('categories').where({ id: row.id }).update({ is_active: false, updated_at: knex.fn.now() });
    }
  }

  if (tenantId == null) return;
  await seedRules(knex, tenantId);
}

async function backfillGroups(knex, scoped) {
  const rows = await scoped().whereNull('group_name').select('id', 'name');
  const groupByName = new Map(CHURCH_CATEGORIES.map((def) => [def.name.toLowerCase(), def.group_name]));
  for (const row of rows) {
    const group = groupByName.get(String(row.name).toLowerCase());
    if (group) await knex('categories').where({ id: row.id }).update({ group_name: group });
  }
}

async function seedRules(knex, tenantId) {
  const ruleCount = await knex('category_rules').where({ tenant_id: tenantId }).count('* as c').first();
  if ((parseInt(ruleCount.c, 10) || 0) > 0) return;

  const cats = await knex('categories').where({ tenant_id: tenantId, is_active: true }).select('id', 'name');
  const idByName = new Map(cats.map((cat) => [cat.name.toLowerCase(), cat.id]));
  const rows = buildRuleRows(rulesForTenant(tenantId), tenantId, idByName);
  if (rows.length) await knex('category_rules').insert(rows);
}

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('category_rules');
  const hasGroup = await knex.schema.hasColumn('categories', 'group_name');
  if (hasGroup) {
    await knex.schema.alterTable('categories', (t) => {
      t.dropColumn('group_name');
    });
  }
};
