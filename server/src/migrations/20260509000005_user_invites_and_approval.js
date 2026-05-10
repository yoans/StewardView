exports.up = async function (knex) {
  const hasUsers = await knex.schema.hasTable('users');
  if (hasUsers) {
    await knex.schema.table('users', (t) => {
      t.boolean('is_approved').notNullable().defaultTo(true);
      t.boolean('must_set_password').notNullable().defaultTo(false);
      t.timestamp('invited_at');
      t.timestamp('approved_at');
      t.integer('approved_by').unsigned();
      t.timestamp('deleted_at');
    });

    await knex('users')
      .whereNull('approved_at')
      .update({ is_approved: true, must_set_password: false, approved_at: knex.fn.now() });
  }

  const hasInviteTokens = await knex.schema.hasTable('user_invite_tokens');
  if (!hasInviteTokens) {
    await knex.schema.createTable('user_invite_tokens', (t) => {
      t.increments('id').primary();
      t.integer('user_id').unsigned().notNullable();
      t.string('token_hash').notNullable().unique();
      t.timestamp('expires_at').notNullable();
      t.boolean('used').notNullable().defaultTo(false);
      t.timestamp('created_at').defaultTo(knex.fn.now());
    });
    await knex.schema.table('user_invite_tokens', (t) => {
      t.index(['user_id', 'used']);
      t.index(['token_hash', 'used']);
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('user_invite_tokens');

  const hasUsers = await knex.schema.hasTable('users');
  if (hasUsers) {
    await knex.schema.table('users', (t) => {
      t.dropColumn('deleted_at');
      t.dropColumn('approved_by');
      t.dropColumn('approved_at');
      t.dropColumn('invited_at');
      t.dropColumn('must_set_password');
      t.dropColumn('is_approved');
    });
  }
};