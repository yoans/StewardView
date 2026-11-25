/**
 * Brings a tenant's categories and bank rules in line with the church
 * workbook (utils/defaultCategories).
 *
 * home: true  — rename old category names, add/reorder workbook categories,
 *               deactivate unused extras, and add every starter rule
 *               (including the home church's payee rules).
 * home: false — only fill missing section headers where names match and
 *               add generic starter rules. Nothing is renamed or hidden.
 *
 * Used by the 20261124 migration and scripts/home-church-setup.js.
 */
const { CHURCH_CATEGORIES, CATEGORY_RENAMES } = require('../utils/defaultCategories');
const { DEFAULT_RULES, rulesForTenant, buildRuleRows } = require('./categoryRules');

async function syncTenantCategories(knex, tenantId, { home }) {
  const summary = { renamed: [], added: [], deactivated: [], groupsFilled: 0, rulesAdded: 0 };
  const scoped = () => {
    const query = knex('categories');
    return tenantId == null ? query.whereNull('tenant_id') : query.where({ tenant_id: tenantId });
  };

  if (tenantId != null && !home) {
    summary.groupsFilled = await backfillGroups(knex, scoped);
    summary.rulesAdded = await addMissingRules(knex, tenantId, rulesForTenant(tenantId));
    return summary;
  }

  const existing = await scoped().select('*');
  const byName = new Map(existing.map((row) => [row.name.toLowerCase(), row]));

  for (const [from, to] of Object.entries(CATEGORY_RENAMES)) {
    const row = byName.get(from.toLowerCase());
    if (!row || byName.has(to.toLowerCase())) continue;
    await knex('categories').where({ id: row.id }).update({ name: to, updated_at: knex.fn.now() });
    summary.renamed.push(`${row.name} → ${to}`);
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
      summary.added.push(def.name);
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
      summary.deactivated.push(row.name);
    }
  }

  if (tenantId == null) return summary;
  // Home church: every starter rule it doesn't already have, payee rules included.
  summary.rulesAdded = await addMissingRules(knex, tenantId, DEFAULT_RULES);
  return summary;
}

async function backfillGroups(knex, scoped) {
  const rows = await scoped().whereNull('group_name').select('id', 'name');
  const groupByName = new Map(CHURCH_CATEGORIES.map((def) => [def.name.toLowerCase(), def.group_name]));
  let filled = 0;
  for (const row of rows) {
    const group = groupByName.get(String(row.name).toLowerCase());
    if (!group) continue;
    await knex('categories').where({ id: row.id }).update({ group_name: group });
    filled++;
  }
  return filled;
}

function ruleKey(rule) {
  const n = (v) => (v == null ? '' : Number(v).toFixed(2));
  return [
    String(rule.pattern).toLowerCase(), rule.category_id, rule.transaction_type || '',
    rule.day_rank || '', n(rule.min_amount), n(rule.max_amount),
  ].join('|');
}

/** Insert starter rules the tenant doesn't have yet. Never removes or edits existing rules. */
async function addMissingRules(knex, tenantId, defs) {
  const cats = await knex('categories').where({ tenant_id: tenantId, is_active: true }).select('id', 'name');
  const idByName = new Map(cats.map((cat) => [cat.name.toLowerCase(), cat.id]));
  const existing = await knex('category_rules').where({ tenant_id: tenantId }).select('*');
  const have = new Set(existing.map(ruleKey));
  const rows = buildRuleRows(defs, tenantId, idByName).filter((row) => !have.has(ruleKey(row)));
  if (rows.length) await knex('category_rules').insert(rows);
  return rows.length;
}

module.exports = { syncTenantCategories, addMissingRules, ruleKey };
