/**
 * Givelify import is removed. Bank deposits are the only source of giving.
 *
 * 1. Reverse and delete Givelify fund adjustments (gift credits and fee debits
 *    that have no bank transaction behind them).
 * 2. Deactivate the unused Givelify Fees category.
 * 3. Put every active bank deposit with no fund into the General Fund.
 * 4. Categorize uncategorized Givelify settlement deposits as Online Contributions.
 */
function looksLikeGivelifySettlement(text) {
  const t = String(text || '').toLowerCase();
  if (t.includes('givelify')) return true;
  if (/5\s*\/\s*3/.test(t) && t.includes('bankcard')) return true;
  return false;
}

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('fund_transactions'))) return;

  const adjustments = await knex('fund_transactions')
    .whereNull('transaction_id')
    .andWhere((q) => {
      q.where('description', 'like', 'Givelify:%').orWhere('description', 'like', 'Givelify fee:%');
    })
    .select('id', 'fund_id', 'type', 'amount', 'tenant_id');

  for (const adj of adjustments) {
    const amount = parseFloat(adj.amount) || 0;
    const delta = adj.type === 'contribution' ? -amount : amount;
    await knex('funds').where({ id: adj.fund_id }).increment('current_balance', delta);
  }
  if (adjustments.length) {
    await knex('fund_transactions').whereIn('id', adjustments.map((a) => a.id)).del();
  }

  if (await knex.schema.hasTable('givelify_contributions')) {
    await knex('givelify_contributions').update({ status: 'void' });
  }

  const feeCats = await knex('categories').where({ name: 'Givelify Fees' }).select('id');
  for (const cat of feeCats) {
    const used = await knex('transactions').where({ category_id: cat.id }).first();
    if (!used) await knex('categories').where({ id: cat.id }).update({ is_active: false });
  }

  const deposits = await knex('transactions')
    .whereNotNull('bank_account_id')
    .whereNull('fund_id')
    .where({ type: 'income' })
    .where('status', '!=', 'void')
    .select('*');

  const generalByTenant = new Map();
  const onlineByTenant = new Map();

  for (const txn of deposits) {
    if (!generalByTenant.has(txn.tenant_id)) {
      const gf = await knex('funds')
        .where({ tenant_id: txn.tenant_id, name: 'General Fund', is_active: true })
        .first();
      generalByTenant.set(txn.tenant_id, gf || null);
    }
    const general = generalByTenant.get(txn.tenant_id);
    if (!general) continue;

    const updates = { fund_id: general.id };

    const hay = `${txn.description || ''} ${txn.payee_payer || ''} ${txn.notes || ''}`;
    if (!txn.category_id && looksLikeGivelifySettlement(hay)) {
      if (!onlineByTenant.has(txn.tenant_id)) {
        const cat = await knex('categories')
          .where({ tenant_id: txn.tenant_id, type: 'income', name: 'Online Contributions', is_active: true })
          .first();
        onlineByTenant.set(txn.tenant_id, cat || null);
      }
      const online = onlineByTenant.get(txn.tenant_id);
      if (online) updates.category_id = online.id;
    }

    await knex('transactions').where({ id: txn.id }).update(updates);
    await knex('fund_transactions').insert({
      fund_id: general.id,
      transaction_id: txn.id,
      type: 'contribution',
      amount: txn.amount,
      date: txn.date,
      description: txn.description,
      donor_name: txn.payee_payer || null,
      created_by: txn.created_by || null,
      tenant_id: txn.tenant_id,
    });
    await knex('funds').where({ id: general.id }).increment('current_balance', parseFloat(txn.amount) || 0);
  }
};

exports.down = async function () {
  // Irreversible data cleanup
};
