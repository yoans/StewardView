/**
 * Budget categories in workbook order.
 * sort_order keeps Build Budget and the monthly view in that order.
 * group_name is the section header.
 */

const CHURCH_CATEGORIES = [
  { name: 'General Contributions', type: 'income', group_name: 'Giving', description: 'Plate, check, and other general contributions', sort_order: 10 },
  { name: 'Online Contributions', type: 'income', group_name: 'Giving', description: 'Givelify and other online giving', sort_order: 20 },
  { name: 'Interest', type: 'income', group_name: 'Giving', description: 'Bank interest', sort_order: 30 },

  { name: 'Preacher Salary', type: 'expense', group_name: 'Payroll', description: 'Minister compensation', sort_order: 100 },
  { name: 'Payroll Taxes', type: 'expense', group_name: 'Payroll', description: 'Employer payroll taxes', sort_order: 110 },
  { name: 'Payroll Service Fee', type: 'expense', group_name: 'Payroll', description: 'Payroll processor fee', sort_order: 120 },

  { name: 'Property Insurance', type: 'expense', group_name: 'Insurance', description: 'Property and liability insurance', sort_order: 200 },

  { name: 'Electric', type: 'expense', group_name: 'Utilities', description: 'Electric utility', sort_order: 300 },
  { name: 'Gas', type: 'expense', group_name: 'Utilities', description: 'Gas utility', sort_order: 310 },
  { name: 'Water/Sewer', type: 'expense', group_name: 'Utilities', description: 'Water and sewer', sort_order: 320 },
  { name: 'Phone/Internet', type: 'expense', group_name: 'Utilities', description: 'Phone and internet', sort_order: 330 },

  { name: 'Equipment', type: 'expense', group_name: 'Maintenance', description: 'Equipment maintenance', sort_order: 400 },
  { name: 'Grounds', type: 'expense', group_name: 'Maintenance', description: 'Lawn, snow, and grounds', sort_order: 410 },
  { name: 'Buildings', type: 'expense', group_name: 'Maintenance', description: 'Building repairs paid from the Building Fund', sort_order: 420 },
  { name: 'Janitorial Supplies/Services', type: 'expense', group_name: 'Maintenance', description: 'Janitorial supplies and services', sort_order: 430 },

  { name: 'Benevolence', type: 'expense', group_name: 'Ministry', description: 'Help paid from the Benevolence Fund', sort_order: 500 },
  { name: 'Mission Support', type: 'expense', group_name: 'Ministry', description: 'Mission support paid from the Missions Fund', sort_order: 510 },
  { name: 'Youth Programs/Activities', type: 'expense', group_name: 'Ministry', description: 'Youth activities paid from the Youth Fund', sort_order: 520 },

  { name: 'Office Supplies', type: 'expense', group_name: 'Miscellaneous', description: 'Office supplies and postage', sort_order: 600 },
  { name: 'Kitchen Supplies', type: 'expense', group_name: 'Miscellaneous', description: 'Kitchen supplies', sort_order: 610 },
  { name: 'Communion Supplies', type: 'expense', group_name: 'Miscellaneous', description: 'Communion supplies', sort_order: 620 },
  { name: 'Class Materials', type: 'expense', group_name: 'Miscellaneous', description: 'Bible class materials', sort_order: 630 },
  { name: 'IT Supplies/Services', type: 'expense', group_name: 'Miscellaneous', description: 'Computers, software, and IT services', sort_order: 640 },
  { name: 'Other', type: 'expense', group_name: 'Miscellaneous', description: 'Other expenses', sort_order: 650 },
];

/** Old names → current workbook names. */
const CATEGORY_RENAMES = {
  'Tithes & Offerings': 'General Contributions',
  Offering: 'General Contributions',
  'Interest Income': 'Interest',
  Insurance: 'Property Insurance',
  'Missions & Outreach': 'Mission Support',
  'Youth Programs': 'Youth Programs/Activities',
};

/**
 * Monthly spending plan from the workbook.
 * Benevolence, Missions, Youth, and Buildings are omitted: those amounts
 * already move as automatic fund transfers and are not bills.
 */
const MONTHLY_SPENDING_PLAN = {
  'Preacher Salary': 3933.64,
  'Payroll Taxes': 1249.11,
  'Payroll Service Fee': 67.0,
  'Property Insurance': 793.72,
  Electric: 117.22,
  Gas: 134.83,
  'Water/Sewer': 286.86,
  'Phone/Internet': 142.02,
  Equipment: 15.0,
  Grounds: 300.0,
  'Janitorial Supplies/Services': 500.0,
  'Office Supplies': 20.0,
  'Kitchen Supplies': 15.0,
  'Communion Supplies': 50.0,
  'Class Materials': 50.0,
  'IT Supplies/Services': 50.0,
  Other: 20.0,
};

module.exports = {
  CHURCH_CATEGORIES,
  CATEGORY_RENAMES,
  MONTHLY_SPENDING_PLAN,
};
