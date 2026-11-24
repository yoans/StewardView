const { v4: uuidv4 } = require('uuid');
const db = require('../models/db');
const { applyFundMovement, resolveExpenseFundId, getGeneralFund } = require('../utils/fundBank');

/**
 * Givelify ACH deposits post as "5/3 BANKCARD SYS" (Fifth Third is their card
 * processor). Early setup may show "Givelify, LLC". Used only to pick the
 * Online Contributions category.
 */
function looksLikeGivelifySettlement(...parts) {
  const text = parts.filter(Boolean).join(' ').toLowerCase();
  if (!text) return false;
  if (text.includes('givelify')) return true;
  if (/5\s*\/\s*3/.test(text) && /bankcard/.test(text)) return true;
  if (/fifth\s*thirds?/.test(text) && /bankcard|vantiv|worldpay/.test(text)) return true;
  return false;
}

/**
 * Insert one cleared bank transaction, or attach an external id to a row
 * that was already imported from a CSV with the same date, amount, and description.
 */
async function importClearedTransaction({
  tenantId,
  userId = null,
  account,
  date,
  description,
  payee = null,
  amount,
  type,
  checkNumber = null,
  notes = null,
  externalId = null,
  source = null,
}) {
  return db.transaction(async (trx) => {
    if (externalId) {
      const byExternal = await trx('transactions').where({
        tenant_id: tenantId,
        bank_account_id: account.id,
        external_id: externalId,
      }).first();
      if (byExternal) return { status: 'duplicate', id: byExternal.id };
    }

    let duplicateQuery = trx('transactions').where({
      tenant_id: tenantId,
      bank_account_id: account.id,
      date,
      type,
      amount,
      description,
    });
    if (checkNumber) duplicateQuery = duplicateQuery.where('check_number', checkNumber);
    const duplicate = await duplicateQuery.first();
    if (duplicate) {
      if (externalId && !duplicate.external_id) {
        await trx('transactions').where({ id: duplicate.id }).update({
          external_id: externalId,
          import_source: duplicate.import_source || source,
        });
      }
      return { status: 'duplicate', id: duplicate.id };
    }

    let fundId = null;
    let categoryId = null;
    if (type === 'expense') {
      fundId = await resolveExpenseFundId(tenantId, null, trx);
    } else if (type === 'income') {
      const general = await getGeneralFund(tenantId, trx);
      if (general) fundId = general.id;
      if (looksLikeGivelifySettlement(description, payee)) {
        const onlineCat = await trx('categories')
          .where({ tenant_id: tenantId, type: 'income', is_active: true, name: 'Online Contributions' })
          .first();
        if (onlineCat) categoryId = onlineCat.id;
      }
    }

    const [{ id: txnId }] = await trx('transactions').insert({
      ref_number: `IMP-${uuidv4().slice(0, 8).toUpperCase()}`,
      type,
      amount,
      date,
      description: String(description || 'Imported transaction').slice(0, 255),
      payee_payer: payee ? String(payee).slice(0, 255) : null,
      check_number: checkNumber,
      bank_account_id: account.id,
      fund_id: fundId,
      category_id: categoryId,
      status: 'cleared',
      notes,
      created_by: userId,
      tenant_id: tenantId,
      external_id: externalId,
      import_source: source,
    }).returning('id');

    if (fundId) {
      await applyFundMovement({
        fundId,
        transactionId: txnId,
        type,
        amount,
        date,
        description,
        payeePayer: payee,
        userId,
        tenantId,
        trx,
      });
    }

    return { status: 'imported', id: txnId, type, amount: parseFloat(amount) || 0 };
  });
}

module.exports = {
  looksLikeGivelifySettlement,
  importClearedTransaction,
};
