const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Franchise = require('../models/Franchise');
const MenuItem = require('../models/MenuItem');
const Invoice = require('../models/Invoice');
const Loyalty = require('../models/Loyalty');
const { determineTaxType, calculateOrderTax, calculatePointsEarned, calculatePointsValue } = require('../utils/gst');
const { sendOrderPlaced } = require('../utils/sms');
const Counter = require('../models/Counter');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const csvEscape = (value) => {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

const formatCurrency = (value) => `Rs. ${Number(value || 0).toFixed(2)}`;

// Generate order number: FR01-ORD-00001 (atomic — no race condition)
const generateOrderNumber = async (franchise) => {
  const key = `order_${franchise._id}`;
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${franchise.franchiseCode}-ORD-${String(counter.seq).padStart(5, '0')}`;
};

// Generate token number (daily sequential per franchise — uses max to avoid gaps from deleted orders)
const generateTokenNumber = async (franchiseId) => {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const last = await Order.findOne(
    { franchise_id: franchiseId, createdAt: { $gte: startOfDay } },
    { token_number: 1 },
    { sort: { token_number: -1 } }
  ).lean();
  return (last?.token_number || 0) + 1;
};

// @POST /api/orders  — Create new order (POS staff)
const createOrder = async (req, res) => {
  try {
    const {
      customer_id,
      items,            // [{item_id, quantity}]
      payment_mode,
      points_to_redeem, // optional
      customer_state,   // optional — for IGST logic
      order_type = 'dine_in',
      table_number = '',
      table_id = null,
      session_id = null,
      visit_type = 'single',
    } = req.body;

    const franchise = await Franchise.findById(req.user.franchise_id);
    if (!franchise || !franchise.isActive) {
      return res.status(403).json({ success: false, message: 'Franchise is inactive or not found' });
    }

    const customer = await Customer.findById(customer_id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    // Validate and build order items with current prices
    const orderItems = [];
    for (const line of items) {
      const menuItem = await MenuItem.findById(line.item_id);
      if (!menuItem || !menuItem.isGlobalActive) {
        return res.status(400).json({ success: false, message: `Item not available: ${line.item_id}` });
      }
      if (menuItem.disabledInFranchises.map(String).includes(franchise._id.toString())) {
        return res.status(400).json({ success: false, message: `Item disabled at this outlet: ${menuItem.name}` });
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

    // Determine tax type
    const taxType = determineTaxType(franchise.state, customer_state || franchise.state);

    // Calculate taxes
    const { subTotal, cgst, sgst, igst, totalTax, grossTotal } = calculateOrderTax(orderItems, taxType);

    // Loyalty point redemption
    let discountAmount = 0;
    let pointsRedeemed = 0;
    if (points_to_redeem && points_to_redeem > 0) {
      const maxRedeemable = Math.min(points_to_redeem, customer.total_points);
      discountAmount = calculatePointsValue(maxRedeemable);
      pointsRedeemed = maxRedeemable;
    }

    // Coupon redemption
    let couponDiscount = 0;
    let couponCode = null;
    let couponId = null;
    if (req.body.coupon_code) {
      const Coupon = require('../models/Coupon');
      const coupon = await Coupon.findOne({ code: req.body.coupon_code.toUpperCase(), isActive: true });
      if (coupon) {
        const now = new Date();
        const expired = coupon.expiresAt && now > coupon.expiresAt;
        const maxed   = coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses;
        const minOk   = grossTotal >= (coupon.minOrderAmount || 0);
        if (!expired && !maxed && minOk) {
          couponDiscount = coupon.discountType === 'percentage'
            ? +(grossTotal * coupon.discountValue / 100).toFixed(2)
            : coupon.discountValue;
          if (coupon.maxDiscountAmount > 0) couponDiscount = Math.min(couponDiscount, coupon.maxDiscountAmount);
          couponCode = coupon.code;
          couponId   = coupon._id;
          await Coupon.findByIdAndUpdate(coupon._id, { $inc: { usedCount: 1 } });
        }
      }
    }

    const totalDiscount = discountAmount + couponDiscount;
    const finalAmount = Math.max(0, +(grossTotal - totalDiscount).toFixed(2));

    // Points earned on final paid amount
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
      discount_amount:  discountAmount,
      coupon_code:      couponCode,
      coupon_id:        couponId,
      coupon_discount:  couponDiscount,
      total_discount:   totalDiscount,
      points_redeemed:  pointsRedeemed,
      final_amount:     finalAmount,
      tax_type: taxType,
      payment_mode,
      payment_status: 'Paid',
      kitchen_status: 'Pending',
      token_number: tokenNumber,
      order_type,
      table_number: table_number || '',
      table_id: table_id || null,
      session_id: session_id || null,
      customer_mobile: customer.phone_no || '',
      waiter_name: req.user.name || req.user.username || '',
      created_by: req.user._id,
      points_earned: pointsEarned,
      visit_type: ['single','couple','family','friends'].includes(visit_type) ? visit_type : 'single',
      status_history: [{ status: 'Pending', updatedBy: req.user._id }],
    });

    // Update customer totals and points
    const balanceBefore = customer.total_points;
    customer.total_points = customer.total_points - pointsRedeemed + pointsEarned;
    customer.total_orders += 1;
    customer.total_spent += finalAmount;
    customer.last_visit = new Date();
    const favoriteItems = new Set(customer.favorite_items || []);
    orderItems.forEach((item) => favoriteItems.add(item.name));
    customer.favorite_items = [...favoriteItems].slice(0, 20);
    await customer.save();

    // Record loyalty transactions
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

    // Generate invoice
    franchise.invoiceCounter += 1;
    await franchise.save();
    const invoiceNo = `${franchise.franchiseCode}-INV-${String(franchise.invoiceCounter).padStart(3, '0')}`;

    const invoice = await Invoice.create({
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
      cgst,
      sgst,
      igst,
      total_tax: totalTax,
      discount_amount: discountAmount,
      final_amount: finalAmount,
      payment_mode,
      items: orderItems.map((i) => ({
        name: i.name,
        hsn_code: i.hsn_code,
        quantity: i.quantity,
        price: i.price,
        gst_rate: i.gst_rate,
        item_total: i.item_total,
      })),
      visit_type: order.visit_type,
    });

    // Emit to kitchen via Socket.io
    const io = req.app.get('io');
    const populatedOrder = await Order.findById(order._id)
      .populate('customer_id', 'name phone_no')
      .populate('franchise_id', 'name franchiseCode');
    io.to(`franchise:${franchise._id}`).emit('order:new', populatedOrder);
    io.to('admin').emit('order:new', populatedOrder);  // FIX: master admin live dashboard

    // SMS — Order placed notification (non-blocking)
    sendOrderPlaced(
      customer.phone_no,
      customer.name,
      order.order_number,
      order.token_number,
      franchise.name,
      finalAmount.toFixed(2)
    ).catch((e) => console.error('SMS sendOrderPlaced error:', e.message));

    res.status(201).json({
      success: true,
      order: populatedOrder,
      invoice,
      customer: { ...customer.toObject(), total_points: customer.total_points },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// @GET /api/orders  — List orders (franchise-scoped)
const getOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, date, search, includeArchived } = req.query;
    const filter = {};
    if (includeArchived !== 'true') filter.archivedAt = null;

    if (req.user.role !== 'master_admin') {
      filter.franchise_id = req.user.franchise_id._id || req.user.franchise_id;
    } else if (req.query.franchise_id) {
      filter.franchise_id = req.query.franchise_id;
    }

    if (status) filter.kitchen_status = status;
    if (search) filter.order_number = { $regex: search, $options: 'i' };

    if (date) {
      const d = new Date(date);
      const nextDay = new Date(d); nextDay.setDate(d.getDate() + 1);
      filter.createdAt = { $gte: d, $lt: nextDay };
    }

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

    res.json({ success: true, orders, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @GET /api/orders/:id
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer_id', 'name phone_no total_points')
      .populate('franchise_id', 'name franchiseCode state gstin address')
      .populate('created_by', 'name');

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Franchise isolation
    if (req.user.role !== 'master_admin') {
      const userFranchise = (req.user.franchise_id._id || req.user.franchise_id).toString();
      if (order.franchise_id._id.toString() !== userFranchise) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const invoice = await Invoice.findOne({ order_id: order._id }).select('_id invoice_no');

    res.json({ success: true, order, invoice });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @GET /api/orders/export.csv - Download franchise-scoped order report
const exportOrdersCsv = async (req, res) => {
  try {
    const { date, status, includeArchived } = req.query;
    const filter = {};
    if (includeArchived !== 'true') filter.archivedAt = null;

    if (req.user.role !== 'master_admin') {
      filter.franchise_id = req.user.franchise_id._id || req.user.franchise_id;
    } else if (req.query.franchise_id) {
      filter.franchise_id = req.query.franchise_id;
    }

    if (status) filter.kitchen_status = status;
    if (date) {
      const d = new Date(date);
      const nextDay = new Date(d);
      nextDay.setDate(d.getDate() + 1);
      filter.createdAt = { $gte: d, $lt: nextDay };
    }

    const orders = await Order.find(filter)
      .populate('customer_id', 'name phone_no')
      .populate('franchise_id', 'name franchiseCode')
      .sort({ createdAt: -1 })
      .limit(5000);

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

    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="orders-report.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @POST /api/orders/archive-old - Mark operational orders older than 30 days as archived
const archiveOldOrders = async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
    const result = await Order.updateMany(
      { createdAt: { $lt: cutoff }, archivedAt: null },
      { $set: { archivedAt: new Date() } }
    );
    res.json({ success: true, archived: result.modifiedCount || 0, cutoff });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @GET /api/orders/history
const getOrderHistory = async (req, res) => {
  try {
    const { mobile, orderId, date, customerId, days = 30 } = req.query;
    const filter = {};

    if (req.user.role !== 'master_admin') {
      filter.franchise_id = req.user.franchise_id._id || req.user.franchise_id;
    } else if (req.query.franchise_id) {
      filter.franchise_id = req.query.franchise_id;
    }

    if (orderId) {
      filter.$or = [
        { order_number: { $regex: orderId, $options: 'i' } },
        { _id: orderId.match(/^[0-9a-fA-F]{24}$/) ? orderId : null },
      ].filter((value) => value);
    }

    if (customerId) {
      filter.customer_id = customerId;
    }

    if (mobile) {
      const phone = String(mobile).replace(/\D/g, '').slice(-10);
      if (!phone) return res.status(400).json({ success: false, message: 'Valid mobile number required' });
      const customer = await Customer.findOne({ phone_no: { $regex: `${phone}$` } }).select('_id');
      if (!customer) {
        return res.json({
          success: true,
          orders: [],
          summary: { totalVisits: 0, totalSpent: 0, averageOrderValue: 0 },
          customer: null,
        });
      }
      filter.customer_id = customer._id;
    }

    if (date) {
      const start = new Date(date);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      filter.createdAt = { $gte: start, $lt: end };
    } else if ((mobile || customerId) && !orderId) {
      const cutoff = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
      filter.createdAt = { $gte: cutoff };
    }

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
        description: `${formatCurrency(order.final_amount)} · ${order.payment_mode} · ${order.kitchen_status}`,
      })),
    };

    res.json({
      success: true,
      orders: hydratedOrders,
      summary,
      customer: hydratedOrders[0]?.customer_id || null,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { createOrder, getOrders, getOrderHistory, getOrderById, exportOrdersCsv, archiveOldOrders };
