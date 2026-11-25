#!/usr/bin/env node
/**
 * Apply the church workbook setup to one tenant: category renames, workbook
 * categories and sections, hide unused extras, and add any missing starter
 * bank rules (including the home church's payee rules).
 *
 *   node server/scripts/home-church-setup.js --tenant 4            # dry run
 *   node server/scripts/home-church-setup.js --tenant 4 --confirm  # apply
 *
 * Everything runs in one transaction; without --confirm it is rolled back.
 */
const { connect, parseArgs, DryRun } = require('./_scriptDb');
const { syncTenantCategories } = require('../src/services/workbookSync');
const { applyCategoryRules } = require('../src/services/applyCategoryRules');

async function main() {
  const args = parseArgs();
  if (args.tenants.length !== 1) throw new Error('Pass exactly one --tenant <id>');
  const [tenantId] = args.tenants;
  const db = connect();
  try {
    const tenant = await db('tenants').where({ id: tenantId }).first();
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
    console.log(`Tenant ${tenant.id}: ${tenant.name} (${tenant.slug})`);
    console.log(args.confirm ? 'Mode: APPLY' : 'Mode: dry run (rolled back)');

    let summary;
    let categorized;
    try {
      await db.transaction(async (trx) => {
        summary = await syncTenantCategories(trx, tenantId, { home: true });
        categorized = await applyCategoryRules(tenantId, trx);
        if (!args.confirm) throw new DryRun();
      });
    } catch (err) {
      if (!(err instanceof DryRun)) throw err;
    }

    console.log(`Renamed:      ${summary.renamed.length ? summary.renamed.join(', ') : 'none'}`);
    console.log(`Added:        ${summary.added.length ? summary.added.join(', ') : 'none'}`);
    console.log(`Hidden (unused): ${summary.deactivated.length ? summary.deactivated.join(', ') : 'none'}`);
    console.log(`Rules added:  ${summary.rulesAdded}`);
    console.log(`Uncategorized transactions filed by rules: ${categorized?.updated ?? 0}`);
    console.log(args.confirm ? 'Done.' : 'Nothing was changed. Re-run with --confirm to apply.');
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
