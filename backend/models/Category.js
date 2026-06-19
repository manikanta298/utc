const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true, unique: true },
    color:     { type: String, default: '#f97316' }, // hex for UI badge
    icon:      { type: String, default: '🍽️' },
    sortOrder: { type: Number, default: 0 },
    isActive:  { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', categorySchema);
