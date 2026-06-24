const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Franchise = require('../models/Franchise');
const MenuItem = require('../models/MenuItem');
const Invoice = require('../models/Invoice');
const Loyalty = require('../models/Loyalty');
const Counter = require('../models/Counter');
const Coupon = require('../models/Coupon');
const { determineTaxType, calculateOrderTax, calculatePointsEarned, calculatePointsValue } = require('../utils/gst');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const VISIT_TYPES = ['single', 'couple', 'family', 'friends'];

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

// ── Order number / token number generation ─────────────────────────────────
async function generateOrderNumber(franchise) {
  const key = `order_${franchise._id}`;
  const counter = await Counter.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `${franchise.franchiseCode}-ORD-${String(counter.seq).padStart(5, '0')}`;
}

async function generateTokenNumber(franchiseId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const last = await Order.findOne(
    { franchise_id: franchiseId, createdAt: { $gte: startOfDay } },
    { token_number: 1 },
    { sort: { token_number: -1 } }
  ).lean();
  return (last?.token_number || 0) + 1;
}

// ── Order placement — the core flow ─────────────────────────────────────────
async function buildOrderItems(items, franchise) {
  const orderItems = [];
  for (const line of items) {
    const menuItem = await MenuItem.findById(line.item_id);
    if (!menuItem || !menuItem.isGlobalActive) {
      fail(400, `Item not available: ${line.item_id}`);
    }
    if (menuItem.disabledInFranchises.map(String).includes(franchise._id.toString())) {
      fail(400, `Item disabled at this outlet: ${menuItem.name}`);
    }
    orderItems.push({
      item_id: menuItem._id,
      name: menuItem.name,
      price: menuItem.price,
      gst_rate: menuItem.gst_rate,
      hsn_code: menuItem.hsn_code,
      quantity: line.quantity,
      item_total: +(menuItem.price * line.quantity).toFixed(2),
    });
  }
  return orderItems;
}

/** Pure — no DB. */
function applyLoyaltyRedemption(customer, pointsToRedeem) {
  let discountAmount = 0;
  let pointsRedeemed = 0;
  if (pointsToRedeem && pointsToRedeem > 0) {
    pointsRedeemed = Math.min(pointsToRedeem, customer.total_points);
    discountAmount = calculatePointsValue(pointsRedeemed);
  }
  return { discountAmount, pointsRedeemed };
}

async function applyCouponRedemption(couponCode, grossTotal) {
  if (!couponCode) return { couponDiscount: 0, couponCode: null, couponId: null };

  const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
  if (!coupon) return { couponDiscount: 0, couponCode: null, couponId: null };

  const now = new Date();
  const expired = coupon.expiresAt && now > coupon.expiresAt;
  const maxed = coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses;
  const minOk = grossTotal >= (coupon.minOrderAmount || 0);
  if (expired || maxed || !minOk) return { couponDiscount: 0, couponCode: null, couponId: null };

  let couponDiscount = coupon.discountType === 'percentage'
    ? +(grossTotal * coupon.discountValue / 100).toFixed(2)
    : coupon.discountValue;
  if (coupon.maxDiscountAmount > 0) couponDiscount = Math.min(couponDiscount, coupon.maxDiscountAmount);

  await Coupon.findByIdAndUpdate(coupon._id, { $inc: { usedCount: 1 } });
  return { couponDiscount, couponCode: coupon.code, couponId: coupon._id };
}

async function updateCustomerAfterOrder(customer, { orderItems, finalAmount, pointsRedeemed, pointsEarned }) {
  const balanceBefore = customer.total_points;
  customer.total_points = customer.total_points - pointsRedeemed + pointsEarned;
  customer.total_orders += 1;
  customer.total_spent += finalAmount;
  customer.last_visit = new Date();
  const favoriteItems = new Set(customer.favorite_items || []);
  orderItems.forEach((item) => favoriteItems.add(item.name));
  customer.favorite_items = [...favoriteItems].slice(0, 20);
  await customer.save();
  return balanceBefore;
}

async function recordLoyaltyTransactions({ customer, order, franchise, pointsRedeemed, pointsEarned, balanceBefore, finalAmount }) {
  if (pointsRedeemed > 0) {
    await Loyalty.create({
      customer_id: customer._id,
      order_id: order._id,
      franchise_id: franchise._id,
      transaction_type: 'redeem',
      points_used: pointsRedeemed,
      balance_before: balanceBefore,
      balance_after: balanceBefore - pointsRedeemed,
      bill_amount: finalAmount,
    });
  }
  await Loyalty.create({
    customer_id: customer._id,
    order_id: order._id,
    franchise_id: franchise._id,
    transaction_type: 'earn',
    points_earned: pointsEarned,
    balance_before: balanceBefore - pointsRedeemed,
    balance_after: customer.total_points,
    bill_amount: finalAmount,
  });
}

async function generateOrderInvoice({ franchise, order, customer, orderItems, subTotal, cgst, sgst, igst, totalTax, discountAmount, finalAmount, paymentMode }) {
  franchise.invoiceCounter += 1;
  await franchise.save();
  const invoiceNo = `${franchise.franchiseCode}-INV-${String(franchise.invoiceCounter).padStart(3, '0')}`;

  return Invoice.create({
    invoice_no: invoiceNo,
    order_id: order._id,
    franchise_id: franchise._id,
    customer_id: customer._id,
    franchise_name: franchise.name,
    franchise_gstin: franchise.gstin,
    franchise_address: franchise.address,
    franchise_state: franchise.state,
    customer_name: customer.name,
    customer_phone: customer.phone_no,
    taxable_amount: subTotal,
    cgst, sgst, igst,
    total_tax: totalTax,
    discount_amount: discountAmount,
    final_amount: finalAmount,
    payment_mode: paymentMode,
    items: orderItems.map((i) => ({
      name: i.name, hsn_code: i.hsn_code, quantity: i.quantity,
      price: i.price, gst_rate: i.gst_rate, item_total: i.item_total,
    })),
    visit_type: order.visit_type,
  });
}

/**
 * Orchestrates the full order-placement flow: franchise/customer validation,
 * item validation, tax calc, loyalty + coupon redemption, order creation,
 * customer point updates, loyalty ledger entries, invoice generation.
 *
 * Throws tagged errors (.status) for the controller to map to HTTP codes.
 * Deliberately has no knowledge of req/res, Socket.IO, or SMS — those stay
 * the controller's job.
 */
async function placeOrder({
  franchiseId, customerId, items, paymentMode, pointsToRedeem, customerState,
  orderType = 'dine_in', tableNumber = '', tableId = null, sessionId = null,
  visitType = 'single', couponCode, createdBy, waiterName,
}) {
  const franchise = await Franchise.findById(franchiseId);
  if (!franchise || !franchise.isActive) fail(403, 'Franchise is inactive or not found');

  const customer = await Customer.findById(customerId);
  if (!customer) fail(404, 'Customer not found');

  const orderItems = await buildOrderItems(items, franchise);

  const taxType = determineTaxType(franchise.state, customerState || franchise.state);
  const { subTotal, cgst, sgst, igst, totalTax, grossTotal } = calculateOrderTax(orderItems, taxType);

  const { discountAmount, pointsRedeemed } = applyLoyaltyRedemption(customer, pointsToRedeem);
  const { couponDiscount, couponCode: appliedCouponCode, couponId } = await applyCouponRedemption(couponCode, grossTotal);

  const totalDiscount = discountAmount + couponDiscount;
  const finalAmount = Math.max(0, +(grossTotal - totalDiscount).toFixed(2));
  const pointsEarned = calculatePointsEarned(finalAmount);

  const orderNumber = await generateOrderNumber(franchise);
  const tokenNumber = await generateTokenNumber(franchise._id);

  const order = await Order.create({
    order_number: orderNumber,
    franchise_id: franchise._id,
    customer_id: customer._id,
    items: orderItems,
    sub_total: subTotal,
    cgst_amount: cgst,
    sgst_amount: sgst,
    igst_amount: igst,
    total_tax: totalTax,
    gross_total: grossTotal,
    discount_amount: discountAmount,
    coupon_code: appliedCouponCode,
    coupon_id: couponId,
    coupon_discount: couponDiscount,
    total_discount: totalDiscount,
    points_redeemed: pointsRedeemed,
    final_amount: finalAmount,
    tax_type: taxType,
    payment_mode: paymentMode,
    payment_status: 'Paid',
    kitchen_status: 'Pending',
    token_number: tokenNumber,
    order_type: orderType,
    table_number: tableNumber || '',
    table_id: tableId || null,
    session_id: sessionId || null,
    customer_mobile: customer.phone_no || '',
    waiter_name: waiterName || '',
    created_by: createdBy,
    points_earned: pointsEarned,
    visit_type: VISIT_TYPES.includes(visitType) ? visitType : 'single',
    status_history: [{ status: 'Pending', updatedBy: createdBy }],
  });

  const balanceBefore = await updateCustomerAfterOrder(customer, { orderItems, finalAmount, pointsRedeemed, pointsEarned });
  await recordLoyaltyTransactions({ customer, order, franchise, pointsRedeemed, pointsEarned, balanceBefore, finalAmount });

  const invoice = await generateOrderInvoice({
    franchise, order, customer, orderItems, subTotal, cgst, sgst, igst, totalTax, discountAmount, finalAmount, paymentMode,
  });

  return { order, invoice, customer, franchise, finalAmount };
}

// ── Read paths ───────────────────────────────────────────────────────────────
function buildOrderListFilter({ isMaster, requestingFranchiseId, queryFranchiseId, includeArchived, status, search, date }) {
  const filter = {};
  if (includeArchived !== 'true') filter.archivedAt = null;

  if (!isMaster) {
    filter.franchise_id = requestingFranchiseId;
  } else if (queryFranchiseId) {
    filter.franchise_id = queryFranchiseId;
  }

  if (status) filter.kitchen_status = status;
  if (search) filter.order_number = { $regex: search, $options: 'i' };

  if (date) {
    const d = new Date(date);
    const nextDay = new Date(d);
    nextDay.setDate(d.getDate() + 1);
    filter.createdAt = { $gte: d, $lt: nextDay };
  }

  return filter;
}

async function getOrdersPaginated(filter, { page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('customer_id', 'name phone_no')
      .populate('franchise_id', 'name franchiseCode')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Order.countDocuments(filter),
  ]);
  return { orders, total };
}

async function getOrderForUser(orderId, { isMaster, requestingFranchiseId }) {
  const order = await Order.findById(orderId)
    .populate('customer_id', 'name phone_no total_points')
    .populate('franchise_id', 'name franchiseCode state gstin address')
    .populate('created_by', 'name');

  if (!order) fail(404, 'Order not found');

  if (!isMaster) {
    if (order.franchise_id._id.toString() !== requestingFranchiseId.toString()) {
      fail(403, 'Access denied');
    }
  }

  const invoice = await Invoice.findOne({ order_id: order._id }).select('_id invoice_no');
  return { order, invoice };
}

const csvEscape = (value) => {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

/** Pure — takes already-fetched order docs, returns CSV-ready header+rows. */
function buildOrderCsvRows(orders) {
  const header = ['Order No', 'Date', 'Franchise', 'Customer', 'Phone', 'Items', 'Payment', 'Kitchen', 'Subtotal', 'Tax', 'Discount', 'Final', 'Visited As'];
  const rows = orders.map((order) => [
    order.order_number,
    order.createdAt?.toISOString(),
    `${order.franchise_id?.franchiseCode || ''} ${order.franchise_id?.name || ''}`.trim(),
    order.customer_id?.name,
    order.customer_id?.phone_no,
    order.items?.map((item) => `${item.name} x ${item.quantity}`).join('; '),
    order.payment_mode,
    order.kitchen_status,
    order.sub_total,
    order.total_tax,
    order.discount_amount,
    order.final_amount,
    order.visit_type || '',
  ]);
  return { header, rows };
}

function buildOrderCsv(orders) {
  const { header, rows } = buildOrderCsvRows(orders);
  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

async function exportOrdersCsvData(filter) {
  const orders = await Order.find(filter)
    .populate('customer_id', 'name phone_no')
    .populate('franchise_id', 'name franchiseCode')
    .sort({ createdAt: -1 })
    .limit(5000);
  return buildOrderCsv(orders);
}

async function archiveOldOrders() {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
  const result = await Order.updateMany(
    { createdAt: { $lt: cutoff }, archivedAt: null },
    { $set: { archivedAt: new Date() } }
  );
  return { archived: result.modifiedCount || 0, cutoff };
}

function buildOrderHistoryFilter({ isMaster, requestingFranchiseId, queryFranchiseId, orderId, customerId, date, days = 30 }) {
  const filter = {};

  if (!isMaster) {
    filter.franchise_id = requestingFranchiseId;
  } else if (queryFranchiseId) {
    filter.franchise_id = queryFranchiseId;
  }

  if (orderId) {
    filter.$or = [
      { order_number: { $regex: orderId, $options: 'i' } },
      { _id: orderId.match(/^[0-9a-fA-F]{24}$/) ? orderId : null },
    ].filter((value) => value);
  }

  if (customerId) filter.customer_id = customerId;

  if (date) {
    const start = new Date(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    filter.createdAt = { $gte: start, $lt: end };
  } else if (customerId && !orderId) {
    const cutoff = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
    filter.createdAt = { $gte: cutoff };
  }

  return filter;
}

const formatCurrency = (value) => `Rs. ${Number(value || 0).toFixed(2)}`;

async function getOrderHistoryData(filter) {
  const orders = await Order.find(filter)
    .populate('customer_id', 'name phone_no total_points total_orders total_spent city gender age last_visit')
    .populate('franchise_id', 'name franchiseCode')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  const orderIds = orders.map((order) => order._id);
  const invoices = orderIds.length
    ? await Invoice.find({ order_id: { $in: orderIds } })
      .select('_id order_id invoice_no invoice_date final_amount payment_mode')
      .lean()
    : [];
  const invoiceMap = new Map(invoices.map((invoice) => [String(invoice.order_id), invoice]));

  const hydratedOrders = orders.map((order) => ({
    ...order,
    invoice: invoiceMap.get(String(order._id)) || null,
  }));

  const totalSpent = hydratedOrders.reduce((sum, order) => sum + Number(order.final_amount || 0), 0);
  const summary = {
    totalVisits: hydratedOrders.length,
    totalSpent,
    averageOrderValue: hydratedOrders.length ? totalSpent / hydratedOrders.length : 0,
    activity: hydratedOrders.slice(0, 10).map((order) => ({
      id: order._id,
      title: order.order_number,
      date: order.createdAt,
      description: `${formatCurrency(order.final_amount)} \u00b7 ${order.payment_mode} \u00b7 ${order.kitchen_status}`,
    })),
  };

  return {
    orders: hydratedOrders,
    summary,
    customer: hydratedOrders[0]?.customer_id || null,
  };
}

async function findCustomerByMobile(mobile) {
  const phone = String(mobile).replace(/\D/g, '').slice(-10);
  if (!phone) fail(400, 'Valid mobile number required');
  return Customer.findOne({ phone_no: { $regex: `${phone}$` } }).select('_id');
}

module.exports = {
  generateOrderNumber,
  generateTokenNumber,
  buildOrderItems,
  applyLoyaltyRedemption,
  applyCouponRedemption,
  updateCustomerAfterOrder,
  recordLoyaltyTransactions,
  generateOrderInvoice,
  placeOrder,
  buildOrderListFilter,
  getOrdersPaginated,
  getOrderForUser,
  buildOrderCsvRows,
  buildOrderCsv,
  exportOrdersCsvData,
  archiveOldOrders,
  buildOrderHistoryFilter,
  getOrderHistoryData,
  findCustomerByMobile,
};
