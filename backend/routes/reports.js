const express = require('express');
const router = express.Router();
const { getPaymentReport, getSalesReport } = require('../controllers/reportController');
const { protect, authorise } = require('../middleware/auth');

router.get('/payments', protect, authorise('master_admin', 'franchise_owner', 'manager'), getPaymentReport);
router.get('/sales', protect, authorise('master_admin', 'franchise_owner', 'manager'), getSalesReport);

module.exports = router;
