const Notification = require('../models/Notification');

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

/**
 * Persists a notification. Called alongside (never instead of) the existing
 * Socket.IO emit at the same call site — this is purely the "survives a
 * page refresh" backing store, not a replacement for real-time delivery.
 * Callers should fire-and-forget this (catch errors, never let a
 * notification-persistence failure break order/kitchen flow).
 */
async function createOrderNotification({ type, franchiseId, orderId, tokenNumber, tableNumber, customerName, orderType }) {
  return Notification.create({
    franchise_id: franchiseId,
    type,
    order_id: orderId,
    token_number: tokenNumber,
    table_number: tableNumber,
    customer_name: customerName,
    order_type: orderType,
  });
}

async function listNotifications(franchiseId, { limit = 50 } = {}) {
  return Notification.find({ franchise_id: franchiseId }).sort({ createdAt: -1 }).limit(limit).lean();
}

async function markNotificationRead(id, franchiseId) {
  const notif = await Notification.findOneAndUpdate(
    { _id: id, franchise_id: franchiseId },
    { is_read: true },
    { new: true }
  );
  if (!notif) fail(404, 'Notification not found');
  return notif;
}

async function markAllNotificationsRead(franchiseId) {
  const result = await Notification.updateMany({ franchise_id: franchiseId, is_read: false }, { is_read: true });
  return { updated: result.modifiedCount || 0 };
}

async function markNotificationAccepted(id, franchiseId, acceptedBy) {
  const notif = await Notification.findOneAndUpdate(
    { _id: id, franchise_id: franchiseId },
    { accepted: true, accepted_by: acceptedBy, accepted_at: new Date() },
    { new: true }
  );
  if (!notif) fail(404, 'Notification not found');
  return notif;
}

async function deleteNotification(id, franchiseId) {
  const notif = await Notification.findOneAndDelete({ _id: id, franchise_id: franchiseId });
  if (!notif) fail(404, 'Notification not found');
}

async function clearAllNotifications(franchiseId) {
  const result = await Notification.deleteMany({ franchise_id: franchiseId });
  return { deleted: result.deletedCount || 0 };
}

module.exports = {
  createOrderNotification,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  markNotificationAccepted,
  deleteNotification,
  clearAllNotifications,
};
