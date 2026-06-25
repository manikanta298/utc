const { sendMail } = require('./mailer');

// In-memory throttle: at most one alert per key per hour, so a sustained
// attack or ongoing resource issue doesn't flood the inbox.
const lastAlertAt = {};
const ALERT_THROTTLE_MS = 60 * 60 * 1000;

async function sendSecurityAlert(key, subject, html) {
  const now = Date.now();
  if (lastAlertAt[key] && now - lastAlertAt[key] < ALERT_THROTTLE_MS) {
    return { sent: false, reason: 'throttled' };
  }

  const to = process.env.SECURITY_ALERT_EMAIL || process.env.MASTER_EMAIL;
  if (!to) {
    console.warn(`[securityAlert] no recipient configured (set SECURITY_ALERT_EMAIL) - logging only: ${subject}`);
    return { sent: false, reason: 'no_recipient' };
  }

  lastAlertAt[key] = now; // mark as sent before the await, so a slow/failed send doesn't reset the throttle window
  try {
    await sendMail({ to, subject: `[UTC Cafe Security] ${subject}`, html });
    return { sent: true };
  } catch (err) {
    console.error('[securityAlert] failed to send:', err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendSecurityAlert };
