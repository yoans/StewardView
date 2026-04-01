const db = require('./db');

/**
 * Append a row to the audit_log table.
 */
async function logAudit({ entityType, entityId, action, oldValues, newValues, changeReason, userId, userName, ipAddress, tenantId }) {
  return db('audit_log').insert({
    entity_type: entityType,
    entity_id: entityId,
    action,
    old_values: oldValues ? JSON.stringify(oldValues) : null,
    new_values: newValues ? JSON.stringify(newValues) : null,
    change_reason: changeReason || null,
    user_id: userId || null,
    user_name: userName || null,
    ip_address: ipAddress || null,
    tenant_id: tenantId || null,
  });
}

/**
 * Retrieve audit history for a specific entity.
 */
async function getAuditHistory(entityType, entityId) {
  return db('audit_log')
    .where({ entity_type: entityType, entity_id: entityId })
    .orderBy('created_at', 'desc');
}

/**
 * Retrieve full audit log with optional filters.
 */
async function getAuditLog({ tenantId, entityType, userId, startDate, endDate, limit = 100, offset = 0 }) {
  if (!tenantId) throw new Error('tenantId is required for audit log queries');
  let query = db('audit_log').where('tenant_id', tenantId).orderBy('created_at', 'desc').limit(limit).offset(offset);
  if (entityType) query = query.where('entity_type', entityType);
  if (userId) query = query.where('user_id', userId);
  if (startDate) query = query.where('created_at', '>=', startDate);
  if (endDate) query = query.where('created_at', '<=', endDate);
  return query;
}

module.exports = { logAudit, getAuditHistory, getAuditLog };
