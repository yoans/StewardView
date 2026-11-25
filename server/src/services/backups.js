/**
 * Per-church data backups.
 *
 * Every backup belongs to exactly one tenant and only contains that tenant's
 * rows. Secrets are never copied: password hashes are stripped from users and
 * tables that hold tokens (bank_connections, mfa_codes, reset/invite tokens)
 * are not included. data_backups itself is excluded so backups don't nest.
 */
const db = require('../models/db');

const BACKUP_TABLES = [
  'users', 'bank_accounts', 'categories', 'funds', 'transactions',
  'fund_transactions', 'budgets', 'audit_log', 'monthly_reports',
  'givelify_contributions', 'app_settings',
  'recurring_transfers', 'recurring_transfer_runs', 'category_rules',
];

// Columns that must never leave the database in a backup file.
const REDACTED_COLUMNS = {
  users: ['password_hash'],
};

const SCHEDULED_BACKUPS_TO_KEEP = 30;

function redact(table, rows) {
  const cols = REDACTED_COLUMNS[table];
  if (!cols) return rows;
  return rows.map((row) => {
    const copy = { ...row };
    for (const c of cols) delete copy[c];
    return copy;
  });
}

async function collectTenantData(tenantId, knex = db) {
  const backupData = {};
  const tablesBackedUp = [];
  let totalRows = 0;

  for (const table of BACKUP_TABLES) {
    if (!(await knex.schema.hasTable(table))) continue;
    if (!(await knex.schema.hasColumn(table, 'tenant_id'))) continue;
    const rows = await knex(table).where({ tenant_id: tenantId }).select('*');
    backupData[table] = redact(table, rows);
    totalRows += rows.length;
    tablesBackedUp.push(table);
  }

  return { backupData, tablesBackedUp, totalRows };
}

async function createTenantBackup({ tenantId, type = 'manual', createdBy = null, knex = db }) {
  if (!tenantId) throw new Error('tenantId is required for a backup');
  const { backupData, tablesBackedUp, totalRows } = await collectTenantData(tenantId, knex);

  const [row] = await knex('data_backups').insert({
    backup_type: type,
    status: 'success',
    tables_included: JSON.stringify(tablesBackedUp),
    row_count: totalRows,
    backup_data: JSON.stringify(backupData),
    created_by: createdBy,
    tenant_id: tenantId,
  }).returning('id');

  return { id: row?.id ?? row, tablesBackedUp, totalRows };
}

async function pruneScheduledBackups(tenantId, keep = SCHEDULED_BACKUPS_TO_KEEP, knex = db) {
  const old = await knex('data_backups')
    .where({ backup_type: 'scheduled', tenant_id: tenantId })
    .orderBy('created_at', 'desc')
    .offset(keep)
    .select('id');
  if (old.length) await knex('data_backups').whereIn('id', old.map((b) => b.id)).del();
  return old.length;
}

/** Nightly job: one backup per active church, then trim that church's history. */
async function runScheduledBackups(knex = db) {
  const tenants = await knex('tenants').whereNotIn('status', ['canceled']).select('id');
  let ok = 0;
  let failed = 0;
  for (const t of tenants) {
    try {
      await createTenantBackup({ tenantId: t.id, type: 'scheduled', knex });
      await pruneScheduledBackups(t.id, SCHEDULED_BACKUPS_TO_KEEP, knex);
      ok++;
    } catch (err) {
      failed++;
      console.error(`Scheduled backup failed for tenant ${t.id}:`, err.message || err);
    }
  }
  return { ok, failed };
}

module.exports = {
  BACKUP_TABLES,
  REDACTED_COLUMNS,
  createTenantBackup,
  pruneScheduledBackups,
  runScheduledBackups,
  redact,
};
