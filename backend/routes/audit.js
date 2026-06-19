const express = require('express');
const router = express.Router();
const { getAuditLogs, editOrder, editSessionPayment, deleteSessionPayment } = require('../controllers/auditController');
const { protect, authorise } = require('../middleware/auth');

router.get('/', protect, authorise('master_admin'), getAuditLogs);
router.patch('/orders/:id/edit', protect, authorise('master_admin', 'franchise_owner', 'manager'), editOrder);
router.patch('/sessions/:id/payment/edit', protect, authorise('master_admin'), editSessionPayment);
router.delete('/sessions/:id/payment/:paymentId', protect, authorise('master_admin'), deleteSessionPayment);

module.exports = router;
