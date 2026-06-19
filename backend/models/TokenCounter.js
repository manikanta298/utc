const mongoose = require('mongoose');

const tokenCounterSchema = new mongoose.Schema({
  franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
  date: { type: String, required: true }, // "YYYY-MM-DD"
  lastToken: { type: Number, default: 100 },
}, { timestamps: false });

tokenCounterSchema.index({ franchiseId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('TokenCounter', tokenCounterSchema);
