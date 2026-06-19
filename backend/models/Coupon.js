const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  description: { type: String, default: '' },
  discountType: { type: String, enum: ['percentage', 'flat'], required: true },
  discountValue: { type: Number, required: true, min: 0 },
  isHidden: { type: Boolean, default: true }, // hidden from franchise owners
  isActive: { type: Boolean, default: true },
  maxUses: { type: Number, default: 0 },      // 0 = unlimited
  usedCount: { type: Number, default: 0 },
  minOrderAmount: { type: Number, default: 0 },
  maxDiscountAmount: { type: Number, default: 0 }, // 0 = no cap
  expiresAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  applicableFranchises: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Franchise' }], // empty = all
}, { timestamps: true });

couponSchema.index({ code: 1 });
couponSchema.index({ isActive: 1, isHidden: 1 });

module.exports = mongoose.model('Coupon', couponSchema);
