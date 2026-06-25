const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { enforceActiveFranchise } = require('../middleware/franchiseGuard');
const {
  getNotifications, markRead, markAllRead, markAccepted, removeNotification, clearAll,
} = require('../controllers/notificationController');

router.get('/', protect, enforceActiveFranchise, getNotifications);
router.patch('/read-all', protect, enforceActiveFranchise, markAllRead);
router.patch('/:id/read', protect, enforceActiveFranchise, markRead);
router.patch('/:id/accept', protect, enforceActiveFranchise, markAccepted);
router.delete('/:id', protect, enforceActiveFranchise, removeNotification);
router.delete('/', protect, enforceActiveFranchise, clearAll);

module.exports = router;
