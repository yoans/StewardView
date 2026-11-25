/**
 * Database connection for one-off operator scripts.
 *
 * Run against production with the Railway CLI from the repo root, e.g.
 *   railway run --service Postgres node server/scripts/delete-tenants.js --tenant 5
 * Railway's DATABASE_URL uses an internal hostname, so DATABASE_PUBLIC_URL is
 * preferred when it is present.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const knex = require('knex');

function connect() {
  const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || process.env.DEV_DATABASE_URL;
  if (!url) throw new Error('No DATABASE_PUBLIC_URL / DATABASE_URL / DEV_DATABASE_URL set.');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const host = url.replace(/^.*@/, '').replace(/\/.*$/, '');
  console.log(`Database: ${host}`);
  return knex({
    client: 'pg',
    connection: { connectionString: url, ssl: local ? false : { rejectUnauthorized: false } },
    pool: { min: 0, max: 2 },
  });
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = { tenants: [], confirm: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--confirm') out.confirm = true;
    else if (a === '--tenant') out.tenants.push(parseInt(argv[++i], 10));
    else if (a.startsWith('--tenant=')) out.tenants.push(parseInt(a.split('=')[1], 10));
    else if (a === '--out') out.out = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (out.tenants.some((t) => !Number.isInteger(t) || t <= 0)) throw new Error('--tenant needs a positive integer id');
  return out;
}

/** Marker error used to roll back a dry run without treating it as a failure. */
class DryRun extends Error {}

module.exports = { connect, parseArgs, DryRun };
