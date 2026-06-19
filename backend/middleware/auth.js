const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { checkRole } = require('./rbac');

const parseCookies = (cookieHeader = '') =>
  cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const separator = part.indexOf('=');
      if (separator === -1) return acc;
      const key = part.slice(0, separator).trim();
      const value = decodeURIComponent(part.slice(separator + 1).trim());
      acc[key] = value;
      return acc;
    }, {});

const getBearerToken = (req) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return req.headers.authorization.split(' ')[1];
  }
  return null;
};

// ── BUG FIX: Validate JWT_SECRET is configured at startup
if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}

// Verify JWT access token
const protect = async (req, res, next) => {
  const token = getBearerToken(req);

  if (!token) {
    console.warn(`[auth] 401 no-token: ${req.method} ${req.path}`);
    return res.status(401).json({ success: false, message: 'Not authorised - no token' });
  }

  if (token.length > 2048) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded || !decoded.id) {
      console.warn(`[auth] 401 bad-payload: ${req.method} ${req.path}`);
      return res.status(401).json({ success: false, message: 'Invalid token payload' });
    }

    if (decoded.type === 'refresh') {
      console.warn(`[auth] 401 refresh-as-access: ${req.method} ${req.path}`);
      return res.status(401).json({ success: false, message: 'Invalid token type' });
    }

    req.user = await User.findById(decoded.id)
      .populate('franchise_id', 'name state franchiseCode city status isActive')
      .select('-password -resetPasswordToken -resetPasswordExpire');

    if (!req.user || !req.user.isActive) {
      console.warn(`[auth] 401 user-not-found: ${decoded.id} ${req.method} ${req.path}`);
      return res.status(401).json({ success: false, message: 'User not found or deactivated' });
    }

    next();
  } catch (err) {
    console.warn(`[auth] 401 jwt-error: ${err.message} ${req.method} ${req.path}`);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

const authorise = (...roles) => checkRole(...roles);

// Refresh token guard for /auth/refresh
const protectRefreshToken = (req, res, next) => {
  const cookies = parseCookies(req.headers.cookie);

  let refreshToken = cookies.utc_refresh_token;

  if (!refreshToken && req.headers.authorization?.startsWith('Refresh ')) {
    refreshToken = req.headers.authorization.split(' ')[1];
  }
  if (!refreshToken && req.body?.refreshToken) {
    refreshToken = req.body.refreshToken;
  }

  if (!refreshToken) {
    console.warn('[auth] refresh 401: no refresh token in cookie/header/body');
    return res.status(401).json({ success: false, message: 'Refresh token missing' });
  }

  // ── BUG FIX: Prevent oversized token DoS
  if (refreshToken.length > 2048) {
    return res.status(401).json({ success: false, message: 'Invalid refresh token' });
  }

  try {
    const payload = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
    );

    // ── BUG FIX: Ensure this is actually a refresh token, not an access token
    if (!payload || !payload.id) {
      console.warn('[auth] refresh 401: invalid payload', JSON.stringify(payload));
      return res.status(401).json({ success: false, message: 'Invalid refresh token payload' });
    }

    req.refreshTokenPayload = payload;
    next();
  } catch (err) {
    console.warn('[auth] refresh 401 jwt-error:', err.message);
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
};

// Ensure franchise data isolation
const franchiseGuard = (paramName = 'franchiseId') => (req, res, next) => {
  if (req.user.role === 'master_admin') return next();
  const requestedFranchise =
    req.params[paramName] || req.body.franchise_id || req.query.franchise_id;
  if (
    requestedFranchise &&
    req.user.franchise_id &&
    requestedFranchise.toString() !== req.user.franchise_id._id.toString()
  ) {
    return res.status(403).json({ success: false, message: 'Access denied to this franchise data' });
  }
  next();
};

module.exports = { protect, authorise, franchiseGuard, protectRefreshToken };
