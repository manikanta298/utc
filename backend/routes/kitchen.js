const express = require('express');
const router = express.Router();
const { getKitchenOrders, updateKitchenStatus, getKitchenHistory, getKitchenStats, acceptDelivery } = require('../controllers/kitchenController');
const { protect, authorise } = require('../middleware/auth');
const { enforceActiveFranchise } = require('../middleware/franchiseGuard');

const kitchen = ['kitchen_staff', 'manager', 'franchise_owner'];

// NOTE: /history and /stats BEFORE /:id to avoid Express route collision
router.get('/orders/history', protect, enforceActiveFranchise, authorise(...kitchen), getKitchenHistory);
router.get('/stats',          protect, enforceActiveFranchise, authorise(...kitchen), getKitchenStats);
router.get('/orders',         protect, enforceActiveFranchise, authorise(...kitchen), getKitchenOrders);
router.put('/orders/:id/status',          protect, enforceActiveFranchise, authorise(...kitchen), updateKitchenStatus);
// Waiter/POS marks order as collected — sets Delivered + emits notification
router.patch('/orders/:id/accept-delivery', protect, enforceActiveFranchise, authorise('waiter','pos_staff','shift_operator','master_admin','franchise_owner'), acceptDelivery);

module.exports = router;
