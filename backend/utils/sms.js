/**
 * SMS Notification Service — Twilio
 *
 * SMS_ENABLED=false  → logs messages to console (safe for dev/testing)
 * SMS_ENABLED=true   → sends real SMS via Twilio
 *
 * All messages are sent to the customer's phone number.
 * Phone numbers must be in E.164 format: +91XXXXXXXXXX
 */

let twilioClient = null;

const getClient = () => {
  if (twilioClient) return twilioClient;
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return null;
  if (!TWILIO_ACCOUNT_SID.startsWith('AC')) return null;
  const twilio = require('twilio');
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return twilioClient;
};

// Format Indian mobile numbers to E.164
const formatPhone = (phone) => {
  const cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('91') && cleaned.length === 12) return `+${cleaned}`;
  if (cleaned.length === 10) return `+91${cleaned}`;
  return `+${cleaned}`;
};

/**
 * Send a single SMS
 * @param {string} to - customer phone number
 * @param {string} message - SMS body
 */
const sendSMS = async (to, message) => {
  const smsEnabled = process.env.SMS_ENABLED === 'true';
  const formattedPhone = formatPhone(to);

  if (!smsEnabled) {
    // Dev mode — just log so you can verify messages without spending credits
    console.log(`\n📱 [SMS — Dev Mode — not sent]\n   To: ${formattedPhone}\n   Message: ${message}\n`);
    return { success: true, dev: true };
  }

  const client = getClient();
  if (!client) {
    console.warn('SMS_ENABLED=true but Twilio credentials missing or invalid — skipping SMS');
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    const msg = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone,
    });
    console.log(`✓ SMS sent to ${formattedPhone} — SID: ${msg.sid}`);
    return { success: true, sid: msg.sid };
  } catch (err) {
    console.error(`✗ SMS failed to ${formattedPhone}:`, err.message);
    // Don't throw — SMS failure should never crash an order flow
    return { success: false, error: err.message };
  }
};

// ─── Predefined notification messages ──────────────────────────────────────

/**
 * Sent immediately after order is placed and payment confirmed
 */
const sendOrderPlaced = async (phone, customerName, orderNumber, tokenNumber, franchiseName, finalAmount) => {
  const message =
    `Hi ${customerName}! ✅\n` +
    `Your order has been placed successfully at ${franchiseName}.\n` +
    `Order: ${orderNumber} | Token: #${tokenNumber}\n` +
    `Amount Paid: ₹${finalAmount}\n` +
    `We'll notify you as your order progresses. Thank you! ☕`;
  return sendSMS(phone, message);
};

/**
 * Sent when kitchen taps "Accept"
 */
const sendOrderAccepted = async (phone, customerName, tokenNumber, franchiseName) => {
  const message =
    `Hi ${customerName}! 👨‍🍳\n` +
    `Your order (Token #${tokenNumber}) has been accepted by the kitchen at ${franchiseName}.\n` +
    `We'll update you when it starts being prepared.`;
  return sendSMS(phone, message);
};

/**
 * Sent when kitchen taps "Preparing"
 */
const sendOrderPreparing = async (phone, customerName, tokenNumber) => {
  const message =
    `Hi ${customerName}! 🔥\n` +
    `Your order (Token #${tokenNumber}) is currently being prepared.\n` +
    `Hang tight — it'll be ready soon!`;
  return sendSMS(phone, message);
};

/**
 * Sent when kitchen taps "Ready" — most important notification
 */
const sendOrderReady = async (phone, customerName, tokenNumber, franchiseName) => {
  const message =
    `Hi ${customerName}! 🎉\n` +
    `Your order (Token #${tokenNumber}) is READY for pickup at ${franchiseName}!\n` +
    `Please collect your order from the counter. Enjoy! 😊`;
  return sendSMS(phone, message);
};

module.exports = {
  sendSMS,
  sendOrderPlaced,
  sendOrderAccepted,
  sendOrderPreparing,
  sendOrderReady,
};
