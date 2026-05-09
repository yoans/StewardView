const bcrypt = require('bcryptjs');

exports.seed = async function (knex) {
  if (process.env.NODE_ENV === 'production') {
    console.error('REFUSED: seed data must not run in production');
    return;
  }
  // Clear tables in order
  await knex('monthly_reports').del();
  try { await knex('password_reset_tokens').del(); } catch { /* ok */ }
  try { await knex('mfa_codes').del(); } catch { /* ok */ }
  await knex('audit_log').del();
  await knex('budgets').del();
  await knex('fund_transactions').del();
  await knex('transactions').del();
  await knex('funds').del();
  await knex('categories').del();
  await knex('bank_accounts').del();
  await knex('users').del();

  // Clear new tables (may not exist on first run)
  try { await knex('givelify_contributions').del(); } catch { /* ok */ }
  try { await knex('data_backups').del(); } catch { /* ok */ }
  try { await knex('app_settings').del(); } catch { /* ok */ }

  // ── Optional local bootstrap admins ───────────────────
  // Set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD and, optionally,
  // SEED_SECOND_ADMIN_EMAIL / SEED_SECOND_ADMIN_PASSWORD for local setup.
  // Production startup never runs seeds.
  const seedAdmins = [];
  if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
    seedAdmins.push({
      id: 1,
      email: process.env.SEED_ADMIN_EMAIL,
      password_hash: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD, 10),
      name: process.env.SEED_ADMIN_NAME || 'Administrator',
      role: 'admin',
      tenant_id: 1,
    });
  }
  if (process.env.SEED_SECOND_ADMIN_EMAIL && process.env.SEED_SECOND_ADMIN_PASSWORD) {
    seedAdmins.push({
      id: 2,
      email: process.env.SEED_SECOND_ADMIN_EMAIL,
      password_hash: await bcrypt.hash(process.env.SEED_SECOND_ADMIN_PASSWORD, 10),
      name: process.env.SEED_SECOND_ADMIN_NAME || 'Second Administrator',
      role: 'admin',
      tenant_id: 1,
    });
  }
  if (seedAdmins.length) await knex('users').insert(seedAdmins);

  // ── Categories ────────────────────────────────────────
  const incomeCategories = [
    { id: 1, name: 'Tithes & Offerings', type: 'income', description: 'General weekly contributions' },
    { id: 2, name: 'Directed Contributions', type: 'income', description: 'Funds given for specific purposes' },
    { id: 3, name: 'Special Events', type: 'income', description: 'VBS, fundraisers, etc.' },
    { id: 4, name: 'Interest Income', type: 'income', description: 'Bank interest' },
  ];

  const expenseCategories = [
    { id: 10, name: 'Salaries & Benefits', type: 'expense', description: 'Minister, staff compensation' },
    { id: 11, name: 'Utilities', type: 'expense', description: 'Electric, water, gas, internet' },
    { id: 12, name: 'Building & Maintenance', type: 'expense', description: 'Repairs, janitorial, insurance' },
    { id: 13, name: 'Missions & Outreach', type: 'expense', description: 'Supported missionaries and programs' },
    { id: 14, name: 'Benevolence', type: 'expense', description: 'Member and community assistance' },
    { id: 15, name: 'Education & Youth', type: 'expense', description: 'Bible classes, VBS, youth events' },
    { id: 16, name: 'Worship & Media', type: 'expense', description: 'A/V equipment, streaming, supplies' },
    { id: 17, name: 'Office & Administration', type: 'expense', description: 'Supplies, postage, software' },
    { id: 18, name: 'Insurance', type: 'expense', description: 'Property, liability insurance' },
    { id: 19, name: 'Mortgage / Rent', type: 'expense', description: 'Building payments' },
  ];

  await knex('categories').insert([...incomeCategories, ...expenseCategories]);

  // ── Earmarked Funds ───────────────────────────────────
  await knex('funds').insert([
    { id: 1, name: 'General Fund', description: 'Unrestricted general operating fund', current_balance: 0, is_restricted: false },
    { id: 2, name: 'Missions Fund', description: 'Designated for missionary support', current_balance: 0, is_restricted: true },
    { id: 3, name: 'Building Fund', description: 'Designated for building repairs and improvements', current_balance: 0, is_restricted: true },
    { id: 4, name: 'Benevolence Fund', description: 'Designated for member/community assistance', current_balance: 0, is_restricted: true },
    { id: 5, name: 'Youth Fund', description: 'Designated for youth activities and camp', current_balance: 0, is_restricted: true },
  ]);

  // Operational defaults stop here: no bank accounts, transactions, budgets,
  // or fund activity are seeded. Churches start with a clean ledger.
};
