// ── routes/customers.js
const express = require('express');
const router1 = express.Router();
const { lookupByPhone, createCustomer, updateCustomer, getCustomers, getCustomerHistory } = require('../controllers/customerController');
const { protect, authorise } = require('../middleware/auth');
const { enforceActiveFranchise } = require('../middleware/franchiseGuard');

router1.get('/lookup', protect, enforceActiveFranchise, lookupByPhone);

// GET /api/customers/export.csv — master_admin only, optional ?franchiseId= filter
router1.get('/export.csv', protect, authorise('master_admin'), async (req, res) => {
  try {
    const Customer = require('../models/Customer');
    const { franchiseId } = req.query;

    const filter = {};
    if (franchiseId) filter.first_franchise = franchiseId;

    const customers = await Customer.find(filter)
      .populate('first_franchise', 'name franchiseCode')
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean();

    const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const headers = ['Name', 'Phone', 'Email', 'Gender', 'Age', 'City', 'State',
      'Pincode', 'Total Orders', 'Total Spent', 'Total Points', 'First Franchise', 'Joined On'];

    const rows = customers.map((c) => [
      c.name,
      c.phone_no,
      c.email || '',
      c.gender || '',
      c.age ?? '',
      c.city || '',
      c.state || '',
      c.pincode || '',
      c.total_orders || 0,
      Number(c.total_spent || 0).toFixed(2),
      c.total_points || 0,
      c.first_franchise ? `${c.first_franchise.name} (${c.first_franchise.franchiseCode})` : '',
      c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN') : '',
    ].map(csvEscape).join(','));

    const csv = [headers.map(csvEscape).join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── BUG FIX: waiter role needs GET /customers for recent-customers widget in WaiterDashboard
router1.get('/', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager', 'waiter', 'pos_staff', 'shift_operator'), getCustomers);
router1.post('/', protect, enforceActiveFranchise, createCustomer);
router1.put('/:id', protect, enforceActiveFranchise, authorise('master_admin', 'franchise_owner', 'manager', 'pos_staff', 'shift_operator'), updateCustomer);
router1.get('/:id/history', protect, enforceActiveFranchise, getCustomerHistory);

// DELETE /api/customers/:id — master_admin only
router1.delete('/:id', protect, authorise('master_admin'), async (req, res) => {
  try {
    const Customer = require('../models/Customer');
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    res.json({ success: true, message: 'Customer deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router1;
