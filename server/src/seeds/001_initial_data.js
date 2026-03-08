const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

exports.seed = async function (knex) {
  // Clear tables in order
  await knex('monthly_reports').del();
  await knex('bank_sync_log').del();
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

  // ── Users (2 admins required at minimum) ──────────────
  const passwordHash = await bcrypt.hash('changeme123', 10);

  await knex('users').insert([
    { id: 1, email: 'admin@hrcoc.org', password_hash: passwordHash, name: 'Admin User', role: 'admin' },
    { id: 2, email: 'treasurer@hrcoc.org', password_hash: passwordHash, name: 'Church Treasurer', role: 'admin' },
    { id: 3, email: 'elder@hrcoc.org', password_hash: passwordHash, name: 'Elder Member', role: 'elder' },
    { id: 4, email: 'viewer@hrcoc.org', password_hash: passwordHash, name: 'Church Member', role: 'viewer' },
  ]);

  // ── Bank Accounts ─────────────────────────────────────
  await knex('bank_accounts').insert([
    { id: 1, name: 'BOA Checking - General', institution: 'Bank of America', account_mask: '4521', current_balance: 45230.00, available_balance: 45230.00 },
    { id: 2, name: 'BOA Savings - Reserve', institution: 'Bank of America', account_mask: '7893', current_balance: 28500.00, available_balance: 28500.00 },
  ]);

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
    { id: 1, name: 'General Fund', description: 'Unrestricted general operating fund', current_balance: 35000.00, is_restricted: false },
    { id: 2, name: 'Missions Fund', description: 'Designated for missionary support', current_balance: 8500.00, target_amount: 24000.00, is_restricted: true },
    { id: 3, name: 'Building Fund', description: 'Designated for building repairs and improvements', current_balance: 12000.00, target_amount: 50000.00, is_restricted: true },
    { id: 4, name: 'Benevolence Fund', description: 'Designated for member/community assistance', current_balance: 3200.00, is_restricted: true },
    { id: 5, name: 'Youth Fund', description: 'Designated for youth activities and camp', current_balance: 2100.00, target_amount: 5000.00, is_restricted: true },
  ]);

  // ── Sample Transactions ───────────────────────────────
  const today = new Date();
  const thisMonth = today.toISOString().slice(0, 7);

  await knex('transactions').insert([
    { id: 1, ref_number: uuidv4(), type: 'income', amount: 4850.00, date: `${thisMonth}-01`, description: 'Sunday contribution - Week 1', category_id: 1, bank_account_id: 1, fund_id: 1, status: 'cleared', created_by: 1 },
    { id: 2, ref_number: uuidv4(), type: 'income', amount: 5200.00, date: `${thisMonth}-08`, description: 'Sunday contribution - Week 2', category_id: 1, bank_account_id: 1, fund_id: 1, status: 'cleared', created_by: 1 },
    { id: 3, ref_number: uuidv4(), type: 'income', amount: 1000.00, date: `${thisMonth}-08`, description: 'Directed gift - Missions (Smith family)', payee_payer: 'Smith Family', category_id: 2, bank_account_id: 1, fund_id: 2, status: 'cleared', created_by: 1 },
    { id: 4, ref_number: uuidv4(), type: 'expense', amount: 3500.00, date: `${thisMonth}-05`, description: 'Minister salary - March', payee_payer: 'Minister', category_id: 10, bank_account_id: 1, fund_id: 1, status: 'cleared', check_number: '1045', created_by: 1 },
    { id: 5, ref_number: uuidv4(), type: 'expense', amount: 450.00, date: `${thisMonth}-10`, description: 'Electric bill - March', payee_payer: 'Power Company', category_id: 11, bank_account_id: 1, fund_id: 1, status: 'cleared', check_number: '1046', created_by: 1 },
    { id: 6, ref_number: uuidv4(), type: 'expense', amount: 200.00, date: `${thisMonth}-12`, description: 'Benevolence assistance - groceries', payee_payer: 'Member Assistance', category_id: 14, bank_account_id: 1, fund_id: 4, status: 'cleared', created_by: 1 },
  ]);

  // ── Sample Fund Transactions ──────────────────────────
  await knex('fund_transactions').insert([
    { fund_id: 1, transaction_id: 1, type: 'contribution', amount: 4850.00, date: `${thisMonth}-01`, description: 'Weekly contribution', created_by: 1 },
    { fund_id: 1, transaction_id: 2, type: 'contribution', amount: 5200.00, date: `${thisMonth}-08`, description: 'Weekly contribution', created_by: 1 },
    { fund_id: 2, transaction_id: 3, type: 'contribution', amount: 1000.00, date: `${thisMonth}-08`, description: 'Directed gift - Smith family', donor_name: 'Smith Family', created_by: 1 },
    { fund_id: 1, transaction_id: 4, type: 'disbursement', amount: 3500.00, date: `${thisMonth}-05`, description: 'Minister salary', created_by: 1 },
    { fund_id: 1, transaction_id: 5, type: 'disbursement', amount: 450.00, date: `${thisMonth}-10`, description: 'Electric bill', created_by: 1 },
    { fund_id: 4, transaction_id: 6, type: 'disbursement', amount: 200.00, date: `${thisMonth}-12`, description: 'Benevolence assistance', created_by: 1 },
  ]);

  // ── Sample Budgets (Monthly for current year) ─────────
  const year = today.getFullYear();
  const monthlyBudgets = [];
  for (let month = 1; month <= 12; month++) {
    monthlyBudgets.push(
      { year, month, category_id: 1, budgeted_amount: 18000.00, created_by: 1 },   // Tithes
      { year, month, category_id: 2, budgeted_amount: 2000.00, created_by: 1 },    // Directed
      { year, month, category_id: 10, budgeted_amount: 3500.00, created_by: 1 },   // Salaries
      { year, month, category_id: 11, budgeted_amount: 500.00, created_by: 1 },    // Utilities
      { year, month, category_id: 12, budgeted_amount: 800.00, created_by: 1 },    // Building
      { year, month, category_id: 13, budgeted_amount: 2000.00, created_by: 1 },   // Missions
      { year, month, category_id: 14, budgeted_amount: 500.00, created_by: 1 },    // Benevolence
      { year, month, category_id: 15, budgeted_amount: 300.00, created_by: 1 },    // Education
      { year, month, category_id: 16, budgeted_amount: 200.00, created_by: 1 },    // Worship
      { year, month, category_id: 17, budgeted_amount: 150.00, created_by: 1 },    // Office
      { year, month, category_id: 18, budgeted_amount: 400.00, created_by: 1 },    // Insurance
      { year, month, category_id: 19, budgeted_amount: 2500.00, created_by: 1 },   // Mortgage
    );
  }
  await knex('budgets').insert(monthlyBudgets);

  // ── Audit log seed ────────────────────────────────────
  await knex('audit_log').insert([
    { entity_type: 'system', entity_id: 0, action: 'seed', new_values: '{"message":"Initial seed data loaded"}', user_id: 1, user_name: 'Church Treasurer' },
  ]);
};
