const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: {
      type: String,
      enum: ['master_admin', 'franchise_owner', 'manager', 'pos_staff', 'shift_operator', 'kitchen_staff', 'waiter'],
      required: true,
    },
    // franchise_id is null for master_admin, set for all others
    franchise_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Franchise',
      default: null,
    },
    phone: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    // Waiter-specific: array of table numbers assigned to this waiter
    assigned_tables: [{ type: String }],
    lastLogin: { type: Date },
    resetPasswordToken:  { type: String },
    resetPasswordExpire: { type: Date },
  },
  { timestamps: true }
);

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// Performance indexes
userSchema.index({ email: 1 });
userSchema.index({ franchise_id: 1, role: 1, isActive: 1 });
userSchema.index({ resetPasswordToken: 1 }, { sparse: true });

module.exports = mongoose.model('User', userSchema);
