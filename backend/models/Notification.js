const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  franchise_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true, index: true },
  type: { type: String, enum: ['new_order', 'ready', 'approved'], required: true },
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  token_number: Number,
  table_number: String,
  customer_name: String,
  order_type: String,
  is_read: { type: Boolean, default: false },
  accepted: { type: Boolean, default: false },
  accepted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  accepted_at: Date,
}, { timestamps: true });

notificationSchema.index({ franchise_id: 1, createdAt: -1 });

// Matches the existing frontend behavior exactly: notificationStore.js
// auto-clears each notification 12 hours after creation. This TTL index
// does the same thing server-side, so the collection self-prunes instead
// of growing into a permanent log of every order ever placed.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 12 * 60 * 60 });

module.exports = mongoose.model('Notification', notificationSchema);
