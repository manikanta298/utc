const OrderSession = require('../models/OrderSession');
const Customer = require('../models/Customer');
const Franchise = require('../models/Franchise');
const Table = require('../models/Table');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const Invoice = require('../models/Invoice');
const Counter = require('../models/Counter');
const { generateToken, generateSessionRef } = require('../utils/tokenGenerator');
const { determineTaxType, calculateOrderTax } = require('../utils/gst');

// POST /api/sessions/start — Start or resume a session
const startSession = async (req, res) => {
  try {
    const { mobile, tableNumber, orderType = 'dine_in', tableId } = req.body;

    if (!mobile || mobile.trim().length < 10) {
      return res.status(400).json({ success: false, message: 'Valid mobile number required' });
    }

    const franchiseId = req.user.franchise_id?._id || req.user.franchise_id;
    const franchise = await Franchise.findById(franchiseId);
    if (!franchise) return res.status(404).json({ success: false, message: 'Franchise not found' });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const existingSession = await OrderSession.findOne({
      franchiseId,
      customerMobile: mobile.trim(),
      status: { $in: ['open', 'bill_pending'] },
      openedAt: { $gte: todayStart },
    }).populate('customerId', 'name phone_no total_points total_orders total_spent');

    if (existingSession) {
      return res.json({
        success: true,
        session: existingSession,
        isResumed: true,
        message: `Resumed Token ${existingSession.tokenNumber} — ${existingSession.tableNumber}`,
      });
    }

    let customer = await Customer.findOne({ phone_no: mobile.trim() });
    const isNewCustomer = !customer;

    const tokenNumber = await generateToken(franchiseId);
    const sessionRef = generateSessionRef(franchise.franchiseCode, tokenNumber);

    const session = await OrderSession.create({
      tokenNumber,
      sessionRef,
      franchiseId,
      tableId: tableId || null,
      tableNumber: tableNumber || 'Counter',
      customerMobile: mobile.trim(),
      customerId: customer?._id || null,
      customerName: customer?.name || '',
      orderType,
      openedBy: req.user._id,
    });

    if (tableId) {
      await Table.findByIdAndUpdate(tableId, {
        status: 'occupied',
        currentSessionId: session._id,
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`franchise:${franchiseId}`).emit('session:started', {
        tokenNumber,
        tableNumber: tableNumber || 'Counter',
        customerName: customer?.name || 'New Customer',
        sessionId: session._id.toString(),
      });
      if (tableId) {
        io.to(`franchise:${franchiseId}`).emit('table:statusUpdated', {
          tableId: tableId.toString(),
          tableNumber: tableNumber || '',
          status: 'occupied',
          tokenNumber,
        });
      }
    }

    return res.status(201).json({
      success: true,
      session,
      isResumed: false,
      isNewCustomer,
      customer: customer || null,
      message: `Token ${tokenNumber} created for ${tableNumber || 'Counter'}`,
    });
  } catch (err) {
    console.error('[startSession]', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/sessions/:sessionId/orders — Add order to session
const addOrderToSession = async (req, res) => {
  try {
    const { items, destination = 'kitchen' } = req.body;
    const session = await OrderSession.findById(req.params.sessionId);

    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (session.status === 'paid' || session.status === 'closed') {
      return res.status(400).json({ success: false, message: 'Session is already closed' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Add at least one item before sending order' });
    }

    const franchiseId = session.franchiseId;
    const franchise = await Franchise.findById(franchiseId);
    if (!franchise) return res.status(404).json({ success: false, message: 'Franchise not found' });

    const builtItems = [];
    for (const line of items) {
      const menuItem = await MenuItem.findById(line.menuItemId);
      if (!menuItem || !menuItem.isGlobalActive) {
        return res.status(400).json({ success: false, message: `Item not available: ${line.menuItemId}` });
      }
      if (menuItem.disabledInFranchises.map(String).includes(franchiseId.toString())) {
        return res.status(400).json({ success: false, message: `Item disabled at this outlet: ${menuItem.name}` });
      }
      builtItems.push({
        menuItemId: menuItem._id,
        name: menuItem.name,
        qty: line.qty || line.quantity || 1,
        unitPrice: menuItem.price,
        totalPrice: +(menuItem.price * (line.qty || line.quantity || 1)).toFixed(2),
        gst_rate: menuItem.gst_rate,
        hsn_code: menuItem.hsn_code || '',
        notes: line.notes || '',
      });
    }

    const isAddition = session.subOrders.length > 0;

    const { subTotal, cgst, sgst, igst, totalTax, grossTotal } = calculateOrderTax(
      builtItems.map(i => ({ ...i, price: i.unitPrice, quantity: i.qty, item_total: i.totalPrice })),
      determineTaxType(franchise.state, franchise.state)
    );

    // ── BUG FIX: Use atomic Counter instead of countDocuments (race condition)
    const counterKey = `order_${franchiseId}`;
    const counter = await Counter.findOneAndUpdate(
      { key: counterKey },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    const orderNumber = `${franchise.franchiseCode}-ORD-${String(counter.seq).padStart(5, '0')}`;

    // ── BUG FIX: Use max token_number per day (not count) — consistent with createOrder
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const lastOrder = await Order.findOne(
      { franchise_id: franchiseId, createdAt: { $gte: startOfDay } },
      { token_number: 1 },
      { sort: { token_number: -1 } }
    ).lean();
    const tokenNum = (lastOrder?.token_number || 0) + 1;

    // ── BUG FIX: Handle case where customerId is null (look up by mobile)
    let customer = session.customerId
      ? await Customer.findById(session.customerId)
      : await Customer.findOne({ phone_no: session.customerMobile });

    if (!customer) {
      try {
        customer = await Customer.create({
          name: session.customerName || 'Walk-in Customer',
          phone_no: session.customerMobile,
          first_franchise: franchiseId,
        });
      } catch (customerErr) {
        if (customerErr.code !== 11000) throw customerErr;
        customer = await Customer.findOne({ phone_no: session.customerMobile });
      }
      session.customerId = customer._id;
      session.customerName = customer.name;
    }

    const order = await Order.create({
      order_number: orderNumber,
      franchise_id: franchiseId,
      customer_id: customer._id,
      items: builtItems.map(i => ({
        item_id: i.menuItemId,
        name: i.name,
        price: i.unitPrice,
        gst_rate: i.gst_rate,
        hsn_code: i.hsn_code,
        quantity: i.qty,
        item_total: i.totalPrice,
      })),
      sub_total: subTotal,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      total_tax: totalTax,
      gross_total: grossTotal,
      discount_amount: 0,
      final_amount: grossTotal,
      tax_type: determineTaxType(franchise.state, franchise.state),
      payment_mode: 'Cash',
      payment_status: 'Pending',
      kitchen_status: 'Pending',
      token_number: tokenNum,
      waiter_name: req.user.name || req.user.username || '',
      order_source: req.user.role === 'waiter' ? 'waiter'
                  : req.user.role === 'qr_customer' ? 'qr_customer'
                  : 'pos_operator',
      // order_type must be set so kitchen parcel filter works
      order_type: session.orderType || 'dine_in',
      customer_mobile: session.customerMobile || '',
      table_number: session.tableNumber || '',
      table_id: session.tableId || null,
      session_id: session._id,
      created_by: req.user._id,
      status_history: [{ status: 'Pending', updatedBy: req.user._id }],
    });

    session.subOrders.push({
      orderedAt: new Date(),
      isAddition,
      destination,
      items: builtItems,
      placedBy: req.user._id,
      order_id: order._id,
    });

    await session.save();

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
      }
      if (destination === 'counter' || destination === 'both') {
        io.to(`pos:${franchiseId}`).emit('order:counter', kitchenPayload);
      }
    }

    res.json({ success: true, session, order, isAddition });
  } catch (err) {
    console.error('[addOrderToSession]', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/sessions/:sessionId — Get session details
const getSession = async (req, res) => {
  try {
    const session = await OrderSession.findById(req.params.sessionId)
      .populate('customerId', 'name phone_no total_points total_orders total_spent')
      .populate('franchiseId', 'name franchiseCode state gstin address')
      .populate('openedBy', 'name');

    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    if (req.user.role !== 'master_admin') {
      const userFranchise = (req.user.franchise_id?._id || req.user.franchise_id).toString();
      if ((session.franchiseId?._id || session.franchiseId).toString() !== userFranchise) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/sessions/:sessionId/bill — Generate merged final bill
const generateBill = async (req, res) => {
  try {
    const { couponCode, orderType } = req.body;
    const session = await OrderSession.findById(req.params.sessionId)
      .populate('franchiseId', 'name franchiseCode state gstin address');

    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (session.status === 'paid' || session.status === 'closed') {
      return res.status(400).json({ success: false, message: 'Session already closed' });
    }

    // ── BUG FIX: Guard against empty subOrders before bill generation
    if (!session.subOrders || session.subOrders.length === 0) {
      return res.status(400).json({ success: false, message: 'No orders in this session. Add items before generating a bill.' });
    }

    const itemMap = new Map();
    for (const sub of session.subOrders) {
      for (const item of sub.items) {
        const key = item.name;
        if (itemMap.has(key)) {
          const existing = itemMap.get(key);
          existing.qty += item.qty;
          existing.totalPrice = +(existing.unitPrice * existing.qty).toFixed(2);
        } else {
          itemMap.set(key, { ...item.toObject(), qty: item.qty });
        }
      }
    }
    const mergedItems = [...itemMap.values()];

    const franchise = session.franchiseId;
    const taxCalc = calculateOrderTax(
      mergedItems.map(i => ({ price: i.unitPrice, quantity: i.qty, item_total: i.totalPrice, gst_rate: i.gst_rate })),
      determineTaxType(franchise.state, franchise.state)
    );

    let discountAmount = 0;
    let appliedCoupon = '';

    if (couponCode) {
      const Coupon = require('../models/Coupon');
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
      if (coupon) {
        const now = new Date();
        const notExpired = !coupon.expiresAt || coupon.expiresAt > now;
        const hasUses = coupon.maxUses === 0 || coupon.usedCount < coupon.maxUses;
        const meetsMin = taxCalc.grossTotal >= coupon.minOrderAmount;

        if (notExpired && hasUses && meetsMin) {
          if (coupon.discountType === 'percentage') {
            discountAmount = +(taxCalc.grossTotal * coupon.discountValue / 100).toFixed(2);
            if (coupon.maxDiscountAmount > 0) discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
          } else {
            discountAmount = Math.min(coupon.discountValue, taxCalc.grossTotal);
          }
          appliedCoupon = coupon.code;
          coupon.usedCount += 1;
          await coupon.save();
        }
      }
    }

    const totalAmount = Math.max(0, +(taxCalc.grossTotal - discountAmount).toFixed(2));

    session.mergedItems = mergedItems;
    session.subtotal = taxCalc.subTotal;
    session.cgst_amount = taxCalc.cgst;
    session.sgst_amount = taxCalc.sgst;
    session.total_tax = taxCalc.totalTax;
    session.discountAmount = discountAmount;
    session.couponCode = appliedCoupon;
    session.totalAmount = totalAmount;
    if (orderType && ['dine_in', 'counter', 'parcel'].includes(orderType)) {
      session.orderType = orderType;
      session.tableNumber = orderType === 'parcel' ? 'Parcel' : (session.tableNumber || 'Counter');
    }
    session.status = 'bill_pending';
    session.billGeneratedAt = new Date();
    await session.save();

    const _billFid = session.franchiseId?._id || session.franchiseId;
    const io = req.app.get('io');
    if (session.tableId) {
      await Table.findByIdAndUpdate(session.tableId, { status: 'bill_pending' });
      if (io) {
        io.to(`franchise:${_billFid}`).emit('table:statusUpdated', {
          tableId: session.tableId.toString(),
          tableNumber: session.tableNumber,
          status: 'bill_pending',
          tokenNumber: session.tokenNumber,
        });
      }
    }

    if (io) {
      io.to(`franchise:${_billFid}`).emit('session:billUpdated', {
        sessionId: session._id.toString(),
        tokenNumber: session.tokenNumber,
        tableNumber: session.tableNumber,
        totalAmount,
        mergedItems,
      });
    }

    res.json({ success: true, session, message: 'Bill generated' });
  } catch (err) {
    console.error('[generateBill]', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/sessions/:sessionId/payment — Record a payment
const recordPayment = async (req, res) => {
  try {
    const { amount, method, reference, visit_type } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0 || isNaN(parsedAmount)) {
      return res.status(400).json({ success: false, message: 'Invalid payment amount' });
    }

    // ── 1. Session lookup ────────────────────────────────────────
    const session = await OrderSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (session.status === 'paid' || session.status === 'closed') {
      return res.status(400).json({ success: false, message: 'Session is already closed' });
    }
    if (session.totalAmount === 0 && session.status !== 'bill_pending') {
      return res.status(400).json({ success: false, message: 'Please generate a bill before recording payment.' });
    }

    const _fid = session.franchiseId?._id || session.franchiseId;
    if (!_fid) {
      console.error('[recordPayment] Missing franchiseId on session', session._id);
      return res.status(500).json({ success: false, message: 'Session data corrupted: franchiseId missing' });
    }
    const _fidStr = _fid.toString();

    // ── 2. Visit type ────────────────────────────────────────────
    if (visit_type && ['single','couple','family','friends'].includes(visit_type)) {
      session.visitType = visit_type;
    }

    // ── 3. Record payment ─────────────────────────────────────────
    session.payments.push({ amount: parsedAmount, method: method || 'Cash', reference: reference || '', receivedBy: req.user._id });
    session.paidAmount = +(session.paidAmount + parsedAmount).toFixed(2);
    const balance = +(session.totalAmount - session.paidAmount).toFixed(2);

    if (session.paidAmount >= session.totalAmount) {
      session.paymentStatus = 'fully_paid';
      session.status = 'paid';
      session.closedAt = new Date();

      // ── 4. Table status update ────────────────────────────────
      if (session.tableId) {
        try {
          await Table.findByIdAndUpdate(session.tableId, { status: 'needs_cleaning', currentSessionId: null });
          const ioT = req.app.get('io');
          if (ioT) {
            ioT.to(`franchise:${_fidStr}`).emit('table:statusUpdated', {
              tableId: session.tableId.toString(),
              tableNumber: session.tableNumber,
              status: 'needs_cleaning',
              tokenNumber: null,
              sessionCleared: true,
            });
          }
        } catch (tableErr) {
          console.error('[recordPayment] Table update failed (non-fatal):', tableErr.message);
        }
      }

      // ── 5. Customer stats update ──────────────────────────────
      if (session.customerId) {
        try {
          await Customer.findByIdAndUpdate(session.customerId, {
            $inc: { total_orders: 1, total_spent: session.totalAmount },
            last_visit: new Date(),
          });
        } catch (custErr) {
          console.error('[recordPayment] Customer update failed (non-fatal):', custErr.message);
        }
      }

      // ── 6. Invoice creation ───────────────────────────────────
      if (!session.invoiceId) {
        try {
          const franchise = await Franchise.findById(_fid);
          if (!franchise) throw new Error(`Franchise ${_fidStr} not found`);

          const code = franchise.franchiseCode || `FR${String(franchise._id).slice(-4).toUpperCase()}`;
          franchise.invoiceCounter = (franchise.invoiceCounter || 0) + 1;
          await franchise.save();
          const invoiceNo = `${code}-INV-${String(franchise.invoiceCounter).padStart(4, '0')}`;

          const customer = session.customerId ? await Customer.findById(session.customerId) : null;
          const primaryOrderId = session.subOrders?.find((sub) => sub.order_id)?.order_id;

          const invoiceData = {
            invoice_no:        invoiceNo,
            franchise_id:      franchise._id,
            franchise_name:    franchise.name,
            franchise_gstin:   franchise.gstin   || '',
            franchise_address: franchise.address  || '',
            franchise_state:   franchise.state    || '',
            customer_id:       customer?._id      || null,
            customer_name:     customer?.name     || session.customerName   || 'Walk-in',
            customer_phone:    customer?.phone_no || session.customerMobile || '',
            taxable_amount:    session.subtotal      || 0,
            cgst:              session.cgst_amount   || 0,
            sgst:              session.sgst_amount   || 0,
            igst:              0,
            total_tax:         session.total_tax     || 0,
            discount_amount:   session.discountAmount || 0,
            final_amount:      session.totalAmount,
            payment_mode:      method || 'Cash',
            items: (session.mergedItems || []).map((i) => ({
              name:       i.name,
              hsn_code:   i.hsn_code   || '',
              quantity:   i.qty        || 1,
              price:      i.unitPrice  || 0,
              gst_rate:   i.gst_rate   || 0,
              item_total: i.totalPrice || 0,
            })),
            visit_type: session.visitType || 'single',
          };
          if (primaryOrderId)      invoiceData.order_id      = primaryOrderId;
          if (session.tableNumber) invoiceData.table_number  = session.tableNumber;
          if (session.tokenNumber) invoiceData.token_number  = session.tokenNumber;

          const invoice = await Invoice.create(invoiceData);
          session.invoiceId = invoice._id;
        } catch (invErr) {
          console.error('[recordPayment] Invoice creation failed (non-fatal):', invErr.message);
        }
      }

      // ── 7. Socket: session closed ─────────────────────────────
      const ioC = req.app.get('io');
      if (ioC) {
        ioC.to(`franchise:${_fidStr}`).emit('session:closed', {
          tokenNumber: session.tokenNumber,
          tableNumber: session.tableNumber,
          sessionId:   session._id.toString(),
        });
        ioC.to(`pos:${_fidStr}`).emit('session:paid', { sessionId: session._id.toString() });
      }

    } else if (session.paidAmount > 0) {
      session.paymentStatus = balance < 0 ? 'advance_paid' : 'partially_paid';
    }

    // ── 8. Save session ───────────────────────────────────────────
    await session.save();

    // ── 9. Socket: payment received ───────────────────────────────
    const ioP = req.app.get('io');
    if (ioP) {
      const payloadEmit = {
        sessionId:     session._id.toString(),
        tokenNumber:   session.tokenNumber,
        paidAmount:    session.paidAmount,
        totalAmount:   session.totalAmount,
        paymentStatus: session.paymentStatus,
      };
      ioP.to(`pos:${_fidStr}`).emit('payment:received', payloadEmit);
      ioP.to(`franchise:${_fidStr}`).emit('payment:received', payloadEmit);
    }

    const populatedSession = await OrderSession.findById(session._id).populate('invoiceId');
    return res.json({
      success: true,
      session: populatedSession,
      invoice: populatedSession?.invoiceId || null,
      balance: Math.max(0, balance),
    });

  } catch (err) {
    console.error('[recordPayment] FATAL:', err.message, err.stack);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/sessions — List active sessions for franchise
const getSessions = async (req, res) => {
  try {
    const franchiseId = req.user.role === 'master_admin'
      ? req.query.franchiseId
      : (req.user.franchise_id?._id || req.user.franchise_id);

    // ── BUG FIX: Guard against missing franchiseId for master_admin without param
    if (!franchiseId) {
      return res.status(400).json({ success: false, message: 'franchiseId query param required for master_admin' });
    }

    const filter = { franchiseId };
    if (req.query.status) {
      const statuses = req.query.status.split(',').map(s => s.trim()).filter(Boolean);
      filter.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
    } else {
      filter.status = { $in: ['open', 'bill_pending'] };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    filter.openedAt = { $gte: todayStart };

    const sessions = await OrderSession.find(filter)
      .populate('customerId', 'name phone_no')
      .sort({ openedAt: -1 })
      .limit(100)
      .lean();

    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/sessions/:sessionId/customer — Register/link customer to open session
const linkCustomer = async (req, res) => {
  try {
    const { name, gender, age, city, state, address, village, pincode } = req.body;
    const session = await OrderSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    let customer = await Customer.findOne({ phone_no: session.customerMobile });
    if (!customer) {
      customer = await Customer.create({
        phone_no: session.customerMobile,
        name: name || 'Customer',
        gender: gender || '',
        age: age || null,
        city: city || '',
        state: state || '',
        address: address || '',
        village: village || '',
        pincode: pincode || '',
      });
    } else {
      if (name) customer.name = name;
      if (gender) customer.gender = gender;
      if (age) customer.age = age;
      if (city) customer.city = city;
      await customer.save();
    }

    session.customerId = customer._id;
    session.customerName = customer.name;
    await session.save();

    res.json({ success: true, customer, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/sessions/:sessionId/hold
async function holdSession(req, res) {
  try {
    const { note } = req.body;
    const session = await OrderSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (!['open', 'bill_pending'].includes(session.status)) {
      return res.status(400).json({ success: false, message: `Cannot hold a session with status: ${session.status}` });
    }
    session.status    = 'on_hold';
    session.held_at   = new Date();
    session.hold_note = note || '';
    await session.save();

    if (session.tableId) {
      await Table.findByIdAndUpdate(session.tableId, { status: 'held' });
    }

    res.json({ success: true, message: 'Bill placed on hold', session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// POST /api/sessions/:sessionId/resume
async function resumeSession(req, res) {
  try {
    const session = await OrderSession.findById(req.params.sessionId)
      .populate('customerId', 'name phone_no')
      .populate('tableId', 'tableNumber');
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (session.status !== 'on_hold') {
      return res.status(400).json({ success: false, message: 'Session is not on hold' });
    }
    session.status  = 'open';
    session.held_at = null;
    await session.save();

    if (session.tableId) {
      await Table.findByIdAndUpdate(session.tableId, { status: 'occupied' });
    }

    res.json({ success: true, message: 'Bill resumed', session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// GET /api/sessions/held
async function getHeldSessions(req, res) {
  try {
    const franchiseId = req.user.franchise_id?._id || req.user.franchise_id;
    const sessions = await OrderSession.find({ franchiseId, status: 'on_hold' })
      .populate('customerId', 'name phone_no')
      .populate('tableId', 'tableNumber')
      .sort({ held_at: -1 });
    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// POST /api/sessions/:sessionId/cancel
async function cancelSession(req, res) {
  try {
    const session = await OrderSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (['closed', 'cancelled'].includes(session.status)) {
      return res.status(400).json({ success: false, message: 'Session already closed or cancelled' });
    }
    session.status = 'cancelled';
    session.cancelled_at = new Date();
    session.cancel_reason = req.body.reason || 'Cancelled by operator';
    await session.save();

    if (session.tableId) {
      // ── BUG FIX: Use req.app.get('io') instead of broken lib/socket import
      await Table.findByIdAndUpdate(session.tableId, { status: 'available', currentSessionId: null });
      const io = req.app.get('io');
      if (io) {
        io.to(`franchise:${session.franchiseId}`).emit('table:statusUpdated', {
          tableId: session.tableId.toString(),
          status: 'available',
        });
      }
    }
    res.json({ success: true, message: 'Order cancelled successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { startSession, addOrderToSession, getSession, generateBill, recordPayment, getSessions, linkCustomer, holdSession, resumeSession, getHeldSessions, cancelSession };
