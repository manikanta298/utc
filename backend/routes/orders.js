// ── routes/orders.js
const express = require('express');
const router = express.Router();
const { createOrder, getOrders, getOrderHistory, getOrderById, exportOrdersCsv, archiveOldOrders } = require('../controllers/orderController');
const { protect, authorise } = require('../middleware/auth');
const { enforceActiveFranchise } = require('../middleware/franchiseGuard');

router.get('/', protect, enforceActiveFranchise, getOrders);
router.get('/history', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager', 'pos_staff', 'shift_operator'), getOrderHistory);
router.get('/export.csv', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager'), exportOrdersCsv);
router.post('/archive-old', protect, authorise('master_admin'), archiveOldOrders);
router.post('/', protect, enforceActiveFranchise, authorise('pos_staff', 'shift_operator', 'manager', 'franchise_owner'), createOrder);
router.get('/:id', protect, enforceActiveFranchise, getOrderById);

module.exports = router;
