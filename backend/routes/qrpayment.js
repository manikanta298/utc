/**
 * QR Payment routes — dynamic UPI QR with 5-min expiry
 * POST /api/qrpayment/generate  — generate QR for a session amount
 * POST /api/qrpayment/confirm   — confirm payment (POS / webhook)
 * GET  /api/qrpayment/:id/status — poll status
 * POST /api/qrpayment/:id/expire — manual expire
 *
 * Business logic lives in services/paymentService.js and
 * controllers/paymentController.js — this file is just route wiring.
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { enforceActiveFranchise } = require('../middleware/franchiseGuard');
const { generateQr, confirmQr, getQrStatus, expireQr } = require('../controllers/paymentController');

router.post('/generate', protect, enforceActiveFranchise, generateQr);
router.post('/confirm', protect, enforceActiveFranchise, confirmQr);
router.get('/:id/status', protect, getQrStatus);
router.post('/:id/expire', protect, expireQr);

module.exports = router;
