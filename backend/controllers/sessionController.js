const OrderSession = require('../models/OrderSession');
const Order = require('../models/Order');
const { createOrderNotification } = require('../services/notificationService');
const {
  startSessionFlow,
  addOrderToSessionFlow,
  getSessionForUser,
  generateBillFlow,
  recordSessionPaymentFlow,
  getSessionsList,
  linkCustomerToSession,
  holdSessionFlow,
  resumeSessionFlow,
  getHeldSessionsList,
  cancelSessionFlow,
} = require('../services/sessionService');

const handleServiceError = (res, err, label) => {
  console.error(`[${label}]`, err.status ? err.message : err);
  res.status(err.status || 500).json({ success: false, message: err.message });
};

const resolveFranchiseScope = (req) => ({
  isMaster: req.user.role === 'master_admin',
  requestingFranchiseId: req.user.franchise_id?._id || req.user.franchise_id,
});

// POST /api/sessions/start — Start or resume a session
const startSession = async (req, res) => {
  try {
    const { mobile, tableNumber, orderType, tableId } = req.body;
    const franchiseId = req.user.franchise_id?._id || req.user.franchise_id;

    const result = await startSessionFlow({
      franchiseId, mobile, tableNumber, orderType, tableId, openedBy: req.user._id,
    });

    const io = req.app.get('io');
    if (io && !result.isResumed) {
      io.to(`franchise:${franchiseId}`).emit('session:started', {
        tokenNumber: result.tokenNumber,
        tableNumber: result.tableNumber,
        customerName: result.customer?.name || 'New Customer',
        sessionId: result.session._id.toString(),
      });
      if (tableId) {
        io.to(`franchise:${franchiseId}`).emit('table:statusUpdated', {
          tableId: tableId.toString(),
          tableNumber: tableNumber || '',
          status: 'occupied',
          tokenNumber: result.tokenNumber,
        });
      }
    }

    if (result.isResumed) {
      return res.json({
        success: true,
        session: result.session,
        isResumed: true,
        message: result.message,
      });
    }

    res.status(201).json({
      success: true,
      session: result.session,
      isResumed: false,
      isNewCustomer: result.isNewCustomer,
      customer: result.customer,
      message: result.message,
    });
  } catch (err) {
    handleServiceError(res, err, 'startSession');
  }
};

// POST /api/sessions/:sessionId/orders — Add order to session
const addOrderToSession = async (req, res) => {
  try {
    const { items, destination = 'kitchen' } = req.body;

    const { session, order, isAddition, builtItems, orderNumber, franchiseId } = await addOrderToSessionFlow({
      sessionId: req.params.sessionId,
      items,
      destination,
      createdBy: req.user._id,
      waiterName: req.user.name || req.user.username || '',
      role: req.user.role,
    });

    const io = req.app.get('io');
    const populatedOrder = await Order.findById(order._id)
      .populate('customer_id', 'name phone_no')
      .populate('franchise_id', 'name franchiseCode');

    const kitchenPayload = {
      sessionId: session._id,
      tokenNumber: session.tokenNumber,
      tableNumber: session.tableNumber,
      isAddition,
      items: builtItems,
      orderedAt: new Date(),
      orderId: order._id,
      orderNumber,
      order: populatedOrder,
    };

    if (io) {
      if (destination === 'kitchen' || destination === 'both') {
        io.to(`franchise:${franchiseId}`).emit('order:new', kitchenPayload);
        io.to('admin').emit('order:new', kitchenPayload);

        createOrderNotification({
          type: 'new_order',
          franchiseId,
          orderId: order._id,
          tokenNumber: session.tokenNumber,
          tableNumber: session.tableNumber,
          customerName: session.customerName,
          orderType: session.orderType,
        }).catch((e) => console.error('Notification persistence error:', e.message));
      }
      if (destination === 'counter' || destination === 'both') {
        io.to(`pos:${franchiseId}`).emit('order:counter', kitchenPayload);
      }
    }

    res.json({ success: true, session, order, isAddition });
  } catch (err) {
    handleServiceError(res, err, 'addOrderToSession');
  }
};

// GET /api/sessions/:sessionId — Get session details
const getSession = async (req, res) => {
  try {
    const { isMaster, requestingFranchiseId } = resolveFranchiseScope(req);
    const { session } = await getSessionForUser(req.params.sessionId, { isMaster, requestingFranchiseId });
    res.json({ success: true, session });
  } catch (err) {
    handleServiceError(res, err, 'getSession');
  }
};

// POST /api/sessions/:sessionId/bill — Generate merged final bill
const generateBill = async (req, res) => {
  try {
    const { couponCode, orderType } = req.body;
    const { session, mergedItems, totalAmount } = await generateBillFlow({
      sessionId: req.params.sessionId, couponCode, orderType,
    });

    const fid = session.franchiseId?._id || session.franchiseId;
    const io = req.app.get('io');
    if (session.tableId && io) {
      io.to(`franchise:${fid}`).emit('table:statusUpdated', {
        tableId: session.tableId.toString(),
        tableNumber: session.tableNumber,
        status: 'bill_pending',
        tokenNumber: session.tokenNumber,
      });
    }
    if (io) {
      io.to(`franchise:${fid}`).emit('session:billUpdated', {
        sessionId: session._id.toString(),
        tokenNumber: session.tokenNumber,
        tableNumber: session.tableNumber,
        totalAmount,
        mergedItems,
      });
    }

    res.json({ success: true, session, message: 'Bill generated' });
  } catch (err) {
    handleServiceError(res, err, 'generateBill');
  }
};

// POST /api/sessions/:sessionId/payment — Record a payment
const recordPayment = async (req, res) => {
  try {
    const { amount, method, reference, visit_type } = req.body;

    const { session, invoice, balance, isFullyPaid, franchiseId, tableId } = await recordSessionPaymentFlow({
      sessionId: req.params.sessionId, amount, method, reference, visitType: visit_type, receivedBy: req.user._id,
    });

    const io = req.app.get('io');
    if (isFullyPaid && io) {
      if (tableId) {
        io.to(`franchise:${franchiseId}`).emit('table:statusUpdated', {
          tableId: tableId.toString(),
          tableNumber: session.tableNumber,
          status: 'needs_cleaning',
          tokenNumber: null,
          sessionCleared: true,
        });
      }
      io.to(`franchise:${franchiseId}`).emit('session:closed', {
        tokenNumber: session.tokenNumber,
        tableNumber: session.tableNumber,
        sessionId: session._id.toString(),
      });
      io.to(`pos:${franchiseId}`).emit('session:paid', { sessionId: session._id.toString() });
    }

    if (io) {
      const payloadEmit = {
        sessionId: session._id.toString(),
        tokenNumber: session.tokenNumber,
        paidAmount: session.paidAmount,
        totalAmount: session.totalAmount,
        paymentStatus: session.paymentStatus,
      };
      io.to(`pos:${franchiseId}`).emit('payment:received', payloadEmit);
      io.to(`franchise:${franchiseId}`).emit('payment:received', payloadEmit);
    }

    res.json({ success: true, session, invoice, balance });
  } catch (err) {
    console.error('[recordPayment] FATAL:', err.message, err.stack);
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// GET /api/sessions — List active sessions for a franchise
const getSessions = async (req, res) => {
  try {
    const { isMaster, requestingFranchiseId } = resolveFranchiseScope(req);
    const { sessions } = await getSessionsList({
      isMaster, requestingFranchiseId, queryFranchiseId: req.query.franchiseId, statusQuery: req.query.status,
    });
    res.json({ success: true, sessions });
  } catch (err) {
    handleServiceError(res, err, 'getSessions');
  }
};

// POST /api/sessions/:sessionId/customer — Register/link customer to open session
const linkCustomer = async (req, res) => {
  try {
    const { name, gender, age, city, state, address, village, pincode } = req.body;
    const { customer, session } = await linkCustomerToSession({
      sessionId: req.params.sessionId, name, gender, age, city, state, address, village, pincode,
    });
    res.json({ success: true, customer, session });
  } catch (err) {
    handleServiceError(res, err, 'linkCustomer');
  }
};

// POST /api/sessions/:sessionId/hold
async function holdSession(req, res) {
  try {
    const { session } = await holdSessionFlow(req.params.sessionId, req.body.note);
    res.json({ success: true, message: 'Bill placed on hold', session });
  } catch (err) {
    handleServiceError(res, err, 'holdSession');
  }
}

// POST /api/sessions/:sessionId/resume
async function resumeSession(req, res) {
  try {
    const { session } = await resumeSessionFlow(req.params.sessionId);
    res.json({ success: true, message: 'Bill resumed', session });
  } catch (err) {
    handleServiceError(res, err, 'resumeSession');
  }
}

// GET /api/sessions/held
async function getHeldSessions(req, res) {
  try {
    const franchiseId = req.user.franchise_id?._id || req.user.franchise_id;
    const { sessions } = await getHeldSessionsList(franchiseId);
    res.json({ success: true, sessions });
  } catch (err) {
    handleServiceError(res, err, 'getHeldSessions');
  }
}

// POST /api/sessions/:sessionId/cancel
async function cancelSession(req, res) {
  try {
    const { tableId, franchiseId } = await cancelSessionFlow(req.params.sessionId, req.body.reason);

    if (tableId) {
      const io = req.app.get('io');
      if (io) {
        io.to(`franchise:${franchiseId}`).emit('table:statusUpdated', {
          tableId: tableId.toString(),
          status: 'available',
        });
      }
    }

    res.json({ success: true, message: 'Order cancelled successfully' });
  } catch (err) {
    handleServiceError(res, err, 'cancelSession');
  }
}

module.exports = {
  startSession, addOrderToSession, getSession, generateBill, recordPayment,
  getSessions, linkCustomer, holdSession, resumeSession, getHeldSessions, cancelSession,
};
