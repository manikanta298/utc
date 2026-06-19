const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    phone_no: { type: String, required: true, unique: true, trim: true, alias: 'mobile' },
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true, default: '' },
    gender: { type: String, enum: ['male', 'female', 'other', ''], default: '' },
    age: { type: Number, default: null, min: 0 },
    address: { type: String, trim: true, default: '' },
    village: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    pincode: { type: String, trim: true, default: '' },
    total_points: { type: Number, default: 0, min: 0 },
    total_orders: { type: Number, default: 0, alias: 'visitCount' },
    total_spent: { type: Number, default: 0, alias: 'totalSpent' },
    favorite_items: [{ type: String, trim: true }],
    last_visit: { type: Date, default: null, alias: 'lastVisit' },
    first_franchise: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

customerSchema.index({ phone_no: 1 });
customerSchema.index({ last_visit: -1 });

module.exports = mongoose.model('Customer', customerSchema);
