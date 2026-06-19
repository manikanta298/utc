const express = require('express');
const router  = express.Router();
const {
  getInventory, updateStock, bulkUpdateStock,
  createItem, updateItem, deleteItem,
} = require('../controllers/inventoryController');
const { protect, authorise } = require('../middleware/auth');

const ROLES       = ['master_admin', 'franchise_owner', 'manager'];
const ADMIN_ROLES = ['master_admin', 'franchise_owner'];

router.get('/',                 protect, authorise(...ROLES),       getInventory);
router.post('/items',           protect, authorise(...ADMIN_ROLES), createItem);
router.put('/items/:id',        protect, authorise(...ADMIN_ROLES), updateItem);
router.delete('/items/:id',     protect, authorise('master_admin'), deleteItem);
router.patch('/bulk-stock',     protect, authorise(...ROLES),       bulkUpdateStock);
router.patch('/:id/stock',      protect, authorise(...ROLES),       updateStock);

module.exports = router;
