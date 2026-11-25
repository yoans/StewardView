/**
 * The "home" tenant is the original church StewardView was built for.
 * Workbook-specific setup (category renames, bank rules for its own payees)
 * applies only to it; every other organization gets generic defaults.
 *
 * Set HOME_TENANT_ID to override. Defaults to 1, the tenant that pre-existing
 * data was assigned to when multi-tenancy was introduced.
 */
function homeTenantId() {
  const raw = process.env.HOME_TENANT_ID;
  if (raw === '' || raw === 'none') return null;
  const id = parseInt(raw || '1', 10);
  return Number.isFinite(id) ? id : null;
}

function isHomeTenant(tenantId) {
  const home = homeTenantId();
  return home != null && tenantId != null && Number(tenantId) === home;
}

module.exports = { homeTenantId, isHomeTenant };
