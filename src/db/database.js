const knex = require('knex');
const path = require('path');
require('dotenv').config();

const dbType = process.env.DB_TYPE || 'sqlite';

let config;
if (dbType === 'sqlite') {
  const dbPath = process.env.DB_FILENAME || './src/db/database.sqlite';
  config = {
    client: 'sqlite3',
    connection: {
      filename: path.resolve(process.cwd(), dbPath)
    },
    useNullAsDefault: true
  };
} else {
  config = {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      port: parseInt(process.env.DB_PORT || '3306', 10)
    }
  };
}

const db = knex(config);
module.exports = db;
