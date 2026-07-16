const {
  CHURCH_CATEGORIES,
  CATEGORY_RENAMES,
} = require('../utils/defaultCategories');

/**
 * Align categories to the church workbook list:
 * - add sort_order
 * - rename known legacy names
 * - insert missing church categories per tenant
 * - soft-deactivate unused legacy categories with no budgets/transactions
 */
exports.up = async function (knex) {
  const hasSort = await knex.schema.hasColumn('categories', 'sort_order');
  if (!hasSort) {
    await knex.schema.alterTable('categories', (t) => {
      t.integer('sort_order').defaultTo(0);
    });
  }

  const tenants = await knex('tenants').select('id');
  const tenantIds = tenants.map((t) => t.id);
  if (tenantIds.length === 0) {
    // Dev seed may not use tenants table the same way — still update global rows if any
    await applyForTenant(knex, null);
    return;
  }

  for (const tenantId of tenantIds) {
    await applyForTenant(knex, tenantId);
  }
};

async function applyForTenant(knex, tenantId) {
  let catsQuery = knex('categories');
  if (tenantId != null) catsQuery = catsQuery.where({ tenant_id: tenantId });
  else catsQuery = catsQuery.whereNull('tenant_id');
  const existing = await catsQuery.select('*');

  const byName = new Map(existing.map((c) => [c.name.toLowerCase(), c]));

  // Renames
  for (const [from, to] of Object.entries(CATEGORY_RENAMES)) {
    const row = byName.get(from.toLowerCase());
    if (!row) continue;
    if (byName.has(to.toLowerCase())) continue;
    await knex('categories').where({ id: row.id }).update({
      name: to,
      sort_order: CHURCH_CATEGORIES.find((c) => c.name === to)?.sort_order || row.sort_order || 0,
      updated_at: knex.fn.now(),
    });
    byName.delete(from.toLowerCase());
    byName.set(to.toLowerCase(), { ...row, name: to });
  }

  // Refresh after renames
  let refreshedQuery = knex('categories');
  if (tenantId != null) refreshedQuery = refreshedQuery.where({ tenant_id: tenantId });
  else refreshedQuery = refreshedQuery.whereNull('tenant_id');
  const refreshed = await refreshedQuery.select('*');
  const refreshedByName = new Map(refreshed.map((c) => [c.name.toLowerCase(), c]));

  for (const def of CHURCH_CATEGORIES) {
    const hit = refreshedByName.get(def.name.toLowerCase());
    if (hit) {
      await knex('categories').where({ id: hit.id }).update({
        description: def.description,
        type: def.type,
        sort_order: def.sort_order,
        is_active: true,
        updated_at: knex.fn.now(),
      });
    } else {
      const insert = {
        name: def.name,
        type: def.type,
        description: def.description,
        sort_order: def.sort_order,
        is_active: true,
      };
      if (tenantId != null) insert.tenant_id = tenantId;
      await knex('categories').insert(insert);
    }
  }

  // Soft-deactivate legacy coarse categories that have no activity
  const keep = new Set(CHURCH_CATEGORIES.map((c) => c.name.toLowerCase()));
  for (const row of refreshed) {
    if (keep.has(row.name.toLowerCase())) continue;
    const [txnCount] = await knex('transactions').where({ category_id: row.id }).count('* as c');
    const [budgetCount] = await knex('budgets').where({ category_id: row.id }).count('* as c');
    const used = (parseInt(txnCount.c) || 0) + (parseInt(budgetCount.c) || 0);
    if (used === 0) {
      await knex('categories').where({ id: row.id }).update({ is_active: false, updated_at: knex.fn.now() });
    }
  }
}

exports.down = async function (knex) {
  // Keep sort_order column; do not destroy renamed categories
};
