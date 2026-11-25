/**
 * The "home" tenant is the original church StewardView was built for.
 * Workbook-specific setup (category renames, bank rules for its own payees)
 * applies only to it; every other organization gets generic defaults.
 *
 * Set HOME_TENANT_ID (production: 4). With it unset, no tenant is treated as
 * home, which is the safe default: everyone gets the generic behavior.
 */
function homeTenantId() {
  const id = parseInt(process.env.HOME_TENANT_ID || '', 10);
  return Number.isFinite(id) ? id : null;
}

function isHomeTenant(tenantId) {
  const home = homeTenantId();
  return home != null && tenantId != null && Number(tenantId) === home;
}

module.exports = { homeTenantId, isHomeTenant };
