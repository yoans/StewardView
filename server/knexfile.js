require('dotenv').config();
const path = require('path');

module.exports = {
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: path.join(__dirname, 'dev.sqlite3'),
    },
    useNullAsDefault: true,
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
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
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
