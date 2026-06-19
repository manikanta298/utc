// ── routes/loyalty.js
const express = require('express');
const router = express.Router();
const Loyalty = require('../models/Loyalty');
const { protect } = require('../middleware/auth');

router.get('/', protect, async (req, res) => {
  try {
    const { customerId } = req.query;
    const filter = customerId ? { customer_id: customerId } : {};
    const history = await Loyalty.find(filter)
      .populate('franchise_id', 'name franchiseCode')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
