const { pool } = require('../config/cockroach');
const Order = require('../models/Order');
const Customer = require('../models/Customer');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS order_tracking_history (
  id STRING PRIMARY KEY,
  order_id STRING NOT NULL,
  order_number STRING,
  franchise_id STRING,
  status STRING NOT NULL,
  updated_by STRING,
  occurred_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oth_order_id ON order_tracking_history (order_id);
CREATE INDEX IF NOT EXISTS idx_oth_occurred_at ON order_tracking_history (occurred_at);

CREATE TABLE IF NOT EXISTS customers (
  id STRING PRIMARY KEY,
  phone_no STRING,
  name STRING,
  email STRING,
  gender STRING,
  age INT,
  address STRING,
  village STRING,
  city STRING,
  state STRING,
  pincode STRING,
  total_points INT,
  total_orders INT,
  total_spent DECIMAL,
  favorite_items STRING[],
  last_visit TIMESTAMPTZ,
  first_franchise STRING,
  is_active BOOL,
  mongo_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone_no);

CREATE TABLE IF NOT EXISTS sync_meta (
  key STRING PRIMARY KEY,
  value STRING
);
`;

async function initSchema() {
  await pool.query(SCHEMA_SQL);
  console.log('[CockroachDB] schema ready');
}

// ── Order tracking history — real-time via MongoDB Change Streams ──────────
// Mongo stays authoritative. This only ever reads from Mongo and writes to
// CockroachDB — a failure here must never affect order/payment flow.
async function upsertStatusHistory(orderDoc) {
  if (!orderDoc?.status_history?.length) return;
  for (const entry of orderDoc.status_history) {
    if (!entry?._id || !entry?.status) continue;
    try {
      await pool.query(
        `INSERT INTO order_tracking_history
           (id, order_id, order_number, franchise_id, status, updated_by, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [
          entry._id.toString(),
          orderDoc._id.toString(),
          orderDoc.order_number || null,
          orderDoc.franchise_id ? orderDoc.franchise_id.toString() : null,
          entry.status,
          entry.updatedBy ? entry.updatedBy.toString() : null,
          entry.updatedAt || new Date(),
        ]
      );
    } catch (err) {
      // Log and continue — never throw out of a change-stream handler.
      console.error('[CockroachDB] order_tracking_history upsert failed:', err.message);
    }
  }
}

let orderWatcher = null;

function watchOrderTracking() {
  try {
    orderWatcher = Order.watch([], { fullDocument: 'updateLookup' });

    orderWatcher.on('change', async (event) => {
      const doc = event.fullDocument;
      if (doc) await upsertStatusHistory(doc);
    });

    orderWatcher.on('error', (err) => {
      console.error('[CockroachDB] order change stream error, retrying in 5s:', err.message);
      setTimeout(watchOrderTracking, 5000);
    });

    orderWatcher.on('close', () => {
      console.warn('[CockroachDB] order change stream closed, retrying in 5s');
      setTimeout(watchOrderTracking, 5000);
    });

    console.log('[CockroachDB] watching Order collection for status changes');
  } catch (err) {
    console.error('[CockroachDB] failed to start order change stream, retrying in 5s:', err.message);
    setTimeout(watchOrderTracking, 5000);
  }
}

// ── Customer sync — periodic batch, called by node-cron ────────────────────
async function getLastCustomerSync() {
  const { rows } = await pool.query(`SELECT value FROM sync_meta WHERE key = 'customers_last_sync'`);
  return rows[0] ? new Date(rows[0].value) : new Date(0);
}

async function setLastCustomerSync(date) {
  await pool.query(
    `INSERT INTO sync_meta (key, value) VALUES ('customers_last_sync', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [date.toISOString()]
  );
}

async function syncCustomersBatch() {
  const batchStartedAt = new Date();
  try {
    const lastSync = await getLastCustomerSync();
    const customers = await Customer.find({ updatedAt: { $gt: lastSync } }).lean();

    if (customers.length === 0) return;

    for (const c of customers) {
      try {
        await pool.query(
          `INSERT INTO customers
             (id, phone_no, name, email, gender, age, address, village, city, state, pincode,
              total_points, total_orders, total_spent, favorite_items, last_visit, first_franchise,
              is_active, mongo_updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
           ON CONFLICT (id) DO UPDATE SET
             phone_no = $2, name = $3, email = $4, gender = $5, age = $6, address = $7,
             village = $8, city = $9, state = $10, pincode = $11, total_points = $12,
             total_orders = $13, total_spent = $14, favorite_items = $15, last_visit = $16,
             first_franchise = $17, is_active = $18, mongo_updated_at = $19, synced_at = now()`,
          [
            c._id.toString(), c.phone_no, c.name, c.email || null, c.gender || null, c.age ?? null,
            c.address || null, c.village || null, c.city || null, c.state || null, c.pincode || null,
            c.total_points ?? 0, c.total_orders ?? 0, c.total_spent ?? 0, c.favorite_items || [],
            c.last_visit || null, c.first_franchise ? c.first_franchise.toString() : null,
            c.isActive !== false, c.updatedAt || null,
          ]
        );
      } catch (err) {
        console.error(`[CockroachDB] customer sync failed for ${c._id}:`, err.message);
      }
    }

    await setLastCustomerSync(batchStartedAt);
    console.log(`[CockroachDB] synced ${customers.length} customer(s)`);
  } catch (err) {
    console.error('[CockroachDB] customer batch sync failed:', err.message);
  }
}

module.exports = { initSchema, watchOrderTracking, syncCustomersBatch };
