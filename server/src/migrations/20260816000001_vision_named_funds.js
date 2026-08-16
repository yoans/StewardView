/**
 * Establish vision funds for existing tenants: outreach, game night, and emergency,
 * plus any other default named funds that are missing.
 * Does not overwrite funds a church already created.
 */

const { CHURCH_FUNDS } = require('../utils/defaultFunds');

exports.up = async function (knex) {
  const hasFunds = await knex.schema.hasTable('funds');
  if (!hasFunds) return;

  const hasTenants = await knex.schema.hasTable('tenants');
  const tenantIds = hasTenants
    ? (await knex('tenants').select('id')).map((t) => t.id)
    : [];

  const distinctTenantIds = [...new Set(tenantIds)];
  if (!distinctTenantIds.length) {
    const rows = await knex('funds').distinct('tenant_id');
    rows.forEach((r) => {
      if (r.tenant_id != null) distinctTenantIds.push(r.tenant_id);
    });
  }
  if (!distinctTenantIds.length) distinctTenantIds.push(1);

  for (const tenantId of distinctTenantIds) {
    const existing = await knex('funds').where({ tenant_id: tenantId }).select('name');
    const names = new Set(existing.map((f) => f.name));
    const toInsert = CHURCH_FUNDS.filter((f) => !names.has(f.name)).map((f) => ({
      name: f.name,
      description: f.description,
      current_balance: 0,
      is_restricted: f.is_restricted,
      is_active: true,
      tenant_id: tenantId,
    }));
    if (toInsert.length) await knex('funds').insert(toInsert);
  }
};

exports.down = async function (knex) {
  const removable = ['Outreach Events Fund', 'Game Night Fund', 'Emergency Fund'];
  const hasFundTx = await knex.schema.hasTable('fund_transactions');
  const funds = await knex('funds').whereIn('name', removable).select('id', 'current_balance');
  for (const fund of funds) {
    const balance = parseFloat(fund.current_balance) || 0;
    if (Math.abs(balance) > 0.009) continue;
    let activity = 0;
    if (hasFundTx) {
      const row = await knex('fund_transactions').where({ fund_id: fund.id }).count('id as c').first();
      activity = parseInt(row?.c, 10) || 0;
    }
    if (activity) continue;
    await knex('funds').where({ id: fund.id }).del();
  }
};
