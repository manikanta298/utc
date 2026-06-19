const express = require('express');
const router = express.Router();
const { getMenu, getAllMenu, createMenuItem, updateMenuItem, deleteMenuItem, toggleFranchiseItem, toggleGlobalActive } = require('../controllers/menuController');
const { protect, authorise } = require('../middleware/auth');
const { enforceActiveFranchise } = require('../middleware/franchiseGuard');

router.get('/', protect, enforceActiveFranchise, getMenu);
router.get('/all', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager'), getAllMenu);
router.post('/', protect, authorise('master_admin'), createMenuItem);
router.put('/:id', protect, authorise('master_admin'), updateMenuItem);
router.delete('/:id', protect, authorise('master_admin'), deleteMenuItem);
// quick active/inactive toggle for master admin (no multer needed)
router.patch('/:id/global-toggle', protect, authorise('master_admin'), toggleGlobalActive);
router.put('/:id/toggle', protect, enforceActiveFranchise, authorise('franchise_owner', 'manager'), toggleFranchiseItem);

module.exports = router;
