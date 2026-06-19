const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  // e.g. FRANCHISE_ACTIVATED, PAYMENT_EDITED, COUPON_APPLIED, ORDER_EDITED, LOGIN, etc.
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  performedByName: { type: String, default: '' },
  performedByRole: { type: String, default: '' },
  targetId: { type: mongoose.Schema.Types.ObjectId },
  targetModel: { type: String, default: '' },
  franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise' },
  franchiseName: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  // { oldValue, newValue, reason, etc. }
  ipAddress: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: false });

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ franchiseId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ performedBy: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
