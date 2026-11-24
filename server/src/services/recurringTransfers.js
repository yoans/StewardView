const { logAudit } = require('../models/auditLog');
const { toCents, centsToDecimal, formatMoney } = require('../utils/money');
const { isoDate, todayInTimeZone, advancePeriod, initialNextRun } = require('../utils/dates');

function isActive(row) {
  return row.is_active === true || row.is_active === 1 || row.is_active === 't';
}

function transferDescription(transfer, fromName, toName, period, direction) {
  const custom = String(transfer.description || '').trim();
  const base = custom
    || (direction === 'out' ? `Recurring transfer to ${toName}` : `Recurring transfer from ${fromName}`);
  return `${base} (scheduled ${period})`.slice(0, 255);
}

function insufficientMessage(fromName, balanceCents, amountCents, period) {
  return `Not enough money in ${fromName} (${formatMoney(balanceCents)} on hand, ${formatMoney(amountCents)} needed) for ${period}. It can still run later today. After today, that date is skipped.`;
}

/**
 * Missed dates are not posted. Walk forward until the next date that is
 * still today or in the future. Post only when that date is today.
 */
function planTransfer(transfer, today) {
  const day = isoDate(today);
  let cursor = isoDate(transfer.next_run_date);
  if (!day || !cursor) return { action: 'invalid' };

  let skipped = 0;
  while (cursor < day && skipped < 36) {
    const next = advancePeriod(cursor, transfer);
    if (!next || next <= cursor) break;
    cursor = next;
    skipped += 1;
  }

  if (cursor > day) {
    return { action: skipped ? 'skip_missed' : 'wait', nextRun: cursor, skipped };
  }

  if (cursor < day) {
    return {
      action: 'skip_missed',
      nextRun: initialNextRun({
        frequency: transfer.frequency,
        dayOfMonth: transfer.day_of_month,
        dayOfWeek: transfer.day_of_week,
        today: day,
      }),
      skipped,
    };
  }

  return {
    action: 'post_today',
    period: cursor,
    nextRun: advancePeriod(cursor, transfer),
    skipped,
  };
}

async function postPeriod(db, transfer, period) {
  try {
    return await db.transaction(async (trx) => {
      const own = await trx('recurring_transfer_runs')
        .where({ recurring_transfer_id: transfer.id, period_date: period })
        .first();
      if (own) return { status: 'already_posted', period };

      const amountCents = toCents(transfer.amount);
      const duplicate = await trx('recurring_transfer_runs')
        .where({
          tenant_id: transfer.tenant_id,
          from_fund_id: transfer.from_fund_id,
          to_fund_id: transfer.to_fund_id,
          period_date: period,
          status: 'posted',
        })
        .whereRaw('ROUND(amount * 100) = ?', [amountCents])
        .first();
      if (duplicate) return { status: 'already_posted', period };

      const locked = await trx('funds')
        .whereIn('id', [transfer.from_fund_id, transfer.to_fund_id])
        .where({ tenant_id: transfer.tenant_id })
        .orderBy('id', 'asc')
        .forUpdate();
      const fromFund = locked.find((fund) => Number(fund.id) === Number(transfer.from_fund_id));
      const toFund = locked.find((fund) => Number(fund.id) === Number(transfer.to_fund_id));
      if (!fromFund || !toFund || fromFund.is_active === false || toFund.is_active === false) {
        return { status: 'missing_fund', period };
      }

      const balanceCents = toCents(fromFund.current_balance);
      if (balanceCents == null || amountCents == null || amountCents <= 0) {
        return { status: 'invalid_amount', period };
      }
      if (balanceCents < amountCents) {
        return {
          status: 'skipped_insufficient',
          period,
          balanceCents,
          amountCents,
          fromName: fromFund.name,
          toName: toFund.name,
        };
      }

      const amountDec = centsToDecimal(amountCents);
      await trx('fund_transactions').insert({
        fund_id: fromFund.id,
        type: 'transfer_out',
        amount: amountDec,
        date: period,
        description: transferDescription(transfer, fromFund.name, toFund.name, period, 'out'),
        created_by: transfer.created_by || null,
        tenant_id: transfer.tenant_id,
      });
      await trx('funds').where({ id: fromFund.id }).update({
        current_balance: trx.raw('ROUND((current_balance - ?)::numeric, 2)', [amountDec]),
      });
      await trx('fund_transactions').insert({
        fund_id: toFund.id,
        type: 'transfer_in',
        amount: amountDec,
        date: period,
        description: transferDescription(transfer, fromFund.name, toFund.name, period, 'in'),
        created_by: transfer.created_by || null,
        tenant_id: transfer.tenant_id,
      });
      await trx('funds').where({ id: toFund.id }).update({
        current_balance: trx.raw('ROUND((current_balance + ?)::numeric, 2)', [amountDec]),
      });
      await trx('recurring_transfer_runs').insert({
        recurring_transfer_id: transfer.id,
        tenant_id: transfer.tenant_id,
        period_date: period,
        status: 'posted',
        amount: amountDec,
        from_fund_id: transfer.from_fund_id,
        to_fund_id: transfer.to_fund_id,
        description: transferDescription(transfer, fromFund.name, toFund.name, period, 'out'),
      });

      return {
        status: 'posted',
        period,
        amount: amountDec,
        fromName: fromFund.name,
        toName: toFund.name,
      };
    });
  } catch (err) {
    if (err && err.code === '23505') return { status: 'already_posted', period };
    throw err;
  }
}

async function auditPost(transfer, result, actor) {
  try {
    await logAudit({
      entityType: 'recurring_transfer',
      entityId: transfer.id,
      action: 'run',
      newValues: {
        period: result.period,
        amount: result.amount,
        from_fund: result.fromName,
        to_fund: result.toName,
      },
      userId: actor?.userId || transfer.created_by || null,
      userName: actor?.userName || 'Scheduled job',
      ipAddress: actor?.ipAddress || null,
      tenantId: transfer.tenant_id,
    });
  } catch (err) {
    console.error(`Recurring transfer audit failed for ${transfer.id}:`, err.message);
  }
}

async function runRecurringTransfers({ db, today, tenantId = null, actor = null, logger = console }) {
  const hasRuns = await db.schema.hasTable('recurring_transfer_runs');
  if (!hasRuns) {
    logger.warn('Recurring transfer runs table is not migrated yet; skipping.');
    return { today, posted: [], skipped: [], ignored_missed: 0, note: 'migration pending' };
  }

  const asOf = today || todayInTimeZone();
  let query = db('recurring_transfers').where({ is_active: true });
  if (tenantId) query = query.andWhere({ tenant_id: tenantId });
  const rows = await query;

  const posted = [];
  const skipped = [];
  let ignoredMissed = 0;

  for (const transfer of rows) {
    const plan = planTransfer(transfer, asOf);
    if (plan.action === 'invalid') continue;

    if (plan.action === 'wait') continue;

    if (plan.action === 'skip_missed') {
      ignoredMissed += plan.skipped;
      await db('recurring_transfers').where({ id: transfer.id }).update({
        next_run_date: plan.nextRun,
        last_error: null,
        last_attempt_at: new Date(),
      });
      logger.log(`Recurring transfer ${transfer.id}: skipped ${plan.skipped} missed date(s); next run ${plan.nextRun}`);
      continue;
    }

    const result = await postPeriod(db, transfer, plan.period);
    if (result.status === 'posted' || result.status === 'already_posted') {
      if (result.status === 'posted') {
        posted.push({ recurring_transfer_id: transfer.id, ...result });
        logger.log(`Recurring transfer ${transfer.id}: ${result.amount} from ${result.fromName} to ${result.toName} for ${plan.period}`);
        await auditPost(transfer, result, actor);
      }
      await db('recurring_transfers').where({ id: transfer.id }).update({
        next_run_date: plan.nextRun,
        last_run_date: plan.period,
        last_error: null,
        last_attempt_at: new Date(),
      });
      if (plan.skipped) {
        ignoredMissed += plan.skipped;
        logger.log(`Recurring transfer ${transfer.id}: skipped ${plan.skipped} missed date(s) before posting ${plan.period}`);
      }
      continue;
    }

    const message = result.status === 'skipped_insufficient'
      ? insufficientMessage(result.fromName, result.balanceCents, result.amountCents, result.period)
      : `Could not post ${plan.period} (${result.status}).`;
    skipped.push({
      recurring_transfer_id: transfer.id,
      period: plan.period,
      status: result.status,
      message,
    });
    await db('recurring_transfers').where({ id: transfer.id }).update({
      last_error: message,
      last_attempt_at: new Date(),
    });
    logger.warn(`Skipping recurring transfer ${transfer.id}: ${message}`);
  }

  return {
    today: asOf,
    posted_count: posted.length,
    skipped_count: skipped.length,
    ignored_missed: ignoredMissed,
    posted,
    skipped,
  };
}

module.exports = {
  isActive,
  planTransfer,
  runRecurringTransfers,
  insufficientMessage,
};
