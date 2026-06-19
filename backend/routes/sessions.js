const express = require('express');
const router = express.Router();
const {
  startSession, addOrderToSession, getSession, generateBill,
  recordPayment, getSessions, linkCustomer,
  holdSession, resumeSession, getHeldSessions, cancelSession,
} = require('../controllers/sessionController');
const { protect, authorise } = require('../middleware/auth');
const { enforceActiveFranchise } = require('../middleware/franchiseGuard');

const posRoles = ['pos_staff', 'shift_operator', 'manager', 'franchise_owner', 'waiter'];

router.get('/',      protect, enforceActiveFranchise, authorise('master_admin', ...posRoles), getSessions);
router.get('/held',  protect, enforceActiveFranchise, authorise('master_admin', ...posRoles), getHeldSessions);
router.post('/start', protect, enforceActiveFranchise, authorise(...posRoles), startSession);
router.get('/:sessionId',           protect, enforceActiveFranchise, authorise('master_admin', ...posRoles), getSession);
router.post('/:sessionId/orders',   protect, enforceActiveFranchise, authorise(...posRoles), addOrderToSession);
router.post('/:sessionId/customer', protect, enforceActiveFranchise, authorise(...posRoles), linkCustomer);
router.post('/:sessionId/bill',     protect, enforceActiveFranchise, authorise(...posRoles), generateBill);
router.post('/:sessionId/payment',  protect, enforceActiveFranchise, authorise(...posRoles), recordPayment);
router.post('/:sessionId/hold',     protect, enforceActiveFranchise, authorise(...posRoles), holdSession);
router.post('/:sessionId/resume',   protect, enforceActiveFranchise, authorise(...posRoles), resumeSession);
router.post('/:sessionId/cancel',   protect, enforceActiveFranchise, authorise(...posRoles), cancelSession);

module.exports = router;
