const Order = require('../models/Order');
const Customer = require('../models/Customer');

// @GET /api/search?q=<query>&type=all|orders|customers&franchiseId=<id>
// Accessible: master_admin (all or filtered), franchise_owner / manager (own franchise)
const globalSearch = async (req, res) => {
  try {
    const { q = '', type = 'all', franchiseId } = req.query;
    const query = q.trim();

    if (query.length < 2) {
      return res.json({ success: true, data: { orders: [], customers: [] } });
    }

    // Determine franchise scope
    let franchiseFilter = null;
    if (req.user.role === 'master_admin') {
      if (franchiseId) franchiseFilter = franchiseId;
      // else: no filter — searches all
    } else {
      franchiseFilter = (req.user.franchise_id?._id || req.user.franchise_id)?.toString();
    }

    const results = { orders: [], customers: [] };

    // ── ORDERS ──────────────────────────────────────────────────────────────
    if (type === 'all' || type === 'orders') {
      const orderMatch = {
        $or: [
          { order_number:    { $regex: query, $options: 'i' } },
          { table_number:    { $regex: query, $options: 'i' } },
          { customer_mobile: { $regex: query, $options: 'i' } },
          { waiter_name:     { $regex: query, $options: 'i' } },
        ],
      };

      if (franchiseFilter) {
        const mongoose = require('mongoose');
        orderMatch.franchise_id = new mongoose.Types.ObjectId(franchiseFilter);
      }

      results.orders = await Order.find(orderMatch)
        .populate('customer_id', 'name phone_no')
        .populate('franchise_id', 'name franchiseCode')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
    }

    // ── CUSTOMERS ────────────────────────────────────────────────────────────
    if (type === 'all' || type === 'customers') {
      const customerMatch = {
        $or: [
          { name:     { $regex: query, $options: 'i' } },
          { phone_no: { $regex: query, $options: 'i' } },
          { email:    { $regex: query, $options: 'i' } },
        ],
      };

      // For franchise scope: filter customers who have ordered from this franchise
      if (franchiseFilter) {
        const mongoose = require('mongoose');
        const customerIds = await Order.distinct('customer_id', {
          franchise_id: new mongoose.Types.ObjectId(franchiseFilter),
        });
        customerMatch._id = { $in: customerIds };
      }

      results.customers = await Customer.find(customerMatch)
        .sort({ last_visit: -1 })
        .limit(20)
        .lean();
    }

    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { globalSearch };
