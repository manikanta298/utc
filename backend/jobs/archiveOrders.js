const cron = require('node-cron');
const OrderSession = require('../models/OrderSession');
const mongoose = require('mongoose');

let ArchivedOrder;
try {
  ArchivedOrder = mongoose.model('ArchivedOrder');
} catch {
  const s = new mongoose.Schema({}, { strict: false, timestamps: false });
  ArchivedOrder = mongoose.model('ArchivedOrder', s);
}

const archiveOldOrders = async () => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const old = await OrderSession.find({
      closedAt: { $lt: cutoff },
      status: { $in: ['paid', 'closed'] },
    }).lean();

    if (!old.length) return;

    await ArchivedOrder.insertMany(old.map((o) => ({ ...o, archivedAt: new Date() })));
    await OrderSession.deleteMany({ _id: { $in: old.map((o) => o._id) } });
    console.log(`[Archive] Moved ${old.length} sessions — ${new Date().toISOString()}`);
  } catch (err) {
    console.error('[Archive] Error:', err.message);
  }
};

const startArchiveCron = () => {
  cron.schedule('0 3 * * *', archiveOldOrders, { timezone: 'Asia/Kolkata' });
  console.log('[Archive] Cron scheduled — daily 03:00 IST');
};

module.exports = { startArchiveCron, archiveOldOrders };
