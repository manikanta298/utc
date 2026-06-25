const {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  markNotificationAccepted,
  deleteNotification,
  clearAllNotifications,
} = require('../services/notificationService');

const handleServiceError = (res, err) => {
  res.status(err.status || 500).json({ success: false, message: err.message });
};

const resolveFranchiseId = (req) => req.user.franchise_id?._id || req.user.franchise_id;

// GET /api/notifications
const getNotifications = async (req, res) => {
  try {
    const notifications = await listNotifications(resolveFranchiseId(req), { limit: req.query.limit });
    res.json({ success: true, notifications });
  } catch (err) {
    handleServiceError(res, err);
  }
};

// PATCH /api/notifications/:id/read
const markRead = async (req, res) => {
  try {
    const notification = await markNotificationRead(req.params.id, resolveFranchiseId(req));
    res.json({ success: true, notification });
  } catch (err) {
    handleServiceError(res, err);
  }
};

// PATCH /api/notifications/read-all
const markAllRead = async (req, res) => {
  try {
    const result = await markAllNotificationsRead(resolveFranchiseId(req));
    res.json({ success: true, ...result });
  } catch (err) {
    handleServiceError(res, err);
  }
};

// PATCH /api/notifications/:id/accept
const markAccepted = async (req, res) => {
  try {
    const notification = await markNotificationAccepted(req.params.id, resolveFranchiseId(req), req.user._id);
    res.json({ success: true, notification });
  } catch (err) {
    handleServiceError(res, err);
  }
};

// DELETE /api/notifications/:id
const removeNotification = async (req, res) => {
  try {
    await deleteNotification(req.params.id, resolveFranchiseId(req));
    res.json({ success: true, message: 'Notification removed' });
  } catch (err) {
    handleServiceError(res, err);
  }
};

// DELETE /api/notifications
const clearAll = async (req, res) => {
  try {
    const result = await clearAllNotifications(resolveFranchiseId(req));
    res.json({ success: true, ...result });
  } catch (err) {
    handleServiceError(res, err);
  }
};

module.exports = { getNotifications, markRead, markAllRead, markAccepted, removeNotification, clearAll };
