/**
 * A spending category is already handled when an active recurring transfer
 * moves that amount into a matching fund. Those transfers are not bills.
 */
function compactName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\bfunds?\b/g, '')
    .replace(/[^a-z]/g, '');
}

function categoryCoveredByFund(categoryName, fundName) {
  const fund = compactName(fundName);
  const category = compactName(categoryName);
  if (fund.length < 4 || category.length < 4) return false;
  return category.startsWith(fund) || fund.startsWith(category);
}

function coverageForCategories(categories, transfers) {
  const active = (transfers || []).filter((transfer) => transfer.is_active !== false && transfer.is_active !== 0);
  const covered = new Map();
  for (const category of categories || []) {
    if (category.type && category.type !== 'expense') continue;
    const hits = active.filter((transfer) => categoryCoveredByFund(category.name, transfer.fund_name || transfer.to_fund_name));
    if (!hits.length) continue;
    covered.set(Number(category.id), {
      amount: hits.reduce((sum, transfer) => sum + (parseFloat(transfer.amount) || 0), 0),
      fund_name: hits[0].fund_name || hits[0].to_fund_name,
    });
  }
  return covered;
}

module.exports = {
  compactName,
  categoryCoveredByFund,
  coverageForCategories,
};
