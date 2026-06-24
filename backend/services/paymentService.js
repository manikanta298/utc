const QRPayment = require('../models/QRPayment');
const OrderSession = require('../models/OrderSession');
const QRCode = require('qrcode');

const QR_EXPIRY_MINUTES = 5;

/**
 * Single source of truth for "what payment status does this paidAmount/
 * totalAmount combination represent". Previously duplicated (and slightly
 * inconsistent) between routes/qrpayment.js and sessionController.js.
 *
 * NOTE: preserved exactly as both call sites already behaved — when
 * paidAmount < totalAmount, balance is always > 0, so the 'advance_paid'
 * branch is unreachable here, same as it was in both originals. Not fixing
 * that now since this is a pure dedup/refactor, not a behavior change.
 */
function derivePaymentStatus(paidAmount, totalAmount) {
  const balance = +((totalAmount || 0) - (paidAmount || 0)).toFixed(2);

  if (paidAmount >= (totalAmount || 0)) {
    return { paymentStatus: 'fully_paid', isFullyPaid: true, balance };
  }
  if (paidAmount > 0) {
    return { paymentStatus: balance < 0 ? 'advance_paid' : 'partially_paid', isFullyPaid: false, balance };
  }
  return { paymentStatus: 'unpaid', isFullyPaid: false, balance };
}

function buildUpiLink({ amount, upiId, merchantName }) {
  const vpa = upiId || process.env.DEFAULT_UPI_ID || 'merchant@upi';
  const mName = encodeURIComponent(merchantName || 'UTC Cafe');
  const amt = Number(amount).toFixed(2);
  const txnRef = `UTC${Date.now()}`;
  return `upi://pay?pa=${vpa}&pn=${mName}&am=${amt}&cu=INR&tn=Order%20Payment&tr=${txnRef}`;
}

/** Throws a tagged error the controller can map to the right HTTP status. */
function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

async function generateQrPayment({ sessionId, amount, method = 'UPI', upiId, merchantName, createdBy }) {
  if (!sessionId || !amount) fail(400, 'sessionId and amount required');

  const session = await OrderSession.findById(sessionId);
  if (!session) fail(404, 'Session not found');

  await QRPayment.updateMany({ sessionId, status: 'pending' }, { $set: { status: 'expired' } });

  const upiLink = buildUpiLink({ amount, upiId, merchantName });
  const qrImage = await QRCode.toDataURL(upiLink, { width: 300, margin: 2 });
  const expiresAt = new Date(Date.now() + QR_EXPIRY_MINUTES * 60 * 1000);

  const qrPayment = await QRPayment.create({
    sessionId,
    franchiseId: session.franchiseId,
    amount: Number(amount),
    method,
    qrData: qrImage,
    expiresAt,
    createdBy,
  });

  return { qrPayment, qrImage, upiLink, expiresAt, session };
}

/** Schedules the server-side auto-expire. Takes io explicitly (DI) so this stays req/res-free. */
function scheduleQrAutoExpire(qrPaymentId, franchiseId, io) {
  setTimeout(async () => {
    try {
      const qr = await QRPayment.findById(qrPaymentId);
      if (qr && qr.status === 'pending') {
        qr.status = 'expired';
        await qr.save();
        if (io) io.to(`pos:${franchiseId}`).emit('qrpayment:expired', { qrPaymentId, sessionId: qr.sessionId });
      }
    } catch {
      // best-effort cleanup only — nothing to do if this fails
    }
  }, QR_EXPIRY_MINUTES * 60 * 1000);
}

async function confirmQrPayment({ qrPaymentId, reference, receivedBy }) {
  if (!qrPaymentId) fail(400, 'qrPaymentId required');

  const qr = await QRPayment.findById(qrPaymentId);
  if (!qr) fail(404, 'QR payment not found');
  if (qr.status !== 'pending') fail(400, `QR is already ${qr.status}`);
  if (qr.expiresAt < new Date()) {
    qr.status = 'expired';
    await qr.save();
    fail(400, 'QR payment has expired');
  }

  qr.status = 'completed';
  qr.reference = reference || '';
  qr.completedAt = new Date();
  await qr.save();

  const session = await OrderSession.findById(qr.sessionId);
  if (session) {
    session.paidAmount += qr.amount;
    session.payments.push({ amount: qr.amount, method: 'UPI', reference: reference || '', receivedBy });

    const { paymentStatus, isFullyPaid } = derivePaymentStatus(session.paidAmount, session.totalAmount);
    session.paymentStatus = paymentStatus;
    if (isFullyPaid) session.status = 'paid';

    await session.save();
  }

  return { qr, session };
}

async function getQrPaymentStatus(id) {
  const qr = await QRPayment.findById(id).lean();
  if (!qr) fail(404, 'Not found');
  const secondsLeft = Math.max(0, Math.floor((new Date(qr.expiresAt) - Date.now()) / 1000));
  return { qr, secondsLeft };
}

async function expireQrPaymentManually(id) {
  const qr = await QRPayment.findByIdAndUpdate(id, { status: 'expired' }, { new: true });
  if (!qr) fail(404, 'Not found');
  return qr;
}

module.exports = {
  derivePaymentStatus,
  buildUpiLink,
  generateQrPayment,
  scheduleQrAutoExpire,
  confirmQrPayment,
  getQrPaymentStatus,
  expireQrPaymentManually,
};
