/**
 * - Auto-approve users who were invited by an admin but still marked pending.
 * - Best-effort backfill of audit_log.tenant_id from users.tenant_id.
 */
exports.up = async function (knex) {
  await knex('users')
    .whereNotNull('invited_at')
    .where({ is_approved: false })
    .whereNull('deleted_at')
    .update({
      is_approved: true,
      is_active: true,
      approved_at: knex.fn.now(),
    });

  const isPg = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
  if (isPg) {
    await knex.raw(`
      UPDATE audit_log AS a
      SET tenant_id = u.tenant_id
      FROM users AS u
      WHERE a.user_id = u.id
        AND a.tenant_id IS NULL
        AND u.tenant_id IS NOT NULL
    `);
  }
};

exports.down = async function () {
  // irreversible data fix
};
