const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const franchiseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    gstin: { type: String, required: true, uppercase: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    address: { type: String, trim: true },
    owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true },
    status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active' },
    archivedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    invoiceCounter: { type: Number, default: 0 },
    franchiseCode: { type: String, unique: true, uppercase: true },
    logo: { type: String, default: '' },
    edit_pin: { type: String, default: null }, // hashed 4-digit PIN for order editing
  },
  { timestamps: true }
);

franchiseSchema.pre('save', async function (next) {
  if (!this.franchiseCode) {
    const count = await mongoose.model('Franchise').countDocuments();
    this.franchiseCode = `FR${String(count + 1).padStart(2, '0')}`;
  }

  if (this.status === 'active') {
    this.isActive = true;
    this.archivedAt = null;
  } else if (this.status === 'inactive') {
    this.isActive = false;
  } else if (this.status === 'archived') {
    this.isActive = false;
    if (!this.archivedAt) this.archivedAt = new Date();
  }

  next();
});

module.exports = mongoose.model('Franchise', franchiseSchema);
