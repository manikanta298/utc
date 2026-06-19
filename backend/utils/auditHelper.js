const AuditLog = require('../models/AuditLog');

const logAudit = async (action, req, targetId, targetModel, details = {}) => {
  try {
    await AuditLog.create({
      action,
      performedBy: req.user?._id,
      performedByName: req.user?.name || '',
      performedByRole: req.user?.role || '',
      targetId,
      targetModel,
      franchiseId: req.user?.franchise_id?._id || req.user?.franchise_id || null,
      franchiseName: req.user?.franchise_id?.name || '',
      details,
      ipAddress: req.ip || '',
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
};

module.exports = { logAudit };
