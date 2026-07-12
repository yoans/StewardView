/**
 * Fix multi-tenant uniqueness for Givelify-related settings and IDs.
 * - app_settings.key was globally unique; become unique per (key, tenant_id)
 * - givelify_id was globally unique; become unique per tenant (NULLs allowed)
 */
exports.up = async function (knex) {
  const isPg = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';

  // ── app_settings ────────────────────────────────────────
  try {
    await knex.schema.alterTable('app_settings', (t) => {
      t.dropUnique(['key']);
    });
  } catch (err) {
    // Constraint may already be dropped or named differently
    if (isPg) {
      await knex.raw('ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_key_unique');
    }
  }

  const hasAppSettingsComposite = await knex.schema.hasColumn('app_settings', 'tenant_id');
  if (hasAppSettingsComposite) {
    try {
      await knex.schema.alterTable('app_settings', (t) => {
        t.unique(['key', 'tenant_id']);
      });
    } catch { /* already exists */ }
  }

  // ── givelify_contributions.givelify_id ──────────────────
  try {
    await knex.schema.alterTable('givelify_contributions', (t) => {
      t.dropUnique(['givelify_id']);
    });
  } catch (err) {
    if (isPg) {
      await knex.raw('ALTER TABLE givelify_contributions DROP CONSTRAINT IF EXISTS givelify_contributions_givelify_id_unique');
    }
  }

  if (isPg) {
    await knex.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS givelify_contributions_tenant_givelify_id_unique
      ON givelify_contributions (tenant_id, givelify_id)
      WHERE givelify_id IS NOT NULL
    `);
  } else {
    try {
      await knex.schema.alterTable('givelify_contributions', (t) => {
        t.unique(['tenant_id', 'givelify_id']);
      });
    } catch { /* already exists */ }
  }
};

exports.down = async function (knex) {
  const isPg = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';

  if (isPg) {
    await knex.raw('DROP INDEX IF EXISTS givelify_contributions_tenant_givelify_id_unique');
  } else {
    try {
      await knex.schema.alterTable('givelify_contributions', (t) => {
        t.dropUnique(['tenant_id', 'givelify_id']);
      });
    } catch { /* ignore */ }
  }

  try {
    await knex.schema.alterTable('givelify_contributions', (t) => {
      t.unique(['givelify_id']);
    });
  } catch { /* ignore */ }

  try {
    await knex.schema.alterTable('app_settings', (t) => {
      t.dropUnique(['key', 'tenant_id']);
    });
  } catch { /* ignore */ }

  try {
    await knex.schema.alterTable('app_settings', (t) => {
      t.unique(['key']);
    });
  } catch { /* ignore */ }
};
