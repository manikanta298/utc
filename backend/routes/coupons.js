const express = require('express');
const router = express.Router();
const { getCoupons, createCoupon, updateCoupon, deleteCoupon, validateCoupon } = require('../controllers/couponController');
const { protect, authorise } = require('../middleware/auth');

router.get('/', protect, authorise('master_admin'), getCoupons);
router.post('/', protect, authorise('master_admin'), createCoupon);
router.put('/:id', protect, authorise('master_admin'), updateCoupon);
router.delete('/:id', protect, authorise('master_admin'), deleteCoupon);
router.post('/validate', protect, validateCoupon);

module.exports = router;
