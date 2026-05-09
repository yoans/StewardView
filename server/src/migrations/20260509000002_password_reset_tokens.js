exports.up = async function (knex) {
  await knex.schema.createTable('password_reset_tokens', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable();
    t.string('token_hash').notNullable().unique();
    t.timestamp('expires_at').notNullable();
    t.boolean('used').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('password_reset_tokens', (t) => {
    t.index(['user_id', 'used']);
    t.index(['expires_at']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('password_reset_tokens');
};