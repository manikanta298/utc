const express = require('express');
const router = express.Router();
const { getCategories, createCategory, updateCategory, deleteCategory } = require('../controllers/categoryController');
const { protect, authorise } = require('../middleware/auth');

router.get('/',     protect, getCategories);
router.post('/',    protect, authorise('master_admin'), createCategory);
router.put('/:id',  protect, authorise('master_admin'), updateCategory);
router.delete('/:id', protect, authorise('master_admin'), deleteCategory);

module.exports = router;
