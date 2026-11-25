/**
 * tenant_id columns were added with DEFAULT 1, so any insert that forgot a
 * tenant silently landed in tenant 1 (that is how the old all-church nightly
 * backups ended up downloadable by tenant 1's admins). Drop the default so a
 * missing tenant is NULL and visible instead of misfiled.
 */
exports.up = async function up(knex) {
  const { rows } = await knex.raw(`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tenant_id' AND column_default IS NOT NULL`);
  for (const { table_name: table } of rows) {
    await knex.raw('ALTER TABLE ?? ALTER COLUMN tenant_id DROP DEFAULT', [table]);
  }
};

exports.down = async function down() {
  // Intentionally not restored.
};
