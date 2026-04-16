/**
 * Add index on mfa_codes(user_id) and composite index for the verification query.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('mfa_codes', (t) => {
    t.index(['user_id', 'used', 'expires_at'], 'idx_mfa_codes_lookup');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('mfa_codes', (t) => {
    t.dropIndex(null, 'idx_mfa_codes_lookup');
  });
};
