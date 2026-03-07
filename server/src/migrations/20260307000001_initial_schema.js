/**
 * Core schema: users, accounts, categories, transactions, funds, budgets, audit_log
 */
exports.up = function (knex) {
  return knex.schema
    // ── Users ───────────────────────────────────────────────
    .createTable('users', (t) => {
      t.increments('id').primary();
      t.string('email').notNullable().unique();
      t.string('password_hash').notNullable();
      t.string('name').notNullable();
      t.string('role').notNullable().defaultTo('viewer');
      t.boolean('is_active').defaultTo(true);
      t.timestamps(true, true);
    })

    // ── Bank Accounts ───────────────────────────────────────
    .createTable('bank_accounts', (t) => {
      t.increments('id').primary();
      t.string('name').notNullable(); // e.g. "BOA Checking"
      t.string('institution').notNullable(); // e.g. "Bank of America"
      t.string('account_mask'); // last 4 digits
      t.string('plaid_account_id'); // Plaid account id
      t.string('plaid_access_token'); // encrypted Plaid access token
      t.decimal('current_balance', 14, 2).defaultTo(0);
      t.decimal('available_balance', 14, 2).defaultTo(0);
      t.timestamp('balance_last_updated');
      t.boolean('is_active').defaultTo(true);
      t.timestamps(true, true);
    })

    // ── Categories ──────────────────────────────────────────
    .createTable('categories', (t) => {
      t.increments('id').primary();
      t.string('name').notNullable();
      t.string('type').notNullable();
      t.string('description');
      t.integer('parent_id').unsigned().references('id').inTable('categories');
      t.boolean('is_active').defaultTo(true);
      t.timestamps(true, true);
    })

    // ── Earmarked Funds ─────────────────────────────────────
    .createTable('funds', (t) => {
      t.increments('id').primary();
      t.string('name').notNullable().unique(); // e.g. "Missions", "Building Fund"
      t.string('description');
      t.decimal('target_amount', 14, 2); // optional goal
      t.decimal('current_balance', 14, 2).defaultTo(0);
      t.boolean('is_restricted').defaultTo(false); // donor-restricted?
      t.boolean('is_active').defaultTo(true);
      t.timestamps(true, true);
    })

    // ── Transactions ────────────────────────────────────────
    .createTable('transactions', (t) => {
      t.increments('id').primary();
      t.string('ref_number').notNullable().unique(); // public reference
      t.string('type').notNullable(); // 'income', 'expense', 'transfer'
      t.decimal('amount', 14, 2).notNullable();
      t.date('date').notNullable();
      t.string('description').notNullable();
      t.string('payee_payer'); // who paid or received
      t.string('check_number');
      t.integer('category_id').unsigned().references('id').inTable('categories');
      t.integer('bank_account_id').unsigned().references('id').inTable('bank_accounts');
      t.integer('fund_id').unsigned().references('id').inTable('funds');
      t.string('status').defaultTo('pending'); // 'pending', 'cleared', 'reconciled', 'void'
      t.string('receipt_url'); // optional attachment
      t.text('notes');
      t.integer('created_by').unsigned().references('id').inTable('users');
      t.integer('approved_by').unsigned().references('id').inTable('users');
      t.timestamps(true, true);
    })

    // ── Fund Transactions (directed contributions ledger) ───
    .createTable('fund_transactions', (t) => {
      t.increments('id').primary();
      t.integer('fund_id').unsigned().notNullable().references('id').inTable('funds');
      t.integer('transaction_id').unsigned().references('id').inTable('transactions');
      t.string('type').notNullable();
      t.decimal('amount', 14, 2).notNullable();
      t.date('date').notNullable();
      t.string('description');
      t.string('donor_name'); // optional, for directed gifts
      t.integer('created_by').unsigned().references('id').inTable('users');
      t.timestamps(true, true);
    })

    // ── Budgets ─────────────────────────────────────────────
    .createTable('budgets', (t) => {
      t.increments('id').primary();
      t.integer('year').notNullable();
      t.integer('month').notNullable(); // 1-12, or 0 for annual
      t.integer('category_id').unsigned().notNullable().references('id').inTable('categories');
      t.decimal('budgeted_amount', 14, 2).notNullable();
      t.text('notes');
      t.integer('created_by').unsigned().references('id').inTable('users');
      t.timestamps(true, true);
      t.unique(['year', 'month', 'category_id']);
    })

    // ── Audit Log ───────────────────────────────────────────
    .createTable('audit_log', (t) => {
      t.increments('id').primary();
      t.string('entity_type').notNullable(); // 'transaction', 'budget', 'fund', etc.
      t.integer('entity_id').notNullable();
      t.string('action').notNullable(); // 'create', 'update', 'delete', 'approve'
      t.text('old_values'); // JSON string
      t.text('new_values'); // JSON string
      t.string('change_reason');
      t.integer('user_id').unsigned().references('id').inTable('users');
      t.string('user_name');
      t.string('ip_address');
      t.timestamp('created_at').defaultTo(knex.fn.now());
    })

    // ── Bank Sync Log ───────────────────────────────────────
    .createTable('bank_sync_log', (t) => {
      t.increments('id').primary();
      t.integer('bank_account_id').unsigned().references('id').inTable('bank_accounts');
      t.string('status').notNullable();
      t.integer('transactions_synced').defaultTo(0);
      t.text('error_message');
      t.timestamp('synced_at').defaultTo(knex.fn.now());
    })

    // ── Monthly Reports Archive ─────────────────────────────
    .createTable('monthly_reports', (t) => {
      t.increments('id').primary();
      t.integer('year').notNullable();
      t.integer('month').notNullable();
      t.string('file_path');
      t.text('summary_json'); // cached report data
      t.integer('generated_by').unsigned().references('id').inTable('users');
      t.timestamp('generated_at').defaultTo(knex.fn.now());
      t.unique(['year', 'month']);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('monthly_reports')
    .dropTableIfExists('bank_sync_log')
    .dropTableIfExists('audit_log')
    .dropTableIfExists('budgets')
    .dropTableIfExists('fund_transactions')
    .dropTableIfExists('transactions')
    .dropTableIfExists('funds')
    
    .dropTableIfExists('categories')
    .dropTableIfExists('bank_accounts')
    .dropTableIfExists('users');
};
