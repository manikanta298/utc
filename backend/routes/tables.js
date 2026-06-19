const express = require('express');
const router  = express.Router();
const {
  getTables, createTable, deleteTable,
  getTableMap, verifyTableQR, generateTableQR, updateTableStatus,
  mergeTables, switchTable, getTableSummary,
} = require('../controllers/tableController');
const { protect, authorise } = require('../middleware/auth');
const { enforceActiveFranchise } = require('../middleware/franchiseGuard');

// canAdmin: full control (add/delete tables, generate QR)
const canAdmin = ['master_admin', 'franchise_owner', 'manager', 'pos_staff', 'shift_operator'];
// canEdit: operational editing (status override, merge, switch) — includes waiter
const canEdit  = [...canAdmin, 'waiter'];

router.get('/',        protect, enforceActiveFranchise, getTables);
router.get('/map',     protect, enforceActiveFranchise, getTableMap);
router.get('/summary', protect, enforceActiveFranchise, getTableSummary);
router.post('/',   protect, enforceActiveFranchise, authorise(...canAdmin), createTable);
router.post('/merge',  protect, enforceActiveFranchise, authorise(...canEdit), mergeTables);
router.post('/switch', protect, enforceActiveFranchise, authorise(...canEdit), switchTable);
router.delete('/:id', protect, enforceActiveFranchise, authorise(...canAdmin), deleteTable);
router.patch('/:id/status',      protect, enforceActiveFranchise, authorise(...canEdit), updateTableStatus);
// Waiter requests bill — marks table as bill_pending and notifies POS via socket
router.post('/:id/bill-request', protect, enforceActiveFranchise, authorise(...canEdit), async (req, res) => {
  try {
    const Table = require('../models/Table');
    const table = await Table.findByIdAndUpdate(
      req.params.id,
      { status: 'bill_pending' },
      { new: true }
    );
    if (!table) return res.status(404).json({ success: false, message: 'Table not found' });
    const io = req.app.get('io');
    const franchiseId = (table.franchiseId || '').toString();
    if (io) {
      io.to(`franchise:${franchiseId}`).emit('table:statusUpdated', {
        tableId: table._id, status: 'bill_pending',
      });
      io.to(`franchise:${franchiseId}`).emit('waiter:bill_requested', {
        tableId: table._id, tableNumber: table.tableNumber,
        requestedBy: req.user._id, requestedAt: new Date(),
      });
    }
    res.json({ success: true, message: 'Bill requested', table });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
router.put('/:id',          protect, enforceActiveFranchise, authorise(...canEdit), updateTableStatus);
router.post('/:id/generate-qr', protect, enforceActiveFranchise, authorise(...canAdmin), generateTableQR);
router.post('/verify-qr', verifyTableQR);

module.exports = router;
