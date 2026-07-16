/**
 * Default budget categories aligned to a typical church checking workbook.
 * sort_order keeps Build Budget / vs-actual close to spreadsheet order.
 */

const CHURCH_CATEGORIES = [
  // Receipts
  { name: 'Offering', type: 'income', description: 'Weekly plate / check offerings', sort_order: 10 },
  { name: 'Online Contributions', type: 'income', description: 'Givelify and other online giving', sort_order: 20 },
  { name: 'Interest', type: 'income', description: 'Bank interest', sort_order: 30 },
  // Disbursements — payroll
  { name: 'Preacher Salary', type: 'expense', description: 'Minister compensation', sort_order: 100 },
  { name: 'Payroll Taxes', type: 'expense', description: 'Employer payroll taxes', sort_order: 110 },
  { name: 'Payroll Service Fee', type: 'expense', description: 'Payroll processor fees', sort_order: 120 },
  // Insurance
  { name: 'Property Insurance', type: 'expense', description: 'Property / liability insurance', sort_order: 200 },
  // Utilities
  { name: 'Electric', type: 'expense', description: 'Electric utility', sort_order: 300 },
  { name: 'Gas', type: 'expense', description: 'Gas utility', sort_order: 310 },
  { name: 'Water/Sewer', type: 'expense', description: 'Water and sewer', sort_order: 320 },
  { name: 'Phone/Internet', type: 'expense', description: 'Phone and internet', sort_order: 330 },
  // Maintenance
  { name: 'Equipment', type: 'expense', description: 'Equipment maintenance / purchase', sort_order: 400 },
  { name: 'Grounds', type: 'expense', description: 'Lawn, snow, grounds upkeep', sort_order: 410 },
  { name: 'Sanctuary', type: 'expense', description: 'Sanctuary maintenance', sort_order: 420 },
  { name: 'Annex', type: 'expense', description: 'Annex maintenance', sort_order: 430 },
  { name: 'Parsonage', type: 'expense', description: 'Parsonage maintenance', sort_order: 440 },
  // Outreach
  { name: 'Benevolence', type: 'expense', description: 'Member and community assistance', sort_order: 500 },
  { name: 'Mission Support', type: 'expense', description: 'Missionaries and mission programs', sort_order: 510 },
  { name: 'LTC', type: 'expense', description: 'Lads to Leaders / Leadership Training for Christ', sort_order: 520 },
  // Miscellaneous
  { name: 'Office Supplies', type: 'expense', description: 'Office supplies and postage', sort_order: 600 },
  { name: 'Kitchen Supplies', type: 'expense', description: 'Kitchen and fellowship supplies', sort_order: 610 },
  { name: 'Class Materials', type: 'expense', description: 'Bible class and curriculum materials', sort_order: 620 },
  { name: 'Other', type: 'expense', description: 'Miscellaneous expenses', sort_order: 630 },
  // Processing (used by Givelify fee posting)
  { name: 'Givelify Fees', type: 'expense', description: 'Online giving processing fees', sort_order: 700 },
];

/** Old seed names → new names (for migration remaps). */
const CATEGORY_RENAMES = {
  'Tithes & Offerings': 'Offering',
  'Interest Income': 'Interest',
  Insurance: 'Property Insurance',
  'Missions & Outreach': 'Mission Support',
};

/** Prefer these income names when posting Givelify gifts (online channel). */
const GIVELIFY_GENERAL_INCOME_NAMES = ['Online Contributions', 'Offering', 'Tithes & Offerings'];
const GIVELIFY_DIRECTED_INCOME_NAMES = ['Online Contributions', 'Offering', 'Directed Contributions'];

module.exports = {
  CHURCH_CATEGORIES,
  CATEGORY_RENAMES,
  GIVELIFY_GENERAL_INCOME_NAMES,
  GIVELIFY_DIRECTED_INCOME_NAMES,
};
