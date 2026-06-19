const express = require('express');
const router = express.Router();
const {
  getAll, create, updateStock, getDailyUsage, approveUsage, remove, update
} = require('../controllers/rawMaterialController');
const { protect, authorise } = require('../middleware/auth');

const OWNER  = ['master_admin', 'franchise_owner', 'manager'];
const STAFF  = ['master_admin', 'franchise_owner', 'manager', 'kitchen_staff', 'pos_staff', 'shift_operator'];

router.get('/',                                    protect, authorise(...STAFF), getAll);
router.get('/daily-usage',                         protect, authorise(...OWNER), getDailyUsage);
router.post('/',                                   protect, authorise(...OWNER), create);
router.put('/:id',                                 protect, authorise(...OWNER), update);
router.delete('/:id',                              protect, authorise(...OWNER), remove);
router.patch('/:id/stock',                         protect, authorise(...STAFF), updateStock);
router.patch('/:id/approve-usage/:logId',          protect, authorise(...OWNER), approveUsage);

module.exports = router;
