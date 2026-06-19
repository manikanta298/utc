const mongoose = require('mongoose');

const usageLogSchema = new mongoose.Schema({
  date:        { type: Date, default: Date.now },
  qtyUsed:     { type: Number, required: true },
  usedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  role:        { type: String },
  reason:      { type: String, default: '' },
  approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt:  { type: Date, default: null },
  status:      { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
});

const purchaseLogSchema = new mongoose.Schema({
  date:        { type: Date, default: Date.now },
  qty:         { type: Number, required: true },
  costPerUnit: { type: Number, default: 0 },
  totalCost:   { type: Number, default: 0 },
  supplier:    { type: String, default: '' },
  addedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

const rawMaterialSchema = new mongoose.Schema(
  {
    franchiseId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
    name:          { type: String, required: true, trim: true },
    category:      { type: String, default: 'General', trim: true },
    unit:          { type: String, default: 'kg', trim: true },
    currentStock:  { type: Number, default: 0, min: 0 },
    minStock:      { type: Number, default: 1 },   // low stock alert threshold
    costPerUnit:   { type: Number, default: 0 },
    isActive:      { type: Boolean, default: true },
    usageLogs:     [usageLogSchema],
    purchaseLogs:  [purchaseLogSchema],
  },
  { timestamps: true }
);

rawMaterialSchema.index({ franchiseId: 1, isActive: 1 });

// Virtual: stock status
rawMaterialSchema.virtual('stockStatus').get(function () {
  if (this.currentStock === 0) return 'out';
  if (this.currentStock <= this.minStock) return 'low';
  return 'ok';
});

rawMaterialSchema.set('toObject', { virtuals: true });
rawMaterialSchema.set('toJSON',   { virtuals: true });

module.exports = mongoose.model('RawMaterial', rawMaterialSchema);
