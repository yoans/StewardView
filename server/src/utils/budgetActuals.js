const db = require('../models/db');

/**
 * Actuals for budget: bank/cash transactions + Givelify fund gifts (and fees).
 * Givelify does not create rows in `transactions` — only fund adjustments —
 * so budget pulls gift gross / fees from givelify_contributions.
 */
async function categoryActualsMap(tenantId, startDate, endDate) {
  const actualMap = {};

  const bankActuals = await db('transactions')
    .where('status', '!=', 'void')
    .where('tenant_id', tenantId)
    .whereBetween('date', [startDate, endDate])
    .whereNotNull('category_id')
    // Exclude any leftover cashless Givelify soft rows if cleanup hasn't run yet
    .where(function () {
      this.whereNotNull('bank_account_id')
        .orWhere(function () {
          this.whereNull('bank_account_id')
            .andWhere((q) => {
              q.whereNull('payee_payer').orWhere('payee_payer', '!=', 'Givelify');
            })
            .andWhere('description', 'not ilike', 'Givelify%');
        });
    })
    .groupBy('category_id')
    .select('category_id')
    .sum('amount as actual_amount');

  bankActuals.forEach((a) => {
    if (!a.category_id) return;
    actualMap[a.category_id] = (actualMap[a.category_id] || 0) + (parseFloat(a.actual_amount) || 0);
  });

  if (await db.schema.hasTable('givelify_contributions')) {
    const gifts = await db('givelify_contributions')
      .where({ tenant_id: tenantId, status: 'imported' })
      .whereBetween('date', [startDate, endDate])
      .whereNotNull('income_category_id')
      .groupBy('income_category_id')
      .select('income_category_id')
      .sum('amount as total');

    gifts.forEach((g) => {
      const id = g.income_category_id;
      if (!id) return;
      actualMap[id] = (actualMap[id] || 0) + (parseFloat(g.total) || 0);
    });

    if (await db.schema.hasColumn('givelify_contributions', 'fee_amount')) {
      const fees = await db('givelify_contributions')
        .where({ tenant_id: tenantId, status: 'imported' })
        .whereBetween('date', [startDate, endDate])
        .whereNotNull('fee_category_id')
        .where('fee_amount', '>', 0)
        .groupBy('fee_category_id')
        .select('fee_category_id')
        .sum('fee_amount as total');

      fees.forEach((f) => {
        const id = f.fee_category_id;
        if (!id) return;
        actualMap[id] = (actualMap[id] || 0) + (parseFloat(f.total) || 0);
      });
    }
  }

  return actualMap;
}

async function givelifyMonthTotals(tenantId, startDate, endDate) {
  if (!(await db.schema.hasTable('givelify_contributions'))) {
    return { income: 0, fees: 0 };
  }
  const incomeRow = await db('givelify_contributions')
    .where({ tenant_id: tenantId, status: 'imported' })
    .whereBetween('date', [startDate, endDate])
    .sum('amount as total')
    .first();
  let fees = 0;
  if (await db.schema.hasColumn('givelify_contributions', 'fee_amount')) {
    const feeRow = await db('givelify_contributions')
      .where({ tenant_id: tenantId, status: 'imported' })
      .whereBetween('date', [startDate, endDate])
      .sum('fee_amount as total')
      .first();
    fees = parseFloat(feeRow?.total) || 0;
  }
  return {
    income: parseFloat(incomeRow?.total) || 0,
    fees,
  };
}

module.exports = {
  categoryActualsMap,
  givelifyMonthTotals,
};
