const express = require('express');
const router = express.Router();
const { getPaymentConfig, savePaymentConfig, generatePaymentQR, verifyUpiCallback } = require('../controllers/paymentConfigController');
const { protect, authorise } = require('../middleware/auth');

router.get('/:franchiseId', protect, authorise('master_admin', 'franchise_owner', 'manager'), getPaymentConfig);
router.post('/:franchiseId', protect, authorise('master_admin', 'franchise_owner', 'manager'), savePaymentConfig);
router.get('/:franchiseId/qr', protect, generatePaymentQR);
router.post('/:franchiseId/verify', protect, authorise('master_admin', 'pos_staff', 'shift_operator', 'manager'), verifyUpiCallback);

module.exports = router;
