const express = require('express');
const router = express.Router();
const { globalSearch } = require('../controllers/searchController');
const { protect, authorise } = require('../middleware/auth');

router.get('/', protect, authorise('master_admin', 'franchise_owner', 'manager'), globalSearch);

module.exports = router;
