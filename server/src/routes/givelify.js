const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { parse } = require('csv-parse/sync');
const db = require('../models/db');
const { authenticate, authorize } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { logAudit } = require('../models/auditLog');

// ── Givelify Envelope → Fund mapping rules ──────────────
const DEFAULT_ENVELOPE_MAP = {
  'tithe': 'General Fund',
  'tithes': 'General Fund',
  'offering': 'General Fund',
  'offerings': 'General Fund',
  'general': 'General Fund',
  'general fund': 'General Fund',
  'general offering': 'General Fund',
  'tithes and offerings': 'General Fund',
  'tithes & offerings': 'General Fund',
  'missions': 'Missions Fund',
  'mission': 'Missions Fund',
  'missions fund': 'Missions Fund',
  'building': 'Building Fund',
  'building fund': 'Building Fund',
  'benevolence': 'Benevolence Fund',
  'benevolence fund': 'Benevolence Fund',
  'youth': 'Youth Fund',
  'youth ministry': 'Youth Fund',
  'youth fund': 'Youth Fund',
};

function parseMoney(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const isNegative = /^\(.+\)$/.test(text) || text.startsWith('-');
  const numeric = parseFloat(text.replace(/[$,()\s]/g, '').replace(/^-/, ''));
  if (Number.isNaN(numeric)) return null;
  return isNegative ? -numeric : numeric;
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  // ISO / datetime: 2026-03-01 or 2026-03-01T14:22:08Z
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const normalized = `${iso[1]}-${iso[2]}-${iso[3]}`;
    const parsed = new Date(`${normalized}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : normalized;
  }

  const dateParts = text.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!dateParts) return null;

  const [, first, second, third] = dateParts;
  let normalized;
  if (first.length === 4) {
    normalized = `${first}-${second.padStart(2, '0')}-${third.padStart(2, '0')}`;
  } else {
    const year = third.length === 2 ? `20${third}` : third;
    normalized = `${year}-${first.padStart(2, '0')}-${second.padStart(2, '0')}`;
  }

  const parsed = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized ? null : normalized;
}

function getField(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return String(row[key]).trim();
    }
  }
  return '';
}

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Map a raw CSV/object row into a normalized contribution shape. */
function normalizeContributionRow(raw) {
  const row = {};
  for (const [k, v] of Object.entries(raw || {})) {
    row[normalizeHeader(k)] = v;
  }

  const firstName = getField(row, ['donor_first_name', 'first_name', 'firstname', 'given_name']);
  const lastName = getField(row, ['donor_last_name', 'last_name', 'lastname', 'surname', 'family_name']);
  const fullName = getField(row, [
    'donor_name', 'donor', 'name', 'contributor_name', 'giver_name', 'member_name', 'full_name',
  ]);
  let donor_name = fullName;
  if (!donor_name && (firstName || lastName)) {
    donor_name = `${firstName} ${lastName}`.trim();
  }

  const donor_email = getField(row, ['donor_email', 'email', 'email_address', 'e_mail']) || null;

  // Prefer gross (what was given) for budget actuals; then amount; then net
  const amount =
    parseMoney(getField(row, ['gross_amount', 'gross', 'donation_amount', 'gift_amount', 'amount', 'total', 'total_amount'])) ??
    parseMoney(getField(row, ['net_amount', 'net']));

  const date = normalizeDate(getField(row, [
    'donation_date', 'transaction_date', 'date', 'gift_date', 'giving_date',
    'posted_date', 'disbursement_date', 'deposit_date',
  ]));

  const envelope = getField(row, [
    'envelope', 'envelope_name', 'campaign', 'campaign_name', 'fund', 'fund_name',
    'category', 'giving_type', 'designation', 'purpose',
  ]) || 'General';

  const givelify_id = getField(row, [
    'donation_id', 'givelify_id', 'transaction_id', 'txn_id', 'id', 'gift_id', 'payment_id',
  ]) || null;

  return {
    donor_name: donor_name || 'Anonymous',
    donor_email,
    amount,
    date,
    envelope,
    givelify_id,
    raw,
  };
}

function parseCsvText(csvText) {
  const text = String(csvText || '').replace(/^\uFEFF/, '').trim();
  if (!text) return [];

  const records = parse(text, {
    columns: (header) => header.map(normalizeHeader),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
    bom: true,
  });

  return records.map(normalizeContributionRow);
}

async function getEnvelopeMap(tenantId) {
  try {
    const setting = await db('app_settings').where({ key: 'givelify_envelope_map', tenant_id: tenantId }).first();
    if (setting && setting.value) return { ...DEFAULT_ENVELOPE_MAP, ...JSON.parse(setting.value) };
  } catch { /* ignore */ }
  return { ...DEFAULT_ENVELOPE_MAP };
}

async function findFundByName(fundName, tenantId) {
  if (!fundName) return null;
  const needle = String(fundName).trim().toLowerCase();
  const funds = await db('funds').where({ is_active: true, tenant_id: tenantId });
  const exact = funds.find((f) => f.name.toLowerCase() === needle);
  if (exact) return exact;
  // Match "Missions" to "Missions Fund"
  const withFund = funds.find((f) => f.name.toLowerCase() === `${needle} fund`);
  if (withFund) return withFund;
  const withoutFund = funds.find((f) => f.name.toLowerCase().replace(/\s+fund$/, '') === needle);
  if (withoutFund) return withoutFund;
  return null;
}

async function mapEnvelopeToFund(envelope, tenantId) {
  const normalized = (envelope || '').toLowerCase().trim();
  if (!normalized) return null;

  const map = await getEnvelopeMap(tenantId);

  if (map[normalized]) {
    const fund = await findFundByName(map[normalized], tenantId);
    if (fund) return fund;
  }

  // Partial key match (e.g. "Missions - March" → missions)
  const partialKeys = Object.keys(map)
    .filter((key) => key && (normalized.includes(key) || key.includes(normalized)))
    .sort((a, b) => b.length - a.length);
  for (const key of partialKeys) {
    const fund = await findFundByName(map[key], tenantId);
    if (fund) return fund;
  }

  // Direct fund name match
  return findFundByName(envelope, tenantId);
}

async function resolveIncomeCategoryId(fund, tenantId, trx = db) {
  const preferred = fund.name === 'General Fund' || !fund.is_restricted
    ? 'Tithes & Offerings'
    : 'Directed Contributions';
  const fallback = preferred === 'Tithes & Offerings' ? 'Directed Contributions' : 'Tithes & Offerings';

  let cat = await trx('categories').where({ name: preferred, type: 'income', tenant_id: tenantId }).first();
  if (cat) return cat.id;
  cat = await trx('categories').where({ name: fallback, type: 'income', tenant_id: tenantId }).first();
  if (cat) return cat.id;
  cat = await trx('categories').where({ type: 'income', tenant_id: tenantId }).orderBy('id').first();
  return cat ? cat.id : null;
}

/** StewardView does not store donor identity — keep that in Givelify. */
const ANON_DONOR_LABEL = null;

function sanitizeImportRaw(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const scrubbed = { ...raw };
  const piiKeys = [
    'donor_name', 'donor', 'name', 'full_name', 'first_name', 'last_name',
    'donor_first_name', 'donor_last_name', 'email', 'donor_email', 'email_address',
    'phone', 'address', 'member_id', 'external_member_id',
  ];
  for (const key of Object.keys(scrubbed)) {
    const norm = String(key).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (piiKeys.includes(norm) || norm.includes('name') || norm.includes('email') || norm.includes('phone')) {
      delete scrubbed[key];
    }
  }
  return scrubbed;
}

async function scrubExistingDonorPii(tenantId) {
  await db('givelify_contributions')
    .where({ tenant_id: tenantId })
    .update({ donor_name: null, donor_email: null });

  await db('transactions')
    .where({ tenant_id: tenantId })
    .where(function () {
      this.where('notes', 'like', '%Givelify%')
        .orWhere('description', 'like', 'Givelify%');
    })
    .update({
      payee_payer: 'Givelify',
    });

  // Strip parenthetical donor names from older Givelify descriptions
  const dirty = await db('transactions')
    .where({ tenant_id: tenantId })
    .where('description', 'like', 'Givelify - %(%')
    .select('id', 'description');
  for (const row of dirty) {
    const cleaned = String(row.description).replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (cleaned && cleaned !== row.description) {
      await db('transactions').where({ id: row.id }).update({ description: cleaned });
    }
  }

  await db('fund_transactions')
    .where({ tenant_id: tenantId })
    .where('description', 'like', 'Givelify%')
    .update({ donor_name: null });
}

async function createEarmarkRecords({ gc, fund, amount, date, userId, tenantId, trx, notePrefix = 'Imported from Givelify' }) {
  const ref_number = uuidv4();
  const categoryId = await resolveIncomeCategoryId(fund, tenantId, trx);
  const envelope = gc.envelope || 'General';

  const [{ id: txnId }] = await trx('transactions').insert({
    ref_number,
    type: 'income',
    amount,
    date,
    description: `Givelify - ${envelope}`,
    payee_payer: 'Givelify',
    category_id: categoryId,
    bank_account_id: null, // Givelify gifts drive funds; cash hits the bank as a separate deposit
    fund_id: fund.id,
    status: 'cleared',
    notes: `${notePrefix}. ID: ${gc.givelify_id || 'N/A'}`,
    created_by: userId,
    tenant_id: tenantId,
  }).returning('id');

  await trx('fund_transactions').insert({
    fund_id: fund.id,
    transaction_id: txnId,
    type: 'contribution',
    amount,
    date,
    description: `Givelify: ${envelope}`,
    donor_name: ANON_DONOR_LABEL,
    created_by: userId,
    tenant_id: tenantId,
  });

  await trx('funds').where({ id: fund.id, tenant_id: tenantId }).increment('current_balance', amount);

  await trx('givelify_contributions').where({ id: gc.id }).update({
    status: 'imported',
    transaction_id: txnId,
    fund_id: fund.id,
    fund_mapping: fund.name,
    donor_name: null,
    donor_email: null,
  });

  return txnId;
}

function localMonthStart() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

// GET /api/givelify — list imported contributions
router.get('/', authenticate, requireTenant, async (req, res) => {
  try {
    const { status, start_date, end_date } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    let query = db('givelify_contributions')
      .leftJoin('funds', 'givelify_contributions.fund_id', 'funds.id')
      .select(
        'givelify_contributions.id',
        'givelify_contributions.givelify_id',
        'givelify_contributions.amount',
        'givelify_contributions.date',
        'givelify_contributions.envelope',
        'givelify_contributions.fund_mapping',
        'givelify_contributions.fund_id',
        'givelify_contributions.transaction_id',
        'givelify_contributions.status',
        'givelify_contributions.created_at',
        'funds.name as fund_name'
      )
      .where('givelify_contributions.tenant_id', req.tenantId)
      .orderBy('givelify_contributions.date', 'desc')
      .limit(limit)
      .offset(offset);
    if (status) query = query.where('givelify_contributions.status', status);
    if (start_date) query = query.where('givelify_contributions.date', '>=', start_date);
    if (end_date) query = query.where('givelify_contributions.date', '<=', end_date);
    const rows = await query;
    res.json(rows);
  } catch (err) {
    console.error('Givelify list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/givelify/summary — dashboard stats
router.get('/summary', authenticate, requireTenant, async (req, res) => {
  try {
    const startDate = localMonthStart();
    const total = await db('givelify_contributions')
      .where('status', '!=', 'void').where('tenant_id', req.tenantId)
      .sum('amount as total').first();
    const monthTotal = await db('givelify_contributions')
      .where('status', '!=', 'void').where('tenant_id', req.tenantId)
      .where('date', '>=', startDate)
      .sum('amount as total').first();
    const pending = await db('givelify_contributions')
      .where({ status: 'pending', tenant_id: req.tenantId }).count('* as count').first();
    res.json({
      total_all_time: parseFloat(total.total) || 0,
      total_this_month: parseFloat(monthTotal.total) || 0,
      pending_count: parseInt(pending.count) || 0,
    });
  } catch (err) {
    console.error('Givelify summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/givelify/import — import from CSV text and/or contribution objects
router.post('/import', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const { contributions: bodyContributions, csv } = req.body;

    let rows = [];
    if (typeof csv === 'string' && csv.trim()) {
      try {
        rows = parseCsvText(csv);
      } catch (parseErr) {
        return res.status(400).json({ error: `Invalid CSV: ${parseErr.message}` });
      }
    } else if (Array.isArray(bodyContributions) && bodyContributions.length > 0) {
      rows = bodyContributions.map(normalizeContributionRow);
    } else {
      return res.status(400).json({ error: 'Provide a csv string or contributions array' });
    }

    const results = { imported: 0, skipped: 0, auto_earmarked: 0, pending: 0, errors: [], scrubbed_existing_pii: true };
    const seenIds = new Set();

    // Refresh anonymity for any previously imported donor details (no seed / demo data)
    await scrubExistingDonorPii(req.tenantId);

    for (let i = 0; i < rows.length; i++) {
      const c = rows[i];
      const rowNum = i + 2; // header is row 1

      try {
        if (c.amount == null || Number.isNaN(c.amount) || c.amount <= 0) {
          results.errors.push({ row: rowNum, error: `Invalid or missing amount` });
          continue;
        }
        if (!c.date) {
          results.errors.push({ row: rowNum, error: `Invalid or missing date` });
          continue;
        }

        const amount = Math.round(Math.abs(c.amount) * 100) / 100;

        if (c.givelify_id) {
          if (seenIds.has(c.givelify_id)) {
            results.skipped++;
            continue;
          }
          seenIds.add(c.givelify_id);
          const existing = await db('givelify_contributions')
            .where({ givelify_id: c.givelify_id, tenant_id: req.tenantId })
            .first();
          if (existing) {
            results.skipped++;
            continue;
          }
        }

        const fund = await mapEnvelopeToFund(c.envelope, req.tenantId);
        const safeRaw = sanitizeImportRaw(c.raw || {
          amount: c.amount,
          date: c.date,
          envelope: c.envelope,
          givelify_id: c.givelify_id,
        });

        await db.transaction(async (trx) => {
          const [{ id: gcId }] = await trx('givelify_contributions').insert({
            givelify_id: c.givelify_id || null,
            donor_name: null,
            donor_email: null,
            amount,
            date: c.date,
            envelope: c.envelope || 'General',
            fund_mapping: fund ? fund.name : null,
            fund_id: fund ? fund.id : null,
            status: 'pending',
            raw_data: JSON.stringify(safeRaw),
            tenant_id: req.tenantId,
          }).returning('id');

          if (fund) {
            await createEarmarkRecords({
              gc: {
                id: gcId,
                envelope: c.envelope,
                givelify_id: c.givelify_id,
              },
              fund,
              amount,
              date: c.date,
              userId: req.user.id,
              tenantId: req.tenantId,
              trx,
              notePrefix: 'Auto-imported from Givelify',
            });
            results.auto_earmarked++;
          } else {
            results.pending++;
          }

          results.imported++;
        });
      } catch (rowErr) {
        results.errors.push({ row: rowNum, error: rowErr.message });
      }
    }

    await logAudit({
      entityType: 'givelify', entityId: 0, action: 'import',
      newValues: {
        imported: results.imported,
        skipped: results.skipped,
        auto_earmarked: results.auto_earmarked,
        pending: results.pending,
        error_count: results.errors.length,
        donor_pii_scrubbed: true,
      },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
      tenantId: req.tenantId || req.user?.tenant_id || null,
    });

    res.json(results);
  } catch (err) {
    console.error('Givelify import error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/givelify/:id/earmark — manually earmark a pending Givelify contribution
router.post('/:id/earmark', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const gc = await db('givelify_contributions').where({ id: req.params.id, tenant_id: req.tenantId }).first();
    if (!gc) return res.status(404).json({ error: 'Contribution not found' });
    if (gc.status === 'imported') return res.status(400).json({ error: 'Already imported' });

    const { fund_id } = req.body;
    const fund = await db('funds').where({ id: fund_id, tenant_id: req.tenantId, is_active: true }).first();
    if (!fund) return res.status(404).json({ error: 'Fund not found' });

    const amount = parseFloat(gc.amount);

    let txnId;
    await db.transaction(async (trx) => {
      txnId = await createEarmarkRecords({
        gc,
        fund,
        amount,
        date: gc.date,
        userId: req.user.id,
        tenantId: req.tenantId,
        trx,
        notePrefix: 'Manually earmarked from Givelify',
      });
    });

    await logAudit({
      entityType: 'givelify', entityId: gc.id, action: 'earmark',
      newValues: { fund_id, fund_name: fund.name, amount },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
      tenantId: req.tenantId || req.user?.tenant_id || null,
    });

    res.json({ message: 'Contribution earmarked and imported', transaction_id: txnId });
  } catch (err) {
    console.error('Givelify earmark error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/givelify/envelope-map — get current envelope→fund mapping
router.get('/envelope-map', authenticate, requireTenant, async (req, res) => {
  const map = await getEnvelopeMap(req.tenantId);
  res.json(map);
});

// PUT /api/givelify/envelope-map — update envelope→fund mapping
router.put('/envelope-map', authenticate, requireTenant, authorize('admin', 'treasurer'), async (req, res) => {
  try {
    const { map } = req.body;
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
      return res.status(400).json({ error: 'map object is required' });
    }

    // Normalize keys; validate fund names exist when possible
    const normalized = {};
    for (const [key, fundName] of Object.entries(map)) {
      const k = String(key || '').toLowerCase().trim();
      const v = String(fundName || '').trim();
      if (k && v) normalized[k] = v;
    }

    const existing = await db('app_settings').where({ key: 'givelify_envelope_map', tenant_id: req.tenantId }).first();
    if (existing) {
      await db('app_settings').where({ key: 'givelify_envelope_map', tenant_id: req.tenantId }).update({
        value: JSON.stringify(normalized),
        updated_at: new Date().toISOString(),
      });
    } else {
      await db('app_settings').insert({
        key: 'givelify_envelope_map',
        value: JSON.stringify(normalized),
        tenant_id: req.tenantId,
      });
    }
    await logAudit({
      entityType: 'settings', entityId: 0, action: 'update',
      newValues: { givelify_envelope_map: normalized },
      userId: req.user.id, userName: req.user.name, ipAddress: req.ip,
      tenantId: req.tenantId || req.user?.tenant_id || null,
    });
    res.json({ message: 'Envelope mapping updated', map: { ...DEFAULT_ENVELOPE_MAP, ...normalized } });
  } catch (err) {
    console.error('Update envelope map error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
