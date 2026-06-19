const express = require('express');
const router = express.Router();
const {
  getActiveSession,
  listSessions,
  getSessionById,
  getReadyBoard,
  settleSession,
  getSessionReceipt,
  getSessionPdf,
} = require('../controllers/tokenSessionController');
const { protect, authorise } = require('../middleware/auth');
const { enforceActiveFranchise } = require('../middleware/franchiseGuard');

router.get('/', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager', 'pos_staff', 'shift_operator', 'kitchen_staff'), listSessions);
router.get('/active', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager', 'pos_staff', 'shift_operator'), getActiveSession);
router.get('/ready-board', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager', 'kitchen_staff', 'pos_staff', 'shift_operator'), getReadyBoard);
router.get('/:id/receipt', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager', 'pos_staff', 'shift_operator'), getSessionReceipt);
router.get('/:id/pdf', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager', 'pos_staff', 'shift_operator'), getSessionPdf);
router.get('/:id', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager', 'pos_staff', 'shift_operator', 'kitchen_staff'), getSessionById);
router.patch('/:id/settle', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager', 'pos_staff', 'shift_operator'), settleSession);

module.exports = router;
