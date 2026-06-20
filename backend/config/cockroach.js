const { Pool } = require('pg');

// CockroachDB speaks the Postgres wire protocol, so the standard `pg` driver
// works unmodified. This pool is a downstream sync target only — MongoDB
// remains the authoritative database for everything in the app.
const pool = new Pool({
  connectionString: process.env.COCKROACH_DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  // A CockroachDB hiccup must never crash the main app — log and move on.
  console.error('[CockroachDB] pool error:', err.message);
});

module.exports = { pool };
