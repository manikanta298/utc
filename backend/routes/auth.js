const express = require('express');
const { body } = require('express-validator');
const {
  login, refresh, logout, getMe, createStaff, changePassword, forgotPassword, resetPassword, verifyEditPin,
} = require('../controllers/authController');
const { protect, authorise, protectRefreshToken } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// ── SECURITY FIX: Stricter rate limit on login (brute force protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 10,                     // 10 attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again after 15 minutes.' },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 5,
  message: { success: false, message: 'Too many password reset requests. Please try again later.' },
});

router.post(
  '/login',
  loginLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password is required'),
  ],
  login
);
router.post('/refresh', protectRefreshToken, refresh);
router.post('/logout', logout);
router.get('/me', protect, getMe);
router.post(
  '/create-staff',
  protect,
  authorise('master_admin', 'franchise_owner', 'manager'),
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').notEmpty().withMessage('Role is required'),
  ],
  createStaff
);
router.put(
  '/change-password',
  protect,
  [
    body('currentPassword').isLength({ min: 6 }).withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  ],
  changePassword
);

// ── SECURITY FIX: setup-master requires env-configured key only (no hardcoded fallback)
router.post('/setup-master', async (req, res) => {
  try {
    const { setupKey } = req.body;
    if (!process.env.SETUP_KEY || setupKey !== process.env.SETUP_KEY) {
      return res.status(403).json({ success: false, message: 'Invalid setup key' });
    }

    const User = require('../models/User');
    await User.deleteMany({ role: 'master_admin' });

    const admin = await User.create({
      name: 'Master Admin',
      email: process.env.MASTER_EMAIL || 'admin@utccafe.com',
      password: process.env.MASTER_PASSWORD || 'Admin@1234',
      role: 'master_admin',
      phone: '9000000000',
    });

    res.json({ success: true, message: 'Master admin created', email: admin.email });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Forgot / Reset password — master_admin only
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPassword);

// Delete all customer + session data — master_admin only
router.delete('/purge-test-data', protect, authorise('master_admin'), async (req, res) => {
  try {
    const Customer      = require('../models/Customer');
    const OrderSession  = require('../models/OrderSession');
    const Order         = require('../models/Order');
    const TokenCounter  = require('../models/TokenCounter');
    const [c, s, o, t]  = await Promise.all([
      Customer.deleteMany({}),
      OrderSession.deleteMany({}),
      Order.deleteMany({}),
      TokenCounter.deleteMany({}),
    ]);
    res.json({ success: true, message: 'All customer and order data purged.', deleted: { customers: c.deletedCount, sessions: s.deletedCount, orders: o.deletedCount, tokens: t.deletedCount } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// seed-demo — creates demo accounts (only via secret key)
router.post('/seed-demo', async (req, res) => {
  try {
    const { secret } = req.body;
    if (!process.env.SEED_SECRET || secret !== process.env.SEED_SECRET) {
      return res.status(403).json({ success: false, message: 'Invalid seed secret' });
    }

    const User      = require('../models/User');
    const Franchise = require('../models/Franchise');
    const MenuItem  = require('../models/MenuItem');
    const Customer  = require('../models/Customer');

    await Promise.all([User.deleteMany({}), Franchise.deleteMany({}), MenuItem.deleteMany({}), Customer.deleteMany({})]);

    await User.create({ name: 'Master Admin', email: process.env.MASTER_EMAIL || 'admin@utccafe.com', password: 'Admin@1234', role: 'master_admin', phone: '9000000000' });

    const f1 = await Franchise.create({ name: 'UTC Café — Chennai Central', location: 'Anna Salai, Chennai', city: 'Chennai', state: 'Tamil Nadu', gstin: '33AABCU9603R1ZX', phone: '9111111111', email: 'chennai@utccafe.com', address: '45, Anna Salai, Chennai - 600002' });
    const f2 = await Franchise.create({ name: 'UTC Café — Bangalore Koramangala', location: 'Koramangala, Bangalore', city: 'Bangalore', state: 'Karnataka', gstin: '29AABCU9603R1ZY', phone: '9222222222', email: 'bangalore@utccafe.com', address: '12, 5th Block, Koramangala, Bangalore - 560034' });

    const o1 = await User.create({ name: 'Raj Kumar', email: 'raj@utccafe.com', password: 'Owner@1234', role: 'franchise_owner', franchise_id: f1._id, phone: '9111111112' });
    const o2 = await User.create({ name: 'Priya Sharma', email: 'priya@utccafe.com', password: 'Owner@1234', role: 'franchise_owner', franchise_id: f2._id, phone: '9222222223' });

    await Franchise.findByIdAndUpdate(f1._id, { owner_id: o1._id });
    await Franchise.findByIdAndUpdate(f2._id, { owner_id: o2._id });

    await User.create([
      { name: 'Suresh M', email: 'manager1@utccafe.com', password: 'Staff@1234', role: 'manager', franchise_id: f1._id, phone: '9111111113' },
      { name: 'Kavya POS', email: 'pos1@utccafe.com', password: 'Staff@1234', role: 'pos_staff', franchise_id: f1._id, phone: '9111111114' },
      { name: 'Ravi Kitchen', email: 'kitchen1@utccafe.com', password: 'Staff@1234', role: 'kitchen_staff', franchise_id: f1._id, phone: '9111111115' },
    ]);

    res.json({ success: true, message: 'Demo data seeded successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/verify-edit-pin', protect, authorise('master_admin', 'franchise_owner', 'manager', 'pos_staff', 'shift_operator'), verifyEditPin);

module.exports = router;
