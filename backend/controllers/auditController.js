const AuditLog = require('../models/AuditLog');
const Order = require('../models/Order');
const OrderSession = require('../models/OrderSession');
const { logAudit } = require('../utils/auditHelper');

// GET /api/audit — List audit logs (master_admin only)
const getAuditLogs = async (req, res) => {
  try {
    const { action, franchiseId, userId, startDate, endDate, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (action) filter.action = { $regex: action, $options: 'i' };
    if (franchiseId) filter.franchiseId = franchiseId;
    if (userId) filter.performedBy = userId;

    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.timestamp.$lte = end;
      }
    }

    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('performedBy', 'name email role')
        .populate('franchiseId', 'name franchiseCode')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(Number(limit)),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ success: true, logs, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/audit/orders/:id/edit — Order edit (master_admin bypasses PIN; franchise roles require PIN pre-verified on frontend)
const editOrder = async (req, res) => {
  try {
    const { items, payment_mode, discount_amount, final_amount, notes } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Franchise roles can only edit their own franchise's orders
    if (req.user.role !== 'master_admin') {
      const userFranchise = (req.user.franchise_id?._id || req.user.franchise_id)?.toString();
      if (order.franchise_id?.toString() !== userFranchise) {
        return res.status(403).json({ success: false, message: 'Access denied to this order' });
      }
    }

    const oldValues = {
      items: order.items,
      payment_mode: order.payment_mode,
      discount_amount: order.discount_amount,
      final_amount: order.final_amount,
    };

    if (payment_mode) order.payment_mode = payment_mode;
    if (discount_amount !== undefined) order.discount_amount = discount_amount;
    if (final_amount !== undefined) order.final_amount = final_amount;
    await order.save();

    await logAudit('ORDER_EDITED', req, order._id, 'Order', {
      oldValues,
      newValues: { payment_mode, discount_amount, final_amount },
      reason: notes || '',
    });

    res.json({ success: true, order, message: 'Order updated and logged' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/audit/sessions/:id/payment/edit — Master Admin payment edit
const editSessionPayment = async (req, res) => {
  try {
    const { paymentIndex, newAmount, newMethod, reason } = req.body;
    const session = await OrderSession.findById(req.params.id)
      .populate('franchiseId', 'name');

    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    const payment = session.payments[paymentIndex];
    if (!payment) return res.status(404).json({ success: false, message: 'Payment entry not found' });

    const oldAmount = payment.amount;
    const oldMethod = payment.method;

    // Recompute paidAmount
    session.paidAmount -= oldAmount;
    payment.amount = newAmount;
    if (newMethod) payment.method = newMethod;
    session.paidAmount += newAmount;

    // Recompute paymentStatus
    if (session.paidAmount >= session.totalAmount) session.paymentStatus = 'fully_paid';
    else if (session.paidAmount > 0) session.paymentStatus = 'partially_paid';
    else session.paymentStatus = 'unpaid';

    await session.save();

    await logAudit('PAYMENT_EDITED', req, session._id, 'OrderSession', {
      oldAmount,
      newAmount,
      oldMethod,
      newMethod,
      reason: reason || '',
      franchiseName: session.franchiseId?.name || '',
    });

    res.json({ success: true, session, message: 'Payment edited and logged' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/audit/sessions/:id/payment/:paymentId — Delete a payment entry
const deleteSessionPayment = async (req, res) => {
  try {
    const { reason } = req.body;
    const session = await OrderSession.findById(req.params.id).populate('franchiseId', 'name');
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    const payment = session.payments.id(req.params.paymentId);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });

    const deletedAmount = payment.amount;
    session.paidAmount = Math.max(0, session.paidAmount - deletedAmount);
    session.payments.pull({ _id: req.params.paymentId });

    if (session.paidAmount >= session.totalAmount) session.paymentStatus = 'fully_paid';
    else if (session.paidAmount > 0) session.paymentStatus = 'partially_paid';
    else session.paymentStatus = 'unpaid';

    await session.save();

    await logAudit('PAYMENT_DELETED', req, session._id, 'OrderSession', {
      deletedAmount,
      reason: reason || '',
      franchiseName: session.franchiseId?.name || '',
    });

    res.json({ success: true, session, message: 'Payment deleted and logged' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAuditLogs, editOrder, editSessionPayment, deleteSessionPayment };
