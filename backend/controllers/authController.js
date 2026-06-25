const { validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const {
  signAccessToken,
  signRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} = require('../utils/tokenService');
const {
  isLocked,
  lockRemainingMs,
  logLoginAttempt,
  recordFailedLogin,
  recordSuccessfulLogin,
} = require('../services/authSecurityService');

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return null;
  return res.status(400).json({
    success: false,
    message: errors.array()[0].msg,
    errors: errors.array(),
  });
};

const withUserFranchise = 'name state franchiseCode city status isActive';

// @POST /api/auth/login
const login = async (req, res) => {
  try {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) return validationResponse;

    const { email: rawEmail, password } = req.body;
    const email = rawEmail?.toLowerCase().trim();

    // ── BUG FIX: Select password explicitly (schema hides it in toJSON but findOne needs it)
    const user = await User.findOne({ email })
      .select('+password')
      .populate('franchise_id', withUserFranchise);

    if (!user || !user.isActive) {
      await logLoginAttempt({ email, user, success: false, reason: !user ? 'no_such_user' : 'inactive', ip: req.ip });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (isLocked(user)) {
      await logLoginAttempt({ email, user, success: false, reason: 'account_locked', ip: req.ip });
      const minutesLeft = Math.ceil(lockRemainingMs(user) / 60000);
      return res.status(423).json({
        success: false,
        message: `Account temporarily locked due to repeated failed login attempts. Try again in ${minutesLeft} minute(s).`,
      });
    }

    if (user.franchise_id) {
      const franchiseStatus = user.franchise_id.status || (user.franchise_id.isActive ? 'active' : 'inactive');
      if (franchiseStatus !== 'active') {
        await logLoginAttempt({ email, user, success: false, reason: 'franchise_inactive', ip: req.ip });
        return res.status(403).json({ success: false, message: 'Franchise is deactivated. Access denied.' });
      }
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await recordFailedLogin(user, req.ip);
      await logLoginAttempt({ email, user, success: false, reason: 'wrong_password', ip: req.ip });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    await recordSuccessfulLogin(user);
    await logLoginAttempt({ email, user, success: true, ip: req.ip });

    const token = signAccessToken(user._id);
    const refreshToken = signRefreshToken(user._id);
    setRefreshTokenCookie(res, refreshToken);

    res.json({
      success: true,
      token,
      refreshToken,
      user: user.toJSON(),
    });
  } catch (err) {
    console.error('[login]', err.message);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
};

// @POST /api/auth/refresh
const refresh = async (req, res) => {
  try {
    const user = await User.findById(req.refreshTokenPayload.id)
      .populate('franchise_id', withUserFranchise);
    if (!user || !user.isActive) {
      clearRefreshTokenCookie(res);
      return res.status(401).json({ success: false, message: 'User not found or deactivated' });
    }

    if (user.franchise_id) {
      const franchiseStatus = user.franchise_id.status || (user.franchise_id.isActive ? 'active' : 'inactive');
      if (franchiseStatus !== 'active') {
        clearRefreshTokenCookie(res);
        return res.status(403).json({ success: false, message: 'Franchise is deactivated. Access denied.' });
      }
    }

    const token = signAccessToken(user._id);
    const refreshToken = signRefreshToken(user._id);
    setRefreshTokenCookie(res, refreshToken);

    res.json({ success: true, token, refreshToken, user: user.toJSON() });
  } catch (err) {
    console.error('[refresh]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// @POST /api/auth/logout
const logout = async (req, res) => {
  clearRefreshTokenCookie(res);
  res.json({ success: true, message: 'Logged out' });
};

// @GET /api/auth/me
const getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};

// @POST /api/auth/create-staff
const createStaff = async (req, res) => {
  try {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) return validationResponse;

    const { name, email: rawStaffEmail, password, role, phone, franchise_id } = req.body;
    const email = rawStaffEmail?.toLowerCase().trim();

    const allowed = {
      master_admin:    ['master_admin', 'franchise_owner', 'manager', 'pos_staff', 'shift_operator', 'kitchen_staff', 'waiter'],
      franchise_owner: ['manager', 'pos_staff', 'shift_operator', 'kitchen_staff', 'waiter'],
      manager:         ['pos_staff', 'shift_operator', 'kitchen_staff', 'waiter'],
    };

    if (!allowed[req.user.role] || !allowed[req.user.role].includes(role)) {
      return res.status(403).json({ success: false, message: 'You cannot create this role' });
    }

    let assignedFranchise = franchise_id;
    if (req.user.role !== 'master_admin') {
      assignedFranchise = req.user.franchise_id._id || req.user.franchise_id;
    }

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ success: false, message: 'Email already in use' });

    const user = await User.create({
      name,
      email,
      password,
      role,
      phone,
      franchise_id: role === 'master_admin' ? null : assignedFranchise,
      assigned_tables: role === 'waiter' ? (req.body.assigned_tables || []) : [],
    });

    res.status(201).json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @PUT /api/auth/change-password
const changePassword = async (req, res) => {
  try {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) return validationResponse;

    const { currentPassword, newPassword } = req.body;

    // ── BUG FIX: Re-fetch user with password field for comparison
    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Current password incorrect' });

    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const { sendMail } = require('../utils/mailer');
    const crypto = require('crypto');

    const user = await User.findOne({ email: email.toLowerCase().trim(), role: 'master_admin' });

    if (!user) {
      // Prevent email enumeration — always return same response
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 30 * 60 * 1000;

    user.resetPasswordToken  = token;
    user.resetPasswordExpire = new Date(expires);
    await user.save({ validateBeforeSave: false });

    const FRONTEND = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
    const resetUrl = `${FRONTEND}/reset-password?token=${token}`;

    try {
      const mailResult = await sendMail({
        to: user.email,
        subject: 'UTC Café — Reset Your Password',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#111;color:#fff;border-radius:12px">
            <h2 style="color:#f5c842">Password Reset Request</h2>
            <p>Click the button below to reset your master admin password. This link expires in <strong>30 minutes</strong>.</p>
            <a href="${resetUrl}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:#f5c842;color:#000;border-radius:8px;font-weight:bold;text-decoration:none">Reset Password</a>
            <p style="color:#888;font-size:12px">If the button doesn't work, copy this link:<br>${resetUrl}</p>
            <p style="font-size:12px;color:#888">If you didn't request this, ignore this email.</p>
          </div>
        `,
      });

      const response = { success: true, message: 'Reset link sent to your email.' };
      if (mailResult?.previewUrl) {
        response.previewUrl = mailResult.previewUrl;
        response.message = 'TEST MODE: Open the previewUrl to see the email.';
      }
      return res.json(response);
    } catch (mailErr) {
      console.error('[ForgotPassword] Failed to send email:', mailErr.message);
      user.resetPasswordToken  = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(500).json({ success: false, message: 'Failed to send reset email. Please try again.' });
    }
  } catch (err) {
    console.error('[ForgotPassword] Unexpected error:', err.message);
    res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password || password.length < 6)
      return res.status(400).json({ success: false, message: 'Token and new password (min 6 chars) required' });

    const user = await User.findOne({
      resetPasswordToken:  token,
      resetPasswordExpire: { $gt: Date.now() },
      role: 'master_admin',
    });
    if (!user) return res.status(400).json({ success: false, message: 'Reset link is invalid or has expired' });

    user.password            = password;
    user.resetPasswordToken  = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @POST /api/auth/verify-edit-pin
async function verifyEditPin(req, res) {
  try {
    const { pin, franchise_id } = req.body;
    if (!pin || !franchise_id) {
      return res.status(400).json({ success: false, message: 'PIN and franchise ID required' });
    }

    const Franchise = require('../models/Franchise');
    const bcrypt = require('bcryptjs');
    const franchise = await Franchise.findById(franchise_id).select('edit_pin name');
    if (!franchise) return res.status(404).json({ success: false, message: 'Franchise not found' });
    if (!franchise.edit_pin) {
      return res.status(400).json({ success: false, message: 'No edit PIN set for this franchise. Please set one in settings.' });
    }

    const isMatch = await bcrypt.compare(String(pin), franchise.edit_pin);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Incorrect PIN' });

    const { logAudit } = require('../utils/auditHelper');
    await logAudit('ORDER_EDIT_PIN_VERIFIED', req, franchise._id, 'Franchise', {
      franchiseName: franchise.name,
    });

    res.json({ success: true, message: 'PIN verified' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { login, refresh, logout, getMe, createStaff, changePassword, forgotPassword, resetPassword, verifyEditPin };
