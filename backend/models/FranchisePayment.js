const mongoose = require('mongoose');

const franchisePaymentSchema = new mongoose.Schema({
  franchiseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Franchise',
    required: true,
    unique: true,
  },
  bankAccountName: { type: String, default: '' },
  bankAccountNumber: { type: String, default: '' },
  ifscCode: { type: String, default: '' },
  upiId: { type: String, default: '' },
  upiQrImageUrl: { type: String, default: '' },
  acceptedMethods: {
    type: [String],
    enum: ['Cash', 'UPI', 'Card', 'Net Banking'],
    default: ['Cash', 'UPI'],
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('FranchisePayment', franchisePaymentSchema);
