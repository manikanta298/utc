const express  = require('express');
const router   = express.Router();
const MenuItem     = require('../models/MenuItem');
const Franchise    = require('../models/Franchise');
const Customer     = require('../models/Customer');
const Order        = require('../models/Order');
const OrderSession = require('../models/OrderSession');
const Table        = require('../models/Table');
const FranchisePayment = require('../models/FranchisePayment');
const { generateToken, generateSessionRef } = require('../utils/tokenGenerator');

// GET /api/public/menu/:franchiseId
router.get('/menu/:franchiseId', async (req, res) => {
  try {
    const franchiseId = req.params.franchiseId?.trim().replace(/\s+/g, '');
    if (!franchiseId || !/^[a-f\d]{24}$/i.test(franchiseId))
      return res.status(400).json({ success: false, message: 'Invalid franchise ID' });
    const franchise = await Franchise.findById(franchiseId).select('name logo isActive');
    if (!franchise || !franchise.isActive)
      return res.status(404).json({ success: false, message: 'Franchise not found or inactive' });
    let items = await MenuItem.find({ isGlobalActive: true }).sort({ category: 1, sortOrder: 1, name: 1 });
    items = items.filter((item) => !item.disabledInFranchises.map(String).includes(franchiseId));
    res.json({ success: true, items, franchise, franchiseName: franchise.name });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/public/customer/:mobile — unauthenticated customer lookup
router.get('/customer/:mobile', async (req, res) => {
  try {
    const phone    = req.params.mobile.replace(/\D/g, '').slice(-10);
    const customer = await Customer.findOne({ phone_no: { $regex: `${phone}$` } })
      .select('name phone_no email total_points total_orders total_spent last_visit')
      .lean();
    if (!customer) return res.json({ success: true, exists: false, isNew: true, customer: null });
    res.json({ success: true, exists: true, isNew: false, customer });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/public/order — QR self-ordering full flow
router.post('/order', async (req, res) => {
  try {
    const {
      franchiseId, tableNumber, order_type = 'dine_in',
      customer_phone, customer_name, items, payment_mode = 'Cash', total_amount,
    } = req.body;

    if (!franchiseId) return res.status(400).json({ success: false, message: 'franchiseId required' });
    if (!customer_phone || customer_phone.trim().length < 10)
      return res.status(400).json({ success: false, message: 'Valid mobile number required' });
    if (!items || items.length === 0)
      return res.status(400).json({ success: false, message: 'No items in order' });

    const franchise = await Franchise.findById(franchiseId);
    if (!franchise) return res.status(404).json({ success: false, message: 'Franchise not found' });

    const mobile = customer_phone.trim();
    let customer = await Customer.findOne({ phone_no: mobile });
    if (!customer) {
      customer = await Customer.create({
        phone_no: mobile,
        name: customer_name?.trim() || `Guest-${mobile.slice(-4)}`,
        first_franchise: franchiseId,
      });
    } else if (customer_name?.trim() && customer.name.startsWith('Guest-')) {
      customer.name = customer_name.trim();
      await customer.save();
    }

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    let session = await OrderSession.findOne({
      franchiseId, customerMobile: mobile,
      status: { $in: ['open', 'bill_pending'] },
      openedAt: { $gte: todayStart },
    });

    const isParcel = order_type === 'parcel';
    if (!session) {
      let retries = 3;
      while (retries-- > 0) {
        try {
          const tokenNumber = await generateToken(franchiseId);
          const sessionRef  = generateSessionRef(franchise.franchiseCode || 'UTC', tokenNumber);
          session = await OrderSession.create({
            tokenNumber, sessionRef, franchiseId,
            tableNumber: isParcel ? 'Parcel' : (tableNumber || 'Counter'),
            customerMobile: mobile, customerId: customer._id,
            customerName: customer.name, orderType: order_type,
          });
          break; // success
        } catch (e) {
          if (e.code === 11000 && retries > 0) continue; // retry with new token
          throw e;
        }
      }
    }

    const builtItems = items.map((i) => ({
      item_id:    i.item_id || i._id,
      name:       i.name,
      price:      Number(i.price),
      gst_rate:   Number(i.gst_rate || 5),
      hsn_code:   i.hsn_code || '',
      quantity:   Number(i.quantity || i.qty || 1),
      item_total: +(Number(i.price) * Number(i.quantity || i.qty || 1)).toFixed(2),
    }));

    const subTotal  = builtItems.reduce((s, i) => s + i.item_total, 0);
    const taxAmt    = +(subTotal * 0.05).toFixed(2);
    const total     = total_amount || +(subTotal + taxAmt).toFixed(2);
    const isAddition = session.subOrders.length > 0;

    // FIXED: use franchise_id (not franchiseId) to match Order model
    const order = await Order.create({
      order_number:    `ORD-${Date.now()}`,
      franchise_id:    franchiseId,
      customer_id:     customer._id,
      customer_mobile: mobile,
      items:           builtItems,
      sub_total:       subTotal,
      total_tax:       taxAmt,
      cgst_amount:     taxAmt / 2,
      sgst_amount:     taxAmt / 2,
      gross_total:     total,
      final_amount:    total,
      payment_mode:    ['Cash', 'UPI', 'Card', 'Net Banking'].includes(payment_mode) ? payment_mode : 'Cash',
      payment_status:  'Pending',
      kitchen_status:  'Pending',
      tax_type:        'CGST_SGST',
      token_number:    Number((session.tokenNumber || '').replace('TOKEN-', '')) || null,
      order_type,
      table_number:    session.tableNumber,
      session_id:      session._id,
    });

    session.subOrders.push({ orderedAt: new Date(), isAddition, destination: 'kitchen', order_id: order._id });
    await session.save();

    // ── Fix: update table status to occupied when order placed via QR ──
    if (tableNumber && order_type !== 'parcel') {
      try {
        const updatedTable = await Table.findOneAndUpdate(
          { franchiseId, tableNumber },
          { status: 'occupied', currentSessionId: session._id },
          { new: true }
        );
        if (updatedTable && io) {
          io.to(`franchise:${franchiseId}`).emit('table:statusUpdated', {
            tableId: updatedTable._id, status: 'occupied', tokenNumber: session.tokenNumber,
          });
        }
      } catch (e) { console.warn('Table status update failed:', e.message); }
    }

    const io = req.app.get('io');
    if (io) {
      const payload = {
        ...order.toObject(),
        sessionId:   session._id,
        tokenNumber: session.tokenNumber,
        tableNumber: session.tableNumber,
        orderType:   order_type,
        isAddition,
        customer_id: { name: customer.name, phone_no: mobile },
      };
      io.to(`franchise:${franchiseId}`).emit('order:new',    payload);
      io.to(`franchise:${franchiseId}`).emit('order:placed', payload);
      io.to(`pos:${franchiseId}`).emit('order:new',          payload);
      io.to('admin').emit('order:new', payload);   // FIX: master admin live dashboard
    }

    res.status(201).json({
      success:      true,
      order_number: order.order_number,
      token_number: session.tokenNumber,
      session_id:   session._id,
      customer:     { name: customer.name, phone: mobile },
    });
  } catch (err) {
    console.error('Public order error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/public/session/start
router.post('/session/start', async (req, res) => {
  try {
    const { franchiseId, mobile, tableNumber, orderType = 'dine_in', customerName } = req.body;
    if (!franchiseId) return res.status(400).json({ success: false, message: 'franchiseId required' });
    if (!mobile || mobile.trim().length < 10)
      return res.status(400).json({ success: false, message: 'Valid mobile number required' });

    const franchise = await Franchise.findById(franchiseId);
    if (!franchise) return res.status(404).json({ success: false, message: 'Franchise not found' });

    const phone = mobile.trim();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const existing = await OrderSession.findOne({
      franchiseId, customerMobile: phone,
      status: { $in: ['open', 'bill_pending'] },
      openedAt: { $gte: todayStart },
    }).populate('customerId', 'name phone_no total_points total_orders');

    if (existing) return res.json({ success: true, session: existing, isResumed: true, customer: existing.customerId });

    let customer = await Customer.findOne({ phone_no: phone });
    const isNew  = !customer;
    if (!customer) {
      customer = await Customer.create({
        phone_no: phone,
        name: customerName?.trim() || `Guest-${phone.slice(-4)}`,
        first_franchise: franchiseId,
      });
    }

    let session;
    let retries2 = 3;
    while (retries2-- > 0) {
      try {
        const tokenNumber = await generateToken(franchiseId);
        const sessionRef  = generateSessionRef(franchise.franchiseCode || 'UTC', tokenNumber);
        session = await OrderSession.create({
          tokenNumber, sessionRef, franchiseId,
          tableNumber: tableNumber || 'Parcel',
          customerMobile: phone, customerId: customer._id,
          customerName: customer.name, orderType,
        });
        break;
      } catch (e) {
        if (e.code === 11000 && retries2 > 0) continue;
        throw e;
      }
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`franchise:${franchiseId}`).emit('session:started', {
        tokenNumber: session.tokenNumber, tableNumber: tableNumber || 'Parcel',
        customerName: customer.name, sessionId: session._id,
      });
    }
    return res.status(201).json({ success: true, session, isResumed: false, isNew, customer });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/public/coupon/validate — validate coupon for customer (no auth)
router.post('/coupon/validate', async (req, res) => {
  try {
    const Coupon = require('../models/Coupon');
    const { code, orderAmount, franchiseId } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Coupon code required' });

    const coupon = await Coupon.findOne({ code: code.toUpperCase().trim(), isActive: true });
    if (!coupon) return res.status(404).json({ success: false, message: 'Invalid or expired coupon code' });

    const now = new Date();
    if (coupon.expiresAt && coupon.expiresAt < now)
      return res.status(400).json({ success: false, message: 'This coupon has expired' });
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses)
      return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
    if (coupon.minOrderAmount > 0 && orderAmount < coupon.minOrderAmount)
      return res.status(400).json({ success: false, message: `Minimum order Rs.${coupon.minOrderAmount} required` });
    if (coupon.applicableFranchises.length > 0 && franchiseId &&
        !coupon.applicableFranchises.map(String).includes(String(franchiseId)))
      return res.status(400).json({ success: false, message: 'Coupon not valid for this outlet' });

    let discountAmount = coupon.discountType === 'percentage'
      ? +(orderAmount * coupon.discountValue / 100).toFixed(2)
      : Math.min(coupon.discountValue, orderAmount);
    if (coupon.maxDiscountAmount > 0) discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);

    res.json({ success: true, discountAmount, coupon: { code: coupon.code, description: coupon.description, discountType: coupon.discountType, discountValue: coupon.discountValue } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/public/upi-qr/:franchiseId — Generate UPI payment QR for customer (no auth)
router.get('/upi-qr/:franchiseId', async (req, res) => {
  try {
    const franchiseId = req.params.franchiseId?.trim().replace(/\s+/g, '');
    const { amount, sessionId, tokenNumber, mobile } = req.query;

    const config = await FranchisePayment.findOne({ franchiseId }).populate('franchiseId', 'name');
    if (!config || !config.upiId)
      return res.json({ success: false, configured: false, message: 'UPI not configured' });

    const merchantName = encodeURIComponent(config.franchiseId?.name || 'UTC Cafe');
    const expiresAt    = Date.now() + 10 * 60 * 1000; // 10 minutes from now
    const noteParts    = [`Token:${tokenNumber || ''}`, mobile ? `Mob:${mobile}` : '', `Exp:${expiresAt}`].filter(Boolean);
    const note         = encodeURIComponent(noteParts.join('|'));
    const upiLink      = `upi://pay?pa=${config.upiId}&pn=${merchantName}&am=${amount || ''}&cu=INR&tn=${note}`;

    let qr = upiLink;
    try {
      const QRCode = require('qrcode');
      qr = await QRCode.toDataURL(upiLink, { width: 300, margin: 2 });
    } catch { /* fallback to raw link */ }

    res.json({ success: true, qr, upiId: config.upiId, amount: amount || '', upiLink });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
