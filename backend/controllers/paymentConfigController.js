const FranchisePayment = require('../models/FranchisePayment');
const OrderSession = require('../models/OrderSession');
const { logAudit } = require('../utils/auditHelper');

// GET /api/payment-config/:franchiseId
const getPaymentConfig = async (req, res) => {
  try {
    const config = await FranchisePayment.findOne({ franchiseId: req.params.franchiseId });
    res.json({ success: true, config: config || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/payment-config/:franchiseId
const savePaymentConfig = async (req, res) => {
  try {
    const { bankAccountName, bankAccountNumber, ifscCode, upiId, upiQrImageUrl, acceptedMethods } = req.body;
    const config = await FranchisePayment.findOneAndUpdate(
      { franchiseId: req.params.franchiseId },
      { bankAccountName, bankAccountNumber, ifscCode, upiId, upiQrImageUrl, acceptedMethods, updatedBy: req.user._id },
      { upsert: true, new: true }
    );
    await logAudit('PAYMENT_CONFIG_UPDATED', req, config._id, 'FranchisePayment', { franchiseId: req.params.franchiseId });
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/payment-config/:franchiseId/qr — Generate UPI QR for payment
const generatePaymentQR = async (req, res) => {
  try {
    const { amount, sessionId } = req.query;
    const config = await FranchisePayment.findOne({ franchiseId: req.params.franchiseId })
      .populate('franchiseId', 'name');

    if (!config || !config.upiId) {
      return res.status(404).json({ success: false, message: 'UPI not configured for this franchise' });
    }

    let paymentAmount = amount;
    if (!paymentAmount && sessionId) {
      const session = await OrderSession.findOne({ _id: sessionId, franchiseId: req.params.franchiseId }).select('totalAmount paidAmount');
      if (session) paymentAmount = Math.max(0, Number(session.totalAmount || 0) - Number(session.paidAmount || 0)).toFixed(2);
    }

    const upiLink = `upi://pay?pa=${config.upiId}&pn=${encodeURIComponent(config.franchiseId?.name || 'UTC Cafe')}&am=${paymentAmount || ''}&cu=INR&tn=${encodeURIComponent(`UTC Cafe ${sessionId || ''}`.trim())}`;

    let qrDataUrl = upiLink;
    try {
      const QRCode = require('qrcode');
      qrDataUrl = await QRCode.toDataURL(upiLink);
    } catch {
      qrDataUrl = upiLink;
    }

    res.json({
      success: true,
      qr: qrDataUrl,
      upiId: config.upiId,
      amount: paymentAmount || '',
      franchiseName: config.franchiseId?.name || '',
      upiLink,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/payment-config/:franchiseId/verify
const verifyUpiCallback = async (req, res) => {
  try {
    const { sessionId, reference, amount, status } = req.body;
    if (!sessionId || !reference) {
      return res.status(400).json({ success: false, message: 'Session and UPI reference are required' });
    }

    const session = await OrderSession.findOne({ _id: sessionId, franchiseId: req.params.franchiseId });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    const expected = Math.max(0, Number(session.totalAmount || 0) - Number(session.paidAmount || 0));
    const paid = Number(amount || expected);
    const verified = ['success', 'paid', 'completed'].includes(String(status || 'success').toLowerCase()) && paid > 0;

    await logAudit('UPI_CALLBACK_VERIFIED', req, session._id, 'OrderSession', {
      reference,
      amount: paid,
      expectedAmount: expected,
      status: status || 'success',
      verified,
    });

    res.json({ success: true, verified, expectedAmount: expected, amount: paid, reference });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getPaymentConfig, savePaymentConfig, generatePaymentQR, verifyUpiCallback };
