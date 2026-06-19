const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema({
  franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
  tableNumber: { type: String, required: true },
  capacity: { type: Number, default: 4 },
  qrCode: { type: String, default: '' },      // base64 data URL
  qrSecret: { type: String, default: '' },    // HMAC signature
  status: {
    type: String,
    enum: ['available', 'occupied', 'bill_pending', 'reserved', 'needs_cleaning', 'held'],
    default: 'available',
  },
  currentSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OrderSession',
    default: null,
  },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

tableSchema.index({ franchiseId: 1, status: 1 });
tableSchema.index({ franchiseId: 1, tableNumber: 1 }, { unique: true });

module.exports = mongoose.model('Table', tableSchema);
