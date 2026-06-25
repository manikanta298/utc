const express = require('express');
const router = express.Router();
const { protect, authorise } = require('../middleware/auth');
const { getHealth } = require('../controllers/systemController');

router.get('/health', protect, authorise('master_admin'), getHealth);

module.exports = router;
