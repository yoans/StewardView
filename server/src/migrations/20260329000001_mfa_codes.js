/**
 * MFA verification codes table — stores time-limited email codes for login.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('mfa_codes', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable();
    t.string('code', 6).notNullable();
    t.timestamp('expires_at').notNullable();
    t.boolean('used').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('mfa_codes');
};
