const express = require('express');
const router  = express.Router();
const {
  getWaiterProfile, getMyOrders, updateOrderStatus,
  assignTables, listWaiters,
  placeWaiterOrder, getPendingSessions,
  approveWaiterSession, rejectWaiterSession, cancelWaiterSession,
} = require('../controllers/waiterController');
const { protect, authorise } = require('../middleware/auth');

const MANAGERS = ['master_admin', 'franchise_owner', 'manager'];
const POS_OPS  = ['master_admin', 'franchise_owner', 'manager', 'pos_staff', 'shift_operator'];

// Waiter routes
router.get('/me',              protect, authorise('waiter'),   getWaiterProfile);
router.get('/my-orders',       protect, authorise('waiter'),   getMyOrders);
router.get('/sessions',        protect, authorise('waiter'),   getMyOrders); // alias
router.post('/place-order',    protect, authorise('waiter'),   placeWaiterOrder);
router.patch('/orders/:orderId/status', protect, authorise('waiter'), updateOrderStatus);

// POS operator routes — manage waiter-submitted pending orders
router.get('/pending-sessions',          protect, authorise(...POS_OPS), getPendingSessions);
router.post('/sessions/:id/approve',     protect, authorise(...POS_OPS), approveWaiterSession);
router.post('/sessions/:id/reject',      protect, authorise(...POS_OPS), rejectWaiterSession);
router.post('/sessions/:id/cancel',      protect, authorise('waiter', ...POS_OPS), cancelWaiterSession);

// Manager routes
router.get('/list',                      protect, authorise(...MANAGERS), listWaiters);
router.put('/:waiterId/assign-tables',   protect, authorise(...MANAGERS), assignTables);

module.exports = router;
