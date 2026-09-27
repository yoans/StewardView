const db = require('../models/db');

/** Budget actuals by category, from bank/cash transactions. */
async function categoryActualsMap(tenantId, startDate, endDate) {
  const actualMap = {};

  const bankActuals = await db('transactions')
    .where('status', '!=', 'void')
    .where('tenant_id', tenantId)
    .whereBetween('date', [startDate, endDate])
    .whereNotNull('category_id')
    .groupBy('category_id')
    .select('category_id')
    .sum('amount as actual_amount');

  bankActuals.forEach((a) => {
    if (!a.category_id) return;
    actualMap[a.category_id] = (actualMap[a.category_id] || 0) + (parseFloat(a.actual_amount) || 0);
  });

  return actualMap;
}

module.exports = {
  categoryActualsMap,
};
