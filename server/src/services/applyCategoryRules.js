const db = require('../models/db');
const { categorizeAll } = require('./categoryRules');

async function loadRules(tenantId, trx = db) {
  return trx('category_rules')
    .where({ tenant_id: tenantId, is_active: true })
    .orderBy('priority', 'asc');
}

/**
 * Fill category_id on uncleared-of-category bank rows. Existing categories stay.
 * Returns the number of rows updated.
 */
async function applyCategoryRules(tenantId, trx = db) {
  const hasTable = await trx.schema.hasTable('category_rules');
  if (!hasTable) return { updated: 0 };
  const rules = await loadRules(tenantId, trx);
  if (!rules.length) return { updated: 0 };

  const txns = await trx('transactions')
    .where({ tenant_id: tenantId })
    .whereNull('category_id')
    .whereNot('status', 'void')
    .select('id', 'type', 'amount', 'date', 'description', 'payee_payer', 'bank_account_id');

  const decided = categorizeAll(txns, rules);
  let updated = 0;
  for (const [id, categoryId] of decided) {
    const changed = await trx('transactions')
      .where({ id, tenant_id: tenantId })
      .whereNull('category_id')
      .update({ category_id: categoryId, updated_at: new Date().toISOString() });
    updated += changed;
  }
  return { updated };
}

module.exports = {
  applyCategoryRules,
  loadRules,
};
