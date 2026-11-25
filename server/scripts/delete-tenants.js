#!/usr/bin/env node
/**
 * Permanently delete one or more tenants and everything that belongs to them.
 *
 *   node server/scripts/delete-tenants.js --tenant 1 --tenant 5            # dry run
 *   node server/scripts/delete-tenants.js --tenant 1 --tenant 5 --confirm  # delete
 *
 * Safety:
 * - Runs in a single transaction. Without --confirm it reports and rolls back.
 * - Refuses if any tenant has a platform admin user (move them first).
 * - Refuses if any row belonging to a tenant you are KEEPING references a row
 *   that would be deleted (checked across every foreign key in the schema).
 * - Before deleting, writes a JSON export of the doomed rows (password hashes
 *   and bank tokens removed) to server/tenant-exports/ (git-ignored).
 */
const fs = require('fs');
const path = require('path');
const { connect, parseArgs, DryRun } = require('./_scriptDb');

const USER_LINKED = ['mfa_codes', 'password_reset_tokens', 'user_invite_tokens'];
// Secrets, and backup payloads (huge, and old ones hold every church's data).
const REDACT = {
  users: ['password_hash'],
  bank_connections: ['access_token_encrypted'],
  data_backups: ['backup_data'],
};

async function tenantTables(db) {
  const rows = await db('information_schema.columns')
    .where({ table_schema: 'public', column_name: 'tenant_id' })
    .select('table_name');
  return rows.map((r) => r.table_name).filter((t) => t !== 'tenants').sort();
}

async function hasTable(db, t) { return db.schema.hasTable(t); }

async function foreignKeys(db) {
  const { rows } = await db.raw(`
    SELECT kcu.table_name AS child, kcu.column_name AS child_col,
           ccu.table_name AS parent, ccu.column_name AS parent_col
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`);
  return rows;
}

function redact(table, rows) {
  const cols = REDACT[table];
  if (!cols) return rows;
  return rows.map((r) => { const c = { ...r }; cols.forEach((k) => delete c[k]); return c; });
}

async function main() {
  const args = parseArgs();
  if (!args.tenants.length) throw new Error('Pass at least one --tenant <id>');
  const ids = [...new Set(args.tenants)];
  const db = connect();

  try {
    const tenants = await db('tenants').whereIn('id', ids).select('*');
    const missing = ids.filter((id) => !tenants.some((t) => Number(t.id) === id));
    if (missing.length) throw new Error(`Tenant(s) not found: ${missing.join(', ')}`);
    const keep = await db('tenants').whereNotIn('id', ids).select('id', 'name');

    console.log('DELETE:');
    tenants.forEach((t) => console.log(`  ${t.id}  ${t.name} (${t.slug}) status=${t.status} plan=${t.plan}`));
    console.log('KEEP:');
    keep.forEach((t) => console.log(`  ${t.id}  ${t.name}`));
    console.log(args.confirm ? 'Mode: DELETE (permanent)' : 'Mode: dry run (rolled back)');

    const admins = (await db.schema.hasColumn('users', 'is_platform_admin'))
      ? await db('users').whereIn('tenant_id', ids).where({ is_platform_admin: true }).select('id', 'email', 'tenant_id')
      : [];
    if (admins.length) {
      admins.forEach((u) => console.log(`  ! platform admin user ${u.id} <${u.email}> is in tenant ${u.tenant_id}`));
      throw new Error('Refusing: move platform admin users to a kept tenant first.');
    }

    // ── Work out exactly which rows go ──────────────────
    const tables = await tenantTables(db);
    const doomed = {}; // table -> rows
    for (const t of tables) {
      doomed[t] = await db(t).whereIn('tenant_id', ids).select('*');
    }
    const userIds = (doomed.users || []).map((u) => u.id);
    for (const t of USER_LINKED) {
      if (doomed[t] || !(await hasTable(db, t))) continue;
      doomed[t] = userIds.length ? await db(t).whereIn('user_id', userIds).select('*') : [];
    }

    // ── Cross-tenant reference check ────────────────────
    const fks = await foreignKeys(db);
    const problems = [];
    for (const fk of fks) {
      const parentRows = doomed[fk.parent];
      if (!parentRows || !parentRows.length) continue;
      const parentVals = parentRows.map((r) => r[fk.parent_col]).filter((v) => v != null);
      if (!parentVals.length) continue;
      const q = db(fk.child).whereIn(fk.child_col, parentVals);
      if (tables.includes(fk.child)) {
        q.where((w) => w.whereNotIn('tenant_id', ids).orWhereNull('tenant_id'));
      } else if (doomed[fk.child]) {
        q.whereNotIn('id', doomed[fk.child].map((r) => r.id));
      }
      const [{ c }] = await q.count('* as c');
      if (Number(c) > 0) problems.push(`${c} row(s) in ${fk.child}.${fk.child_col} → ${fk.parent} outside the deleted tenants`);
    }
    // The other direction: doomed rows that point at a KEPT tenant's rows are
    // almost certainly misfiled data belonging to that tenant.
    for (const fk of fks) {
      if (!tables.includes(fk.child) || !tables.includes(fk.parent)) continue;
      const [{ c }] = await db(`${fk.child} as c`)
        .join(`${fk.parent} as p`, `c.${fk.child_col}`, `p.${fk.parent_col}`)
        .whereIn('c.tenant_id', ids)
        .where((w) => w.whereNotIn('p.tenant_id', ids).orWhereNull('p.tenant_id'))
        .count('* as c');
      if (Number(c) > 0) problems.push(`${c} row(s) in ${fk.child} filed under a deleted tenant but pointing at a kept tenant's ${fk.parent} (misfiled?)`);
    }
    if (problems.length) {
      problems.forEach((p) => console.log(`  ! ${p}`));
      throw new Error('Refusing: kept data references rows that would be deleted.');
    }

    console.log('Rows to delete:');
    let total = 0;
    for (const [t, rows] of Object.entries(doomed)) {
      if (!rows.length) continue;
      total += rows.length;
      const byTenant = rows.reduce((m, r) => { const k = r.tenant_id ?? 'user-linked'; m[k] = (m[k] || 0) + 1; return m; }, {});
      console.log(`  ${t.padEnd(26)} ${String(rows.length).padStart(6)}   ${JSON.stringify(byTenant)}`);
    }
    console.log(`  ${'tenants'.padEnd(26)} ${String(tenants.length).padStart(6)}`);
    console.log(`  total ${total + tenants.length}`);

    if (!args.confirm) {
      console.log('Nothing was changed. Re-run with --confirm to delete.');
      return;
    }

    // ── Export, then delete ─────────────────────────────
    const outDir = args.out || path.join(__dirname, '..', 'tenant-exports');
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(outDir, `tenants-${ids.join('-')}-${stamp}.json`);
    const exportData = { exported_at: new Date().toISOString(), tenants, tables: {} };
    for (const [t, rows] of Object.entries(doomed)) exportData.tables[t] = redact(t, rows);
    fs.writeFileSync(file, JSON.stringify(exportData, null, 2));
    console.log(`Export written: ${file}`);

    await db.transaction(async (trx) => {
      // Delete in passes; a table whose rows are still referenced by other
      // doomed rows fails inside a savepoint and is retried next pass.
      let pending = Object.keys(doomed).filter((t) => doomed[t].length);
      while (pending.length) {
        const next = [];
        for (const t of pending) {
          try {
            await trx.transaction(async (sp) => {
              if (tables.includes(t)) await sp(t).whereIn('tenant_id', ids).del();
              else await sp(t).whereIn('user_id', userIds).del();
            });
          } catch (err) {
            if (err.code !== '23503') throw err; // only retry FK violations
            next.push(t);
          }
        }
        if (next.length === pending.length) throw new Error(`Could not resolve delete order for: ${next.join(', ')}`);
        pending = next;
      }
      await trx('tenants').whereIn('id', ids).del();
    });
    console.log('Deleted.');
  } catch (err) {
    if (!(err instanceof DryRun)) throw err;
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
