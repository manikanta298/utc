const AuditLog = require('../models/AuditLog');
const { sendSecurityAlert } = require('../utils/securityAlert');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

function isLocked(user) {
  return !!(user.lockUntil && user.lockUntil > new Date());
}

function lockRemainingMs(user) {
  return isLocked(user) ? user.lockUntil.getTime() - Date.now() : 0;
}

/** Records a login attempt for audit purposes — separate from logAudit() since
 * there's no authenticated req.user yet at login time; the "actor" here is
 * the account being targeted, not someone already logged in. */
async function logLoginAttempt({ email, user, success, reason, ip }) {
  try {
    await AuditLog.create({
      action: success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED',
      performedBy: user?._id || null,
      performedByName: user?.name || email,
      performedByRole: user?.role || '',
      targetId: user?._id || null,
      targetModel: 'User',
      details: { email, reason: reason || undefined },
      ipAddress: ip || '',
    });
  } catch (err) {
    console.error('[authSecurity] login audit log failed:', err.message);
  }
}

/** Call after a failed password check. Increments the counter, locks the
 * account if the threshold is hit, and fires a (throttled) security alert. */
async function recordFailedLogin(user, ip) {
  user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

  if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
    user.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
    await user.save({ validateBeforeSave: false });

    sendSecurityAlert(
      `account-locked-${user._id}`,
      `Account locked after repeated failed logins: ${user.email}`,
      `<p>The account <strong>${user.email}</strong> (${user.role}) was locked for 15 minutes after ${MAX_FAILED_ATTEMPTS} failed login attempts.</p>
       <p>Most recent attempt from IP: ${ip || 'unknown'}</p>`
    ).catch((e) => console.error('[authSecurity] alert send error:', e.message));

    return { locked: true, lockUntil: user.lockUntil };
  }

  await user.save({ validateBeforeSave: false });
  return { locked: false, attemptsRemaining: MAX_FAILED_ATTEMPTS - user.failedLoginAttempts };
}

/** Call after a successful login — clears the counters. */
async function recordSuccessfulLogin(user) {
  if (user.failedLoginAttempts > 0 || user.lockUntil) {
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
  }
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });
}

module.exports = {
  MAX_FAILED_ATTEMPTS,
  LOCK_DURATION_MS,
  isLocked,
  lockRemainingMs,
  logLoginAttempt,
  recordFailedLogin,
  recordSuccessfulLogin,
};
