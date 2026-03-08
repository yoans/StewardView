const router = require('express').Router();
const db = require('../models/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../models/auditLog');

const BACKUP_TABLES = [
  'users', 'bank_accounts', 'categories', 'funds', 'transactions',
  'fund_transactions', 'budgets', 'audit_log', 'bank_sync_log',
  'monthly_reports', 'givelify_contributions', 'data_backups', 'app_settings',
];

// GET /api/backups — list all backups
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const backups = await db('data_backups').orderBy('created_at', 'desc').limit(50);
    // Don't send full backup data in list view
    const list = backups.map(b => ({
      ...b,
      backup_data: undefined,
      has_data: !!b.backup_data,
    }));
    res.json(list);
  } catch (err) {
    console.error('List backups error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/backups — create a manual backup
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const backupData = {};
    let totalRows = 0;
    const tablesBackedUp = [];

    for (const table of BACKUP_TABLES) {
      try {
        const hasTable = await db.schema.hasTable(table);
        if (!hasTable) continue;
        const rows = await db(table).select('*');
        backupData[table] = rows;
        totalRows += rows.length;
        tablesBackedUp.push(table);
      } catch { /* table may not exist yet */ }
    }

    const [id] = await db('data_backups').insert({
      backup_type: req.body.type || 'manual',
      status: 'success',
      tables_included: JSON.stringify(tablesBackedUp),
      row_count: totalRows,
      backup_data: JSON.stringify(backupData),
      created_by: req.user.id,
    });

    await logAudit({
      entityType: 'backup', entityId: id, action: 'create',
      newValues: { type: 'manual', tables: tablesBackedUp.length, rows: totalRows },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    res.status(201).json({
      id,
      message: `Backup created: ${tablesBackedUp.length} tables, ${totalRows} rows`,
      tables: tablesBackedUp,
      row_count: totalRows,
    });
  } catch (err) {
    console.error('Create backup error:', err);

    // Log failed backup
    try {
      await db('data_backups').insert({
        backup_type: req.body.type || 'manual',
        status: 'failed',
        error_message: err.message,
        created_by: req.user.id,
      });
    } catch { /* ignore */ }

    res.status(500).json({ error: 'Backup failed: ' + err.message });
  }
});

// GET /api/backups/:id/download — download a backup as JSON
router.get('/:id/download', authenticate, authorize('admin'), async (req, res) => {
  try {
    const backup = await db('data_backups').where({ id: req.params.id }).first();
    if (!backup) return res.status(404).json({ error: 'Backup not found' });
    if (!backup.backup_data) return res.status(404).json({ error: 'No backup data available' });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=hrcoc-backup-${backup.id}-${new Date(backup.created_at).toISOString().slice(0, 10)}.json`);
    res.send(backup.backup_data);
  } catch (err) {
    console.error('Download backup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/backups/:id — delete old backup (keep audit trail)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const backup = await db('data_backups').where({ id: req.params.id }).first();
    if (!backup) return res.status(404).json({ error: 'Backup not found' });

    await db('data_backups').where({ id: req.params.id }).update({
      backup_data: null,
      status: 'deleted',
    });

    await logAudit({
      entityType: 'backup', entityId: backup.id, action: 'delete',
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
    });

    res.json({ message: 'Backup data deleted' });
  } catch (err) {
    console.error('Delete backup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
