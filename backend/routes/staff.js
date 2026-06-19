const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, authorise } = require('../middleware/auth');
const { enforceActiveFranchise } = require('../middleware/franchiseGuard');

const ROLE_RANK = {
  master_admin: 5,
  franchise_owner: 4,
  manager: 3,
  pos_staff: 2,
  shift_operator: 2,
  kitchen_staff: 1,
};

const canManageUser = (actor, target) => {
  if (actor.role === 'master_admin') return true;
  if (!target.franchise_id) return false;
  const myFranchise = (actor.franchise_id._id || actor.franchise_id).toString();
  if (target.franchise_id.toString() !== myFranchise) return false;
  return (ROLE_RANK[actor.role] || 0) > (ROLE_RANK[target.role] || 0);
};

// GET /api/staff
router.get('/', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager'), async (req, res) => {
  try {
    const filter = {};
    if (req.user.role !== 'master_admin') {
      filter.franchise_id = req.user.franchise_id._id || req.user.franchise_id;
    } else if (req.query.franchise_id) {
      filter.franchise_id = req.query.franchise_id;
    }
    const staff = await User.find(filter)
      .populate('franchise_id', 'name franchiseCode')
      .sort({ createdAt: -1 });
    res.json({ success: true, staff });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/staff/:id/toggle — activate/deactivate
router.put('/:id/toggle', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
    }
    if (!canManageUser(req.user, user)) {
      return res.status(403).json({ success: false, message: 'Access denied for this staff member' });
    }
    user.isActive = !user.isActive;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/staff/:id — update details
router.put('/:id', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!canManageUser(req.user, user)) {
      return res.status(403).json({ success: false, message: 'Access denied for this staff member' });
    }
    const { name, phone, role } = req.body;
    if (role && req.user.role !== 'master_admin' && (ROLE_RANK[role] || 0) >= (ROLE_RANK[req.user.role] || 0)) {
      return res.status(403).json({ success: false, message: 'You cannot assign this role' });
    }
    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (role !== undefined) user.role = role === 'shift_operator' ? 'pos_staff' : role;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/staff/:id — franchise_owner can delete own staff
router.delete('/:id', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Staff not found' });
    if (user.role === 'master_admin' || user.role === 'franchise_owner') {
      return res.status(400).json({ success: false, message: 'Cannot delete owner or admin accounts' });
    }
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }
    if (!canManageUser(req.user, user)) {
      return res.status(403).json({ success: false, message: 'Access denied for this staff member' });
    }
    await user.deleteOne();
    res.json({ success: true, message: 'Staff member permanently deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /api/staff/:id/reset-password
router.patch('/:id/reset-password', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'Staff not found' });
    if (!canManageUser(req.user, user)) {
      return res.status(403).json({ success: false, message: 'Access denied for this staff member' });
    }
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
