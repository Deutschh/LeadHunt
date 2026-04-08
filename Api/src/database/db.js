const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  // Aumentamos para 10 segundos para dar tempo do Neon responder
  connectionTimeoutMillis: 10000, 
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};