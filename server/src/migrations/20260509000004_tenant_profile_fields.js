exports.up = async function (knex) {
  const hasTenants = await knex.schema.hasTable('tenants');
  if (hasTenants) {
    await knex.schema.table('tenants', (t) => {
      t.string('contact_email');
      t.string('phone');
      t.string('website');
      t.string('address_line1');
      t.string('address_line2');
      t.string('city');
      t.string('state');
      t.string('postal_code');
      t.string('country').defaultTo('US');
      t.string('profile_image_url');
    });

    await knex.raw('UPDATE tenants SET contact_email = admin_email WHERE contact_email IS NULL');
  }

  const hasFunds = await knex.schema.hasTable('funds');
  if (hasFunds) {
    await knex.raw('ALTER TABLE funds DROP CONSTRAINT IF EXISTS funds_name_unique');
    await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS funds_tenant_id_name_unique ON funds (tenant_id, name)');
  }
};

exports.down = async function (knex) {
  const hasFunds = await knex.schema.hasTable('funds');
  if (hasFunds) {
    await knex.raw('DROP INDEX IF EXISTS funds_tenant_id_name_unique');
  }

  const hasTenants = await knex.schema.hasTable('tenants');
  if (hasTenants) {
    await knex.schema.table('tenants', (t) => {
      t.dropColumn('profile_image_url');
      t.dropColumn('country');
      t.dropColumn('postal_code');
      t.dropColumn('state');
      t.dropColumn('city');
      t.dropColumn('address_line2');
      t.dropColumn('address_line1');
      t.dropColumn('website');
      t.dropColumn('phone');
      t.dropColumn('contact_email');
    });
  }
};