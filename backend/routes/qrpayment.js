/**
 * QR Payment routes — dynamic UPI QR with 5-min expiry
 * POST /api/qrpayment/generate  — generate QR for a session amount
 * POST /api/qrpayment/confirm   — confirm payment (POS / webhook)
 * GET  /api/qrpayment/:id/status — poll status
 * POST /api/qrpayment/:id/expire — manual expire
 */
const express      = require('express');
const router       = express.Router();
const QRPayment    = require('../models/QRPayment');
const OrderSession = require('../models/OrderSession');
const { protect }  = require('../middleware/auth');
const { enforceActiveFranchise } = require('../middleware/franchiseGuard');
const QRCode       = require('qrcode');

const EXPIRY_MINUTES = 5;

// ── Generate QR ───────────────────────────────────────────────────────────────
router.post('/generate', protect, enforceActiveFranchise, async (req, res) => {
  try {
    const { sessionId, amount, method = 'UPI', upiId, merchantName } = req.body;
    if (!sessionId || !amount) return res.status(400).json({ success: false, message: 'sessionId and amount required' });

    const session = await OrderSession.findById(sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    // Expire any previous pending QR for this session
    await QRPayment.updateMany({ sessionId, status: 'pending' }, { $set: { status: 'expired' } });

    // Build UPI deep-link string
    const vpa   = upiId || process.env.DEFAULT_UPI_ID || 'merchant@upi';
    const mName = encodeURIComponent(merchantName || 'UTC Cafe');
    const amt   = Number(amount).toFixed(2);
    const txnRef = `UTC${Date.now()}`;
    const upiLink = `upi://pay?pa=${vpa}&pn=${mName}&am=${amt}&cu=INR&tn=Order%20Payment&tr=${txnRef}`;

    // Generate QR image as base64
    const qrImage = await QRCode.toDataURL(upiLink, { width: 300, margin: 2 });

    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);
    const qrPayment = await QRPayment.create({
      sessionId,
      franchiseId: session.franchiseId,
      amount: Number(amount),
      method,
      qrData: qrImage,
      expiresAt,
      createdBy: req.user._id,
    });

    // Emit QR created event so frontend can show modal
    const io = req.app.get('io');
    if (io) {
      io.to(`pos:${session.franchiseId}`).emit('qrpayment:created', {
        qrPaymentId: qrPayment._id,
        sessionId,
        amount: Number(amount),
        expiresAt,
        qrData: qrImage,
      });
    }

    // Auto-expire after 5 min via server-side setTimeout
    setTimeout(async () => {
      try {
        const qr = await QRPayment.findById(qrPayment._id);
        if (qr && qr.status === 'pending') {
          qr.status = 'expired';
          await qr.save();
          if (io) {
            io.to(`pos:${session.franchiseId}`).emit('qrpayment:expired', { qrPaymentId: qrPayment._id, sessionId });
          }
        }
      } catch {}
    }, EXPIRY_MINUTES * 60 * 1000);

    res.status(201).json({
      success: true,
      qrPaymentId: qrPayment._id,
      qrData:      qrImage,
      upiLink,
      amount:      Number(amount),
      expiresAt,
      expiresInSeconds: EXPIRY_MINUTES * 60,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Confirm payment ───────────────────────────────────────────────────────────
router.post('/confirm', protect, enforceActiveFranchise, async (req, res) => {
  try {
    const { qrPaymentId, reference } = req.body;
    if (!qrPaymentId) return res.status(400).json({ success: false, message: 'qrPaymentId required' });

    const qr = await QRPayment.findById(qrPaymentId);
    if (!qr) return res.status(404).json({ success: false, message: 'QR payment not found' });
    if (qr.status !== 'pending') return res.status(400).json({ success: false, message: `QR is already ${qr.status}` });
    if (qr.expiresAt < new Date()) {
      qr.status = 'expired'; await qr.save();
      return res.status(400).json({ success: false, message: 'QR payment has expired' });
    }

    qr.status      = 'completed';
    qr.reference   = reference || '';
    qr.completedAt = new Date();
    await qr.save();

    // Update session paidAmount
    const session = await OrderSession.findById(qr.sessionId);
    if (session) {
      session.paidAmount += qr.amount;
      session.payments.push({ amount: qr.amount, method: 'UPI', reference: reference || '', receivedBy: req.user._id });
      if (session.paidAmount >= (session.totalAmount || 0)) {
        session.paymentStatus = 'fully_paid';
        session.status        = 'paid';
      } else {
        session.paymentStatus = 'partially_paid';
      }
      await session.save();
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`pos:${qr.franchiseId}`).emit('qrpayment:completed', {
        qrPaymentId: qr._id,
        sessionId:   qr.sessionId,
        amount:      qr.amount,
        reference:   qr.reference,
      });
      io.to(`franchise:${qr.franchiseId}`).emit('payment:updated', { sessionId: qr.sessionId });
    }

    res.json({ success: true, qrPayment: qr, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Poll status ───────────────────────────────────────────────────────────────
router.get('/:id/status', protect, async (req, res) => {
  try {
    const qr = await QRPayment.findById(req.params.id).lean();
    if (!qr) return res.status(404).json({ success: false, message: 'Not found' });
    const secondsLeft = Math.max(0, Math.floor((new Date(qr.expiresAt) - Date.now()) / 1000));
    res.json({ success: true, status: qr.status, secondsLeft, qrPayment: qr });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Manual expire ─────────────────────────────────────────────────────────────
router.post('/:id/expire', protect, async (req, res) => {
  try {
    const qr = await QRPayment.findByIdAndUpdate(req.params.id, { status: 'expired' }, { new: true });
    if (!qr) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, qrPayment: qr });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
