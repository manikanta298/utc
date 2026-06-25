const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  type: { type: String, required: true, enum: ['sms'] }, // add more types here as they're actually built
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  lastError: String,
  runAfter: { type: Date, default: Date.now, index: true }, // backoff scheduling
  completedAt: Date,
}, { timestamps: true });

jobSchema.index({ status: 1, runAfter: 1 });

// Keep finished jobs around briefly for debugging, then self-prune —
// this is an operational queue, not a permanent audit log.
jobSchema.index({ completedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60, partialFilterExpression: { completedAt: { $exists: true } } });

module.exports = mongoose.model('Job', jobSchema);
