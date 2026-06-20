const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    category: { type: String, required: true, trim: true }, // dynamic — managed via Category model
    price: { type: Number, required: true, min: 0 },
    gst_rate: { type: Number, required: true, default: 5 },
    hsn_code: { type: String, trim: true, default: '' },
    image: {
      url: { type: String, default: '' },
      public_id: { type: String, default: '' },
    },
    isGlobalActive: { type: Boolean, default: true },
    disabledInFranchises: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Franchise' }],
    preparationTime: { type: Number, default: 10 },
    isVeg: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    // ── Inventory / Stock fields ───────────────────────────────
    stock_enabled:    { type: Boolean, default: false },
    stock_qty:        { type: Number, default: 0, min: 0 },
    unit:             { type: String, default: 'pcs', trim: true }, // pcs, kg, litre, plate, box…
    low_stock_threshold: { type: Number, default: 10 },
  },
  { timestamps: true }
);

menuItemSchema.index({ category: 1, isGlobalActive: 1 });

module.exports = mongoose.model('MenuItem', menuItemSchema);
