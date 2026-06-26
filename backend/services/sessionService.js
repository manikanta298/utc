const OrderSession = require('../models/OrderSession');
const Customer = require('../models/Customer');
const Franchise = require('../models/Franchise');
const Table = require('../models/Table');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const Invoice = require('../models/Invoice');
const Counter = require('../models/Counter');
const Coupon = require('../models/Coupon');
const { generateToken, generateSessionRef } = require('../utils/tokenGenerator');
const { determineTaxType, calculateOrderTax } = require('../utils/gst');
const { derivePaymentStatus } = require('./paymentService');

const VISIT_TYPES = ['single', 'couple', 'family', 'friends'];
const ACTIVE_STATUSES = ['open', 'bill_pending'];

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

// ── startSession ─────────────────────────────────────────────────────────────
async function startSessionFlow({ franchiseId, mobile, tableNumber, orderType = 'dine_in', tableId, openedBy }) {
  if (!mobile || mobile.trim().length < 10) fail(400, 'Valid mobile number required');

  const franchise = await Franchise.findById(franchiseId);
  if (!franchise) fail(404, 'Franchise not found');

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const existingSession = await OrderSession.findOne({
    franchiseId,
    customerMobile: mobile.trim(),
    status: { $in: ACTIVE_STATUSES },
    openedAt: { $gte: todayStart },
  }).populate('customerId', 'name phone_no total_points total_orders total_spent');

  if (existingSession) {
    return {
      session: existingSession,
      isResumed: true,
      isNewCustomer: false,
      customer: null,
      message: `Resumed Token ${existingSession.tokenNumber} — ${existingSession.tableNumber}`,
    };
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
    openedBy,
  });

  if (tableId) {
    await Table.findByIdAndUpdate(tableId, { status: 'occupied', currentSessionId: session._id });
  }

  return {
    session,
    isResumed: false,
    isNewCustomer,
    customer: customer || null,
    tokenNumber,
    tableNumber: tableNumber || 'Counter',
    tableId,
    message: `Token ${tokenNumber} created for ${tableNumber || 'Counter'}`,
  };
}

// ── addOrderToSession ────────────────────────────────────────────────────────
async function buildSessionOrderItems(items, franchiseId) {
  const builtItems = [];
  for (const line of items) {
    const menuItem = await MenuItem.findById(line.menuItemId);
    if (!menuItem || !menuItem.isGlobalActive) fail(400, `Item not available: ${line.menuItemId}`);
    if (menuItem.disabledInFranchises.map(String).includes(franchiseId.toString())) {
      fail(400, `Item disabled at this outlet: ${menuItem.name}`);
    }
    const qty = line.qty || line.quantity || 1;
    builtItems.push({
      menuItemId: menuItem._id,
      name: menuItem.name,
      qty,
      unitPrice: menuItem.price,
      totalPrice: +(menuItem.price * qty).toFixed(2),
      gst_rate: menuItem.gst_rate,
      hsn_code: menuItem.hsn_code || '',
      notes: line.notes || '',
    });
  }
  return builtItems;
}

async function findOrCreateSessionCustomer(session, franchiseId) {
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
  return customer;
}

/**
 * Creates one Order document for a session from already-built items.
 * Shared by addOrderToSessionFlow (POS/waiter adding items live) and
 * approveWaiterOrderFlow (promoting a pending waiter order at approval
 * time) — this is the ONE place that creates Order documents for a
 * session, so both paths produce orders the kitchen can actually see.
 */
async function createOrderFromItems({ session, franchise, builtItems, createdBy, waiterName, role }) {
  const franchiseId = franchise._id;

  const taxType = determineTaxType(franchise.state, franchise.state);
  const { subTotal, cgst, sgst, igst, totalTax, grossTotal } = calculateOrderTax(
    builtItems.map(i => ({ ...i, price: i.unitPrice, quantity: i.qty, item_total: i.totalPrice })),
    taxType
  );

  const counterKey = `order_${franchiseId}`;
  const counter = await Counter.findOneAndUpdate({ key: counterKey }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  const orderNumber = `${franchise.franchiseCode}-ORD-${String(counter.seq).padStart(5, '0')}`;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const lastOrder = await Order.findOne(
    { franchise_id: franchiseId, createdAt: { $gte: startOfDay } },
    { token_number: 1 },
    { sort: { token_number: -1 } }
  ).lean();
  const tokenNum = (lastOrder?.token_number || 0) + 1;

  const customer = await findOrCreateSessionCustomer(session, franchiseId);

  const order = await Order.create({
    order_number: orderNumber,
    franchise_id: franchiseId,
    customer_id: customer._id,
    items: builtItems.map(i => ({
      item_id: i.menuItemId, name: i.name, price: i.unitPrice, gst_rate: i.gst_rate,
      hsn_code: i.hsn_code, quantity: i.qty, item_total: i.totalPrice,
    })),
    sub_total: subTotal,
    cgst_amount: cgst,
    sgst_amount: sgst,
    igst_amount: igst,
    total_tax: totalTax,
    gross_total: grossTotal,
    discount_amount: 0,
    final_amount: grossTotal,
    tax_type: taxType,
    payment_mode: 'Cash',
    payment_status: 'Pending',
    kitchen_status: 'Pending',
    token_number: tokenNum,
    waiter_name: waiterName || '',
    order_source: role === 'waiter' ? 'waiter' : role === 'qr_customer' ? 'qr_customer' : 'pos_operator',
    order_type: session.orderType || 'dine_in',
    customer_mobile: session.customerMobile || '',
    table_number: session.tableNumber || '',
    table_id: session.tableId || null,
    session_id: session._id,
    created_by: createdBy,
    status_history: [{ status: 'Pending', updatedBy: createdBy }],
  });

  return order;
}

async function addOrderToSessionFlow({ sessionId, items, destination = 'kitchen', createdBy, waiterName, role }) {
  const session = await OrderSession.findById(sessionId);
  if (!session) fail(404, 'Session not found');
  if (session.status === 'paid' || session.status === 'closed') fail(400, 'Session is already closed');
  if (!Array.isArray(items) || items.length === 0) fail(400, 'Add at least one item before sending order');

  const franchiseId = session.franchiseId;
  const franchise = await Franchise.findById(franchiseId);
  if (!franchise) fail(404, 'Franchise not found');

  const builtItems = await buildSessionOrderItems(items, franchiseId);
  const isAddition = session.subOrders.length > 0;

  const order = await createOrderFromItems({ session, franchise, builtItems, createdBy, waiterName, role });

  session.subOrders.push({
    orderedAt: new Date(),
    isAddition,
    destination,
    items: builtItems,
    placedBy: createdBy,
    order_id: order._id,
  });
  await session.save();

  return { session, order, isAddition, builtItems, orderNumber: order.order_number, franchiseId, destination };
}

// ── getSession ───────────────────────────────────────────────────────────────
async function getSessionForUser(sessionId, { isMaster, requestingFranchiseId }) {
  const session = await OrderSession.findById(sessionId)
    .populate('customerId', 'name phone_no total_points total_orders total_spent')
    .populate('franchiseId', 'name franchiseCode state gstin address')
    .populate('openedBy', 'name');

  if (!session) fail(404, 'Session not found');

  if (!isMaster) {
    const sessionFranchise = (session.franchiseId?._id || session.franchiseId).toString();
    if (sessionFranchise !== requestingFranchiseId.toString()) fail(403, 'Access denied');
  }

  return { session };
}

// ── generateBill ─────────────────────────────────────────────────────────────
function mergeSubOrderItems(subOrders) {
  const itemMap = new Map();
  for (const sub of subOrders) {
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
  return [...itemMap.values()];
}

async function applyBillCoupon(couponCode, grossTotal) {
  if (!couponCode) return { discountAmount: 0, appliedCoupon: '' };

  const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
  if (!coupon) return { discountAmount: 0, appliedCoupon: '' };

  const now = new Date();
  const notExpired = !coupon.expiresAt || coupon.expiresAt > now;
  const hasUses = coupon.maxUses === 0 || coupon.usedCount < coupon.maxUses;
  const meetsMin = grossTotal >= coupon.minOrderAmount;
  if (!notExpired || !hasUses || !meetsMin) return { discountAmount: 0, appliedCoupon: '' };

  let discountAmount = coupon.discountType === 'percentage'
    ? +(grossTotal * coupon.discountValue / 100).toFixed(2)
    : Math.min(coupon.discountValue, grossTotal);
  if (coupon.discountType === 'percentage' && coupon.maxDiscountAmount > 0) {
    discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
  }

  coupon.usedCount += 1;
  await coupon.save();
  return { discountAmount, appliedCoupon: coupon.code };
}

async function generateBillFlow({ sessionId, couponCode, orderType }) {
  const session = await OrderSession.findById(sessionId).populate('franchiseId', 'name franchiseCode state gstin address');
  if (!session) fail(404, 'Session not found');
  if (session.status === 'paid' || session.status === 'closed') fail(400, 'Session already closed');
  if (!session.subOrders || session.subOrders.length === 0) {
    fail(400, 'No orders in this session. Add items before generating a bill.');
  }

  const mergedItems = mergeSubOrderItems(session.subOrders);
  const franchise = session.franchiseId;
  const taxCalc = calculateOrderTax(
    mergedItems.map(i => ({ price: i.unitPrice, quantity: i.qty, item_total: i.totalPrice, gst_rate: i.gst_rate })),
    determineTaxType(franchise.state, franchise.state)
  );

  const { discountAmount, appliedCoupon } = await applyBillCoupon(couponCode, taxCalc.grossTotal);
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

  if (session.tableId) {
    await Table.findByIdAndUpdate(session.tableId, { status: 'bill_pending' });
  }

  return { session, mergedItems, totalAmount, discountAmount };
}

// ── recordPayment ────────────────────────────────────────────────────────────
async function recordSessionPaymentFlow({ sessionId, amount, method, reference, visitType, receivedBy }) {
  const parsedAmount = parseFloat(amount);
  if (!parsedAmount || parsedAmount <= 0 || isNaN(parsedAmount)) fail(400, 'Invalid payment amount');

  const session = await OrderSession.findById(sessionId);
  if (!session) fail(404, 'Session not found');
  if (session.status === 'paid' || session.status === 'closed') fail(400, 'Session is already closed');
  if (session.totalAmount === 0 && session.status !== 'bill_pending') {
    fail(400, 'Please generate a bill before recording payment.');
  }

  const fid = session.franchiseId?._id || session.franchiseId;
  if (!fid) {
    console.error('[recordSessionPaymentFlow] Missing franchiseId on session', session._id);
    fail(500, 'Session data corrupted: franchiseId missing');
  }
  const fidStr = fid.toString();

  if (visitType && VISIT_TYPES.includes(visitType)) {
    session.visitType = visitType;
  }

  session.payments.push({ amount: parsedAmount, method: method || 'Cash', reference: reference || '', receivedBy });
  session.paidAmount = +(session.paidAmount + parsedAmount).toFixed(2);
  const { paymentStatus, isFullyPaid, balance } = derivePaymentStatus(session.paidAmount, session.totalAmount);
  session.paymentStatus = paymentStatus;

  let tableUpdated = false;
  let invoiceCreated = false;

  if (isFullyPaid) {
    session.status = 'paid';
    session.closedAt = new Date();

    if (session.tableId) {
      try {
        await Table.findByIdAndUpdate(session.tableId, { status: 'needs_cleaning', currentSessionId: null });
        tableUpdated = true;
      } catch (tableErr) {
        console.error('[recordSessionPaymentFlow] Table update failed (non-fatal):', tableErr.message);
      }
    }

    if (session.customerId) {
      try {
        await Customer.findByIdAndUpdate(session.customerId, {
          $inc: { total_orders: 1, total_spent: session.totalAmount },
          last_visit: new Date(),
        });
      } catch (custErr) {
        console.error('[recordSessionPaymentFlow] Customer update failed (non-fatal):', custErr.message);
      }
    }

    if (!session.invoiceId) {
      try {
        const franchise = await Franchise.findById(fid);
        if (!franchise) throw new Error(`Franchise ${fidStr} not found`);

        const code = franchise.franchiseCode || `FR${String(franchise._id).slice(-4).toUpperCase()}`;
        franchise.invoiceCounter = (franchise.invoiceCounter || 0) + 1;
        await franchise.save();
        const invoiceNo = `${code}-INV-${String(franchise.invoiceCounter).padStart(4, '0')}`;

        const customer = session.customerId ? await Customer.findById(session.customerId) : null;
        const primaryOrderId = session.subOrders?.find((sub) => sub.order_id)?.order_id;

        const invoiceData = {
          invoice_no: invoiceNo,
          franchise_id: franchise._id,
          franchise_name: franchise.name,
          franchise_gstin: franchise.gstin || '',
          franchise_address: franchise.address || '',
          franchise_state: franchise.state || '',
          customer_id: customer?._id || null,
          customer_name: customer?.name || session.customerName || 'Walk-in',
          customer_phone: customer?.phone_no || session.customerMobile || '',
          taxable_amount: session.subtotal || 0,
          cgst: session.cgst_amount || 0,
          sgst: session.sgst_amount || 0,
          igst: 0,
          total_tax: session.total_tax || 0,
          discount_amount: session.discountAmount || 0,
          final_amount: session.totalAmount,
          payment_mode: method || 'Cash',
          items: (session.mergedItems || []).map((i) => ({
            name: i.name, hsn_code: i.hsn_code || '', quantity: i.qty || 1,
            price: i.unitPrice || 0, gst_rate: i.gst_rate || 0, item_total: i.totalPrice || 0,
          })),
          visit_type: session.visitType || 'single',
        };
        if (primaryOrderId) invoiceData.order_id = primaryOrderId;
        if (session.tableNumber) invoiceData.table_number = session.tableNumber;
        if (session.tokenNumber) invoiceData.token_number = session.tokenNumber;

        const invoice = await Invoice.create(invoiceData);
        session.invoiceId = invoice._id;
        invoiceCreated = true;
      } catch (invErr) {
        console.error('[recordSessionPaymentFlow] Invoice creation failed (non-fatal):', invErr.message);
      }
    }
  }

  await session.save();

  const populatedSession = await OrderSession.findById(session._id).populate('invoiceId');

  return {
    session: populatedSession,
    invoice: populatedSession?.invoiceId || null,
    balance: Math.max(0, balance),
    isFullyPaid,
    tableUpdated,
    invoiceCreated,
    franchiseId: fidStr,
    tableId: session.tableId,
  };
}

// ── getSessions ──────────────────────────────────────────────────────────────
async function getSessionsList({ isMaster, requestingFranchiseId, queryFranchiseId, statusQuery }) {
  const franchiseId = isMaster ? queryFranchiseId : requestingFranchiseId;
  if (!franchiseId) fail(400, 'franchiseId query param required for master_admin');

  const filter = { franchiseId };
  if (statusQuery) {
    const statuses = statusQuery.split(',').map(s => s.trim()).filter(Boolean);
    filter.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
  } else {
    filter.status = { $in: ACTIVE_STATUSES };
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  filter.openedAt = { $gte: todayStart };

  const sessions = await OrderSession.find(filter)
    .populate('customerId', 'name phone_no')
    .sort({ openedAt: -1 })
    .limit(100)
    .lean();

  return { sessions };
}

// ── linkCustomer ─────────────────────────────────────────────────────────────
async function linkCustomerToSession({ sessionId, name, gender, age, city, state, address, village, pincode }) {
  const session = await OrderSession.findById(sessionId);
  if (!session) fail(404, 'Session not found');

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

  return { customer, session };
}

// ── hold / resume / held list / cancel ──────────────────────────────────────
async function holdSessionFlow(sessionId, note) {
  const session = await OrderSession.findById(sessionId);
  if (!session) fail(404, 'Session not found');
  if (!ACTIVE_STATUSES.includes(session.status)) fail(400, `Cannot hold a session with status: ${session.status}`);

  session.status = 'on_hold';
  session.held_at = new Date();
  session.hold_note = note || '';
  await session.save();

  if (session.tableId) await Table.findByIdAndUpdate(session.tableId, { status: 'held' });

  return { session };
}

async function resumeSessionFlow(sessionId) {
  const session = await OrderSession.findById(sessionId)
    .populate('customerId', 'name phone_no')
    .populate('tableId', 'tableNumber');
  if (!session) fail(404, 'Session not found');
  if (session.status !== 'on_hold') fail(400, 'Session is not on hold');

  session.status = 'open';
  session.held_at = null;
  await session.save();

  if (session.tableId) await Table.findByIdAndUpdate(session.tableId, { status: 'occupied' });

  return { session };
}

async function getHeldSessionsList(franchiseId) {
  const sessions = await OrderSession.find({ franchiseId, status: 'on_hold' })
    .populate('customerId', 'name phone_no')
    .populate('tableId', 'tableNumber')
    .sort({ held_at: -1 });
  return { sessions };
}

async function cancelSessionFlow(sessionId, reason) {
  const session = await OrderSession.findById(sessionId);
  if (!session) fail(404, 'Session not found');
  if (['closed', 'cancelled'].includes(session.status)) fail(400, 'Session already closed or cancelled');

  session.status = 'cancelled';
  session.cancelled_at = new Date();
  session.cancel_reason = reason || 'Cancelled by operator';
  await session.save();

  let tableId = null;
  if (session.tableId) {
    await Table.findByIdAndUpdate(session.tableId, { status: 'available', currentSessionId: null });
    tableId = session.tableId;
  }

  return { session, tableId, franchiseId: session.franchiseId };
}

// ── approveWaiterOrder ───────────────────────────────────────────────────────
/**
 * Promotes a waiter-placed session's pending items into real Order
 * documents — this is the fix for the gap where waiter orders never
 * created an Order at all, so kitchen could never see them no matter
 * what got approved. Idempotent: skips any subOrder that already has
 * an order_id (so re-approving, or a session with multiple pending
 * subOrders, never double-creates).
 */
async function approveWaiterOrderFlow({ sessionId, approvedBy }) {
  const session = await OrderSession.findById(sessionId);
  if (!session) fail(404, 'Session not found');

  if (session.status === 'open') {
    return { session, alreadyApproved: true, createdOrders: [] }; // idempotent re-approval
  }
  if (session.status !== 'pending_pos') {
    fail(400, `Cannot approve session with status: ${session.status}`);
  }

  const franchise = await Franchise.findById(session.franchiseId);
  if (!franchise) fail(404, 'Franchise not found');

  const createdOrders = [];
  for (const sub of session.subOrders) {
    if (sub.order_id) continue; // already promoted

    // sub.items are Mongoose subdocuments, not plain objects like buildSessionOrderItems
    // produces — createOrderFromItems spreads items for the tax calc, which doesn't
    // reliably enumerate Mongoose document fields. Normalize explicitly to be safe.
    const builtItems = sub.items.map(i => ({
      menuItemId: i.menuItemId,
      name: i.name,
      qty: i.qty,
      unitPrice: i.unitPrice,
      totalPrice: i.totalPrice,
      gst_rate: i.gst_rate,
      hsn_code: i.hsn_code || '',
    }));

    const order = await createOrderFromItems({
      session,
      franchise,
      builtItems,
      createdBy: sub.placedBy || approvedBy,
      waiterName: '',
      role: 'waiter',
    });
    sub.order_id = order._id;
    createdOrders.push(order);
  }

  session.status = 'open';
  session.approvedBy = approvedBy;
  session.approvedAt = new Date();
  await session.save();

  return { session, alreadyApproved: false, createdOrders, franchiseId: session.franchiseId };
}

module.exports = {
  startSessionFlow,
  buildSessionOrderItems,
  findOrCreateSessionCustomer,
  addOrderToSessionFlow,
  getSessionForUser,
  mergeSubOrderItems,
  applyBillCoupon,
  generateBillFlow,
  recordSessionPaymentFlow,
  getSessionsList,
  linkCustomerToSession,
  holdSessionFlow,
  resumeSessionFlow,
  getHeldSessionsList,
  cancelSessionFlow,
  approveWaiterOrderFlow,
};
