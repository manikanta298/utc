const mongoose     = require('mongoose');
const User         = require('../models/User');
const OrderSession = require('../models/OrderSession');
const Order        = require('../models/Order');
const MenuItem     = require('../models/MenuItem');
const Table        = require('../models/Table');
const { generateToken, generateSessionRef } = require('../utils/tokenGenerator');

// ─────────────────────────────────────────────────────────────────
// POST /api/waiter/place-order
// Waiter takes order at table → creates session with status pending_pos
// ─────────────────────────────────────────────────────────────────
const placeWaiterOrder = async (req, res) => {
  try {
    const { tableId, tableNumber, items, customerMobile, customerName, notes } = req.body;
    if (!items?.length) return res.status(400).json({ success: false, message: 'Items required' });

    const waiter = await User.findById(req.user._id).select('franchise_id name');
    const franchiseId = waiter.franchise_id?._id || waiter.franchise_id;

    // ── Generate unique token BEFORE creating session ─────────────
    // Without this, tokenNumber stays null → E11000 duplicate key on
    // the { franchiseId, tokenNumber } unique index for every 2nd order
    const tokenNumber = await generateToken(franchiseId);
    const sessionRef  = `WAITER-${tokenNumber}-${Date.now()}`;

    // Build session items
    const sessionItems = [];
    for (const it of items) {
      const menu = await MenuItem.findById(it.menuItemId);
      if (!menu) continue;
      sessionItems.push({
        menuItemId: menu._id,
        name:       menu.name,
        qty:        it.qty,
        unitPrice:  menu.price,
        totalPrice: +(menu.price * it.qty).toFixed(2),
        gst_rate:   menu.gst_rate || 5,
      });
    }
    if (!sessionItems.length) return res.status(400).json({ success: false, message: 'No valid items' });

    const totalAmount = sessionItems.reduce((s, i) => s + i.totalPrice, 0);

    const session = await OrderSession.create({
      franchiseId,
      tokenNumber,                          // ← always unique, never null
      sessionRef,
      tableId:        tableId || null,
      tableNumber:    tableNumber || 'Counter',
      customerMobile: customerMobile || '0000000000',
      customerName:   customerName || 'Walk-in',
      status:         'pending_pos',
      orderType:      tableId ? 'dine_in' : 'counter',
      subOrders: [{
        items:       sessionItems,
        destination: 'kitchen',
        placedBy:    req.user._id,
        notes:       notes || '',
      }],
      totalAmount,
      openedAt: new Date(),
    });

    // Mark table occupied
    if (tableId) {
      await Table.findByIdAndUpdate(tableId, { status: 'occupied', currentSessionId: session._id });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`franchise:${franchiseId}`).emit('waiter:order_placed', {
        sessionId:   session._id,
        tokenNumber,
        tableNumber: tableNumber || 'Counter',
        waiterName:  waiter.name,
        itemCount:   sessionItems.length,
        totalAmount,
      });
    }

    res.status(201).json({ success: true, session, message: 'Order sent to POS for approval' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// GET /api/waiter/pending-sessions
// POS sees all waiter-submitted orders awaiting approval
// ─────────────────────────────────────────────────────────────────
const getPendingSessions = async (req, res) => {
  try {
    const franchiseId = req.user.franchise_id?._id || req.user.franchise_id;
    const sessions = await OrderSession.find({ franchiseId, status: 'pending_pos' })
      .sort({ openedAt: -1 })
      .lean();
    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// POST /api/waiter/sessions/:id/approve
// POS operator approves a waiter order → sends to kitchen
// ─────────────────────────────────────────────────────────────────
const approveWaiterSession = async (req, res) => {
  try {
    // Validate ObjectId before hitting DB — prevents CastError → 500 masking as 400
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid session ID' });
    }

    const session = await OrderSession.findById(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    // Accept both pending_pos and open (idempotent — already approved)
    if (session.status === 'open') {
      return res.json({ success: true, session, message: 'Session already approved' });
    }
    if (session.status !== 'pending_pos') {
      return res.status(400).json({
        success: false,
        message: `Cannot approve session with status: ${session.status}`,
      });
    }

    session.status     = 'open';
    session.approvedBy = req.user._id;
    session.approvedAt = new Date();
    await session.save();

    const franchiseId = session.franchiseId?.toString();
    const io = req.app.get('io');
    if (io) {
      io.to(`franchise:${franchiseId}`).emit('waiter:order_approved', {
        sessionId:   session._id,
        tableNumber: session.tableNumber,
      });
      io.to(`kitchen:${franchiseId}`).emit('kitchen:new_order', { session });
    }

    res.json({ success: true, session, message: 'Order approved and sent to kitchen' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// POST /api/waiter/sessions/:id/reject
// POS operator rejects a waiter order
// ─────────────────────────────────────────────────────────────────
const rejectWaiterSession = async (req, res) => {
  try {
    const session = await OrderSession.findById(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (session.status !== 'pending_pos') {
      return res.status(400).json({ success: false, message: 'Only pending orders can be rejected' });
    }

    session.status          = 'closed';
    session.rejectedBy      = req.user._id;
    session.rejectedAt      = new Date();
    session.rejectionReason = req.body.reason || 'Rejected by POS operator';
    session.closedAt        = new Date();
    await session.save();

    if (session.tableId) {
      await Table.findByIdAndUpdate(session.tableId, { status: 'available', currentSessionId: null });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`franchise:${session.franchiseId}`).emit('waiter:order_rejected', {
        sessionId:   session._id,
        tableNumber: session.tableNumber,
        reason:      session.rejectionReason,
      });
    }

    res.json({ success: true, message: 'Order rejected' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// POST /api/waiter/sessions/:id/cancel
// Waiter cancels their own pending order before POS approval
// ─────────────────────────────────────────────────────────────────
const cancelWaiterSession = async (req, res) => {
  try {
    const session = await OrderSession.findById(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (session.status !== 'pending_pos') {
      return res.status(400).json({ success: false, message: 'Only pending orders can be cancelled' });
    }

    // 'cancelled' is not in the enum — use 'closed' (valid) with a cancel note
    session.status      = 'closed';
    session.closedAt    = new Date();
    session.hold_note   = `Cancelled: ${req.body.reason || 'Cancelled by waiter'}`;
    await session.save();

    if (session.tableId) {
      await Table.findByIdAndUpdate(session.tableId, { status: 'available', currentSessionId: null });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`franchise:${session.franchiseId}`).emit('waiter:order_cancelled', {
        sessionId:   session._id,
        tableNumber: session.tableNumber,
      });
      if (session.tableId) {
        io.to(`franchise:${session.franchiseId}`).emit('table:statusUpdated', {
          tableId: session.tableId.toString(),
          status:  'available',
          sessionCleared: true,
        });
      }
    }

    res.json({ success: true, message: 'Order cancelled' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// GET /api/waiter/me
// ─────────────────────────────────────────────────────────────────
const getWaiterProfile = async (req, res) => {
  try {
    const waiter = await User.findById(req.user._id).select('-password').lean();
    res.json({ success: true, waiter });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// GET /api/waiter/my-orders
// Active sessions/orders for this waiter's assigned tables
// ─────────────────────────────────────────────────────────────────
const getMyOrders = async (req, res) => {
  try {
    const waiter      = await User.findById(req.user._id).select('assigned_tables franchise_id');
    const franchiseId = waiter.franchise_id?._id || waiter.franchise_id;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const query = {
      franchiseId,
      $or: [
        { status: { $in: ['open', 'bill_pending', 'paid', 'on_hold'] } },
        { status: 'closed', closedAt: { $gte: todayStart } },
      ],
    };

    if (waiter.assigned_tables?.length) {
      query.tableNumber = { $in: waiter.assigned_tables };
    }

    const sessions = await OrderSession.find(query)
      .populate('customerId', 'name phone_no')
      .populate({
        path:   'subOrders.order_id',
        select: 'kitchen_status items orderNumber token_number isParcel',
        model:  'Order',
      })
      .sort({ createdAt: -1 })
      .lean();

    sessions.forEach((session) => {
      session.subOrders = session.subOrders.map((sub) => ({
        ...sub,
        kitchen_status: sub.order_id?.kitchen_status || sub.kitchen_status || 'Pending',
        items:          (sub.items?.length ? sub.items : sub.order_id?.items) || [],
        order_id:       sub.order_id?._id || sub.order_id,
      }));
      session.customerName = session.customerId?.name || session.customerName || 'Walk-in';
    });

    res.json({ success: true, sessions, assignedTables: waiter.assigned_tables || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// PATCH /api/waiter/orders/:orderId/status
// Waiter marks an order as Delivered
// ─────────────────────────────────────────────────────────────────
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (status !== 'Delivered') {
      return res.status(403).json({ success: false, message: 'Waiters can only mark orders as Delivered' });
    }

    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const franchiseId = (req.user.franchise_id?._id || req.user.franchise_id)?.toString();
    if (order.franchise_id?.toString() !== franchiseId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    order.kitchen_status = status;
    await order.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`franchise:${franchiseId}`).emit('order:statusUpdated', {
        orderId:        order._id,
        kitchen_status: status,
      });
    }

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// PUT /api/waiter/:waiterId/assign-tables
// Manager assigns tables to a waiter
// ─────────────────────────────────────────────────────────────────
const assignTables = async (req, res) => {
  try {
    const { tables } = req.body;
    if (!Array.isArray(tables)) {
      return res.status(400).json({ success: false, message: 'tables must be an array' });
    }

    const waiter = await User.findById(req.params.waiterId);
    if (!waiter) return res.status(404).json({ success: false, message: 'User not found' });
    if (waiter.role !== 'waiter') {
      return res.status(400).json({ success: false, message: 'User is not a waiter' });
    }

    if (req.user.role !== 'master_admin') {
      const userFranchise   = (req.user.franchise_id?._id || req.user.franchise_id)?.toString();
      const waiterFranchise = (waiter.franchise_id?._id   || waiter.franchise_id)?.toString();
      if (userFranchise !== waiterFranchise) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    waiter.assigned_tables = tables.map(String);
    await waiter.save();

    res.json({
      success: true,
      message: 'Tables assigned',
      waiter: { _id: waiter._id, name: waiter.name, assigned_tables: waiter.assigned_tables },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// GET /api/waiter/list
// List all waiters for a franchise
// ─────────────────────────────────────────────────────────────────
const listWaiters = async (req, res) => {
  try {
    const franchiseId = req.user.franchise_id?._id || req.user.franchise_id;
    const filter      = { role: 'waiter' };
    if (req.user.role !== 'master_admin') filter.franchise_id = franchiseId;

    const waiters = await User.find(filter).select('-password').lean();
    res.json({ success: true, waiters });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// All functions declared above — safe to export
// ─────────────────────────────────────────────────────────────────
module.exports = {
  getWaiterProfile,
  getMyOrders,
  updateOrderStatus,
  assignTables,
  listWaiters,
  placeWaiterOrder,
  getPendingSessions,
  approveWaiterSession,
  rejectWaiterSession,
  cancelWaiterSession,   // ← now declared BEFORE export — no TDZ crash
};
