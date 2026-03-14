require('dotenv').config();
const path = require('path');

function getConnectionString(environment) {
  if (environment === 'development') {
    return process.env.DEV_DATABASE_URL || process.env.DATABASE_URL;
  }
  return process.env.DATABASE_URL;
}

module.exports = {
  development: {
    client: 'pg',
    connection: {
      connectionString: getConnectionString('development'),
      ssl: false,
    },
    pool: {
      min: 1,
      max: 5,
    },
    migrations: {
      directory: path.join(__dirname, 'src', 'migrations'),
    },
    seeds: {
      directory: path.join(__dirname, 'src', 'seeds'),
    },
  },
  production: {
    client: 'pg',
    connection: {
      connectionString: getConnectionString('production'),
      ssl: getConnectionString('production') ? { rejectUnauthorized: false } : false,
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: path.join(__dirname, 'src', 'migrations'),
    },
    seeds: {
      directory: path.join(__dirname, 'src', 'seeds'),
    },
  },
};
