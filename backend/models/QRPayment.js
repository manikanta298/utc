const mongoose = require('mongoose');

const qrPaymentSchema = new mongoose.Schema({
  sessionId:   { type: mongoose.Schema.Types.ObjectId, ref: 'OrderSession', required: true },
  franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
  amount:      { type: Number, required: true },
  method:      { type: String, enum: ['UPI', 'PhonePe', 'GPay', 'Paytm', 'QR'], default: 'UPI' },
  qrData:      { type: String, required: true },   // UPI deep-link or payment string
  reference:   { type: String, default: '' },      // UPI ref after payment
  status:      { type: String, enum: ['pending', 'completed', 'expired', 'cancelled'], default: 'pending' },
  expiresAt:   { type: Date, required: true },     // createdAt + 5 min
  completedAt: { type: Date, default: null },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

// Auto-expire index
qrPaymentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
qrPaymentSchema.index({ sessionId: 1, status: 1 });

module.exports = mongoose.model('QRPayment', qrPaymentSchema);
