const {
  generateQrPayment,
  scheduleQrAutoExpire,
  confirmQrPayment,
  getQrPaymentStatus,
  expireQrPaymentManually,
} = require('../services/paymentService');

const handleServiceError = (res, err) => {
  res.status(err.status || 500).json({ success: false, message: err.message });
};

// POST /api/qrpayment/generate
const generateQr = async (req, res) => {
  try {
    const { sessionId, amount, method, upiId, merchantName } = req.body;
    const { qrPayment, qrImage, upiLink, expiresAt, session } = await generateQrPayment({
      sessionId, amount, method, upiId, merchantName, createdBy: req.user._id,
    });

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
    scheduleQrAutoExpire(qrPayment._id, session.franchiseId, io);

    res.status(201).json({
      success: true,
      qrPaymentId: qrPayment._id,
      qrData: qrImage,
      upiLink,
      amount: Number(amount),
      expiresAt,
      expiresInSeconds: 5 * 60,
    });
  } catch (err) {
    handleServiceError(res, err);
  }
};

// POST /api/qrpayment/confirm
const confirmQr = async (req, res) => {
  try {
    const { qrPaymentId, reference } = req.body;
    const { qr, session } = await confirmQrPayment({ qrPaymentId, reference, receivedBy: req.user._id });

    const io = req.app.get('io');
    if (io) {
      io.to(`pos:${qr.franchiseId}`).emit('qrpayment:completed', {
        qrPaymentId: qr._id,
        sessionId: qr.sessionId,
        amount: qr.amount,
        reference: qr.reference,
      });
      io.to(`franchise:${qr.franchiseId}`).emit('payment:updated', { sessionId: qr.sessionId });
    }

    res.json({ success: true, qrPayment: qr, session });
  } catch (err) {
    handleServiceError(res, err);
  }
};

// GET /api/qrpayment/:id/status
const getQrStatus = async (req, res) => {
  try {
    const { qr, secondsLeft } = await getQrPaymentStatus(req.params.id);
    res.json({ success: true, status: qr.status, secondsLeft, qrPayment: qr });
  } catch (err) {
    handleServiceError(res, err);
  }
};

// POST /api/qrpayment/:id/expire
const expireQr = async (req, res) => {
  try {
    const qrPayment = await expireQrPaymentManually(req.params.id);
    res.json({ success: true, qrPayment });
  } catch (err) {
    handleServiceError(res, err);
  }
};

module.exports = { generateQr, confirmQr, getQrStatus, expireQr };
