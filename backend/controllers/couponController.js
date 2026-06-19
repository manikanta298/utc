const Coupon = require('../models/Coupon');
const { logAudit } = require('../utils/auditHelper');

// GET /api/coupons
const getCoupons = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role !== 'master_admin') {
      filter.isHidden = false; // non-admins only see non-hidden coupons
    }
    const coupons = await Coupon.find(filter)
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, coupons });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/coupons
const createCoupon = async (req, res) => {
  try {
    const { code, description, discountType, discountValue, isHidden, maxUses,
      minOrderAmount, maxDiscountAmount, expiresAt, applicableFranchises } = req.body;

    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      description,
      discountType,
      discountValue,
      isHidden: isHidden !== false,
      maxUses: maxUses || 0,
      minOrderAmount: minOrderAmount || 0,
      maxDiscountAmount: maxDiscountAmount || 0,
      expiresAt: expiresAt || null,
      applicableFranchises: applicableFranchises || [],
      createdBy: req.user._id,
    });

    await logAudit('COUPON_CREATED', req, coupon._id, 'Coupon', { code: coupon.code, discountType, discountValue });
    res.status(201).json({ success: true, coupon });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Coupon code already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/coupons/:id
const updateCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    await logAudit('COUPON_UPDATED', req, coupon._id, 'Coupon', req.body);
    res.json({ success: true, coupon });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/coupons/:id
const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    await logAudit('COUPON_DELETED', req, coupon._id, 'Coupon', { code: coupon.code });
    res.json({ success: true, message: 'Coupon deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/coupons/validate — Check coupon and return discount
const validateCoupon = async (req, res) => {
  try {
    const { code, orderAmount } = req.body;
    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    if (!coupon) return res.status(404).json({ success: false, message: 'Invalid or expired coupon code' });

    const now = new Date();
    if (coupon.expiresAt && coupon.expiresAt < now) {
      return res.status(400).json({ success: false, message: 'Coupon has expired' });
    }
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
    }
    if (coupon.minOrderAmount > 0 && orderAmount < coupon.minOrderAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum order amount Rs.${coupon.minOrderAmount} required`,
      });
    }

    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      discountAmount = +(orderAmount * coupon.discountValue / 100).toFixed(2);
      if (coupon.maxDiscountAmount > 0) discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
    } else {
      discountAmount = Math.min(coupon.discountValue, orderAmount);
    }

    res.json({
      success: true,
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        description: coupon.description,
      },
      discountAmount,
      finalAmount: +(orderAmount - discountAmount).toFixed(2),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getCoupons, createCoupon, updateCoupon, deleteCoupon, validateCoupon };
