const Order = require('../models/Order');
const { sendOrderAccepted, sendOrderPreparing, sendOrderReady } = require('../utils/sms');
const { createOrderNotification } = require('../services/notificationService');

const STATUS_FLOW = ['Pending', 'Accepted', 'Preparing', 'Ready', 'Delivered', 'Completed'];
const TERMINAL_STATUSES = ['Cancelled'];
const STATUS_ALIASES = {
  pending: 'Pending',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  canceled: 'Cancelled',
};
const NOTIFICATION_MESSAGES = {
  Accepted:  'Your order has been accepted by the kitchen.',
  Preparing: 'Your order is being prepared.',
  Ready:     'Your order is ready! Please collect it.',
  Delivered: 'Your order has been delivered. Thank you!',
  Completed: 'Order completed.',
};

const getFranchiseId = (req) =>
  (req.user.franchise_id?._id || req.user.franchise_id)?.toString();

const normaliseKitchenStatus = (status) =>
  STATUS_ALIASES[String(status || '').trim().toLowerCase()] || status;

// @GET /api/kitchen/orders
const getKitchenOrders = async (req, res) => {
  try {
    const franchiseId = getFranchiseId(req);
    const { type, payment } = req.query;
    const filter = {
      franchise_id: franchiseId,
      kitchen_status: { $in: ['Pending', 'Accepted', 'Preparing', 'Ready'] },
    };
    if (type === 'parcel')  filter.order_type = 'parcel';
    if (type === 'dine_in') filter.order_type = { $in: ['dine_in', 'counter'] };
    if (payment === 'paid')    filter.payment_status = 'Paid';
    if (payment === 'pending') filter.payment_status = 'Pending';

    const orders = await Order.find(filter)
      .populate('customer_id', 'name phone_no')
      .populate('created_by', 'name username')
      .sort({ createdAt: 1 })
      .lean();

    const normalised = orders.map((o) => ({
      ...o,
      waiter_name:     o.waiter_name || o.created_by?.name || o.created_by?.username || '',
      customer_mobile: o.customer_mobile || o.customer_id?.phone_no || '',
    }));
    res.json({ success: true, orders: normalised });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// @PUT /api/kitchen/orders/:id/status
const updateKitchenStatus = async (req, res) => {
  try {
    const status = normaliseKitchenStatus(req.body.status);
    const order = await Order.findById(req.params.id)
      .populate('customer_id', 'name phone_no')
      .populate('franchise_id', 'name franchiseCode');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const userFranchise = getFranchiseId(req);
    if (order.franchise_id._id.toString() !== userFranchise)
      return res.status(403).json({ success: false, message: 'Access denied' });
    if (!STATUS_FLOW.includes(status) && !TERMINAL_STATUSES.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status' });

    const currentIdx = STATUS_FLOW.indexOf(order.kitchen_status);
    const newIdx     = STATUS_FLOW.indexOf(status);
    const alreadyUpdated = order.kitchen_status === status;
    if (!alreadyUpdated && TERMINAL_STATUSES.includes(order.kitchen_status))
      return res.status(400).json({ success: false, message: `Order is already ${order.kitchen_status}` });
    if (!alreadyUpdated && !TERMINAL_STATUSES.includes(status) && newIdx <= currentIdx)
      return res.status(400).json({ success: false, message: 'Cannot move status backward' });

    if (!alreadyUpdated) {
      order.kitchen_status = status;
      order.status_history.push({ status, updatedBy: req.user._id });
      await order.save();
    }

    const io  = req.app.get('io');
    const fid = order.franchise_id._id;
    const fidStr = fid.toString();
    const franchiseRoomName = `franchise:${fidStr}`;
    const posRoomName = `pos:${fidStr}`;
    const waiterRoomName = `waiter:${fidStr}`;
    const displayRoomName = `display:${fidStr}`;

    // debug: check how many sockets are in each room
    const franchiseRoom = io?.sockets.adapter.rooms.get(franchiseRoomName);
    const posRoom       = io?.sockets.adapter.rooms.get(posRoomName);
    const waiterRoom    = io?.sockets.adapter.rooms.get(waiterRoomName);
    console.log(`[kitchen] status=${status} orderId=${order._id} fid=${fidStr}`);
    console.log(`[kitchen] franchise:${fidStr} → ${franchiseRoom?.size ?? 0} sockets`);
    console.log(`[kitchen] pos:${fidStr} → ${posRoom?.size ?? 0} sockets`);
    console.log(`[kitchen] waiter:${fidStr} -> ${waiterRoom?.size ?? 0} sockets`);
    console.log(`[kitchen] emitting to ${franchiseRoomName}, ${posRoomName}, ${waiterRoomName}`);
    const payload = {
      orderId:    order._id, orderNumber: order.order_number,
      tokenNumber: order.token_number, tableNumber: order.table_number,
      orderType:   order.order_type, status,
      orderSource: order.order_source,
      customerName: order.customer_id?.name, customerPhone: order.customer_id?.phone_no,
      itemCount: order.items?.length || 0,
      finalAmount: order.final_amount,
      notificationMessage: NOTIFICATION_MESSAGES[status] || '',
      // voice announcement text for browser TTS
      voiceText: status === 'Ready'
        ? `Token number ${order.token_number}, Table ${order.table_number || 'counter'}, your order is ready.`
        : null,
      updatedAt: new Date(),
    };
    if (io) {
      // POS and waiter clients both join the franchise room; include direct role
      // rooms as a compatibility path while Socket.IO de-duplicates recipients.
      const franchiseBroadcast = io.to(franchiseRoomName).to(posRoomName).to(waiterRoomName);

      franchiseBroadcast.emit('order:statusUpdate', payload);
      franchiseBroadcast.emit('order:statusUpdated', payload);

      // Specific events for targeted notifications/audio.
      if (status === 'Accepted') {
        franchiseBroadcast.emit('order:accepted', payload);
      }
      if (status === 'Ready') {
        console.log(`[kitchen] emitting order:ready -> ${franchiseRoomName}, ${posRoomName}, ${waiterRoomName}`);
        franchiseBroadcast.emit('order:ready', payload);

        createOrderNotification({
          type: 'ready',
          franchiseId: fid,
          orderId: order._id,
          tokenNumber: order.token_number,
          tableNumber: order.table_number,
          customerName: order.customer_id?.name,
          orderType: order.order_type,
        }).catch((e) => console.error('Notification persistence error:', e.message));
      }
      if (status === 'Delivered') {
        io.to(displayRoomName).emit('token:announce', {
          tokenNumber: order.token_number,
          tableNumber: order.table_number,
          isParcel: order.order_type === 'parcel',
        });
      }
    }

    const customerPhone = order.customer_id?.phone_no;
    const customerName  = order.customer_id?.name || 'Customer';
    const franchiseName = order.franchise_id?.name || 'UTC Cafe';
    const tokenNumber   = order.token_number;
    if (customerPhone) {
      if (status === 'Accepted')  sendOrderAccepted(customerPhone, customerName, tokenNumber, franchiseName).catch(() => {});
      if (status === 'Preparing') sendOrderPreparing(customerPhone, customerName, tokenNumber).catch(() => {});
      if (status === 'Ready')     sendOrderReady(customerPhone, customerName, tokenNumber, franchiseName).catch(() => {});
    }

    res.json({ success: true, order, notification: NOTIFICATION_MESSAGES[status] || '', smsSent: !!customerPhone, alreadyUpdated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// @GET /api/kitchen/orders/history
const getKitchenHistory = async (req, res) => {
  try {
    const franchiseId = getFranchiseId(req);
    const startOfDay  = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const { type } = req.query;
    const filter = {
      franchise_id:   franchiseId,
      kitchen_status: { $in: ['Ready', 'Delivered'] },
      createdAt:      { $gte: startOfDay },
    };
    if (type === 'parcel')  filter.order_type = 'parcel';
    if (type === 'dine_in') filter.order_type = { $in: ['dine_in', 'counter'] };

    const orders = await Order.find(filter)
      .populate('customer_id', 'name phone_no')
      .populate('created_by', 'name username')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const normalised = orders.map((o) => ({
      ...o,
      waiter_name:     o.waiter_name || o.created_by?.name || '',
      customer_mobile: o.customer_mobile || o.customer_id?.phone_no || '',
    }));
    res.json({ success: true, orders: normalised });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// @GET /api/kitchen/stats
const getKitchenStats = async (req, res) => {
  try {
    const franchiseId = getFranchiseId(req);
    const startOfDay  = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const active_filter = { franchise_id: franchiseId, kitchen_status: { $in: ['Pending', 'Accepted', 'Preparing', 'Ready'] } };
    const [active, delivered, pending, paid, parcel, dineIn] = await Promise.all([
      Order.countDocuments({ ...active_filter, kitchen_status: { $in: ['Accepted', 'Preparing', 'Ready'] } }),
      Order.countDocuments({ franchise_id: franchiseId, kitchen_status: 'Delivered', createdAt: { $gte: startOfDay } }),
      Order.countDocuments({ franchise_id: franchiseId, kitchen_status: 'Pending' }),
      Order.countDocuments({ ...active_filter, payment_status: 'Paid' }),
      Order.countDocuments({ ...active_filter, order_type: 'parcel' }),
      Order.countDocuments({ ...active_filter, order_type: { $in: ['dine_in', 'counter'] } }),
    ]);
    res.json({ success: true, stats: { active, delivered, pending, paid, parcel, dineIn } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// PATCH /kitchen/orders/:id/accept-delivery
// Waiter or POS marks a ready order as collected/delivered
const acceptDelivery = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('franchise_id', '_id');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.kitchen_status !== 'Ready') {
      return res.status(400).json({ success: false, message: `Order is ${order.kitchen_status}, not Ready` });
    }

    const prevStatus = order.kitchen_status;
    order.kitchen_status  = 'Delivered';
    order.accepted_by     = req.user._id;
    order.accepted_by_name = req.user.name || req.user.username || '';
    order.accepted_at     = new Date();
    order.status_history  = order.status_history || [];
    order.status_history.push({ status: 'Delivered', updatedBy: req.user._id, updatedAt: new Date() });
    await order.save();

    const fid = order.franchise_id?._id || order.franchise_id;
    const io  = req.app.get('io');
    const payload = {
      orderId:        order._id,
      orderNumber:    order.order_number,
      tokenNumber:    order.token_number,
      tableNumber:    order.table_number,
      orderType:      order.order_type,
      status:         'Delivered',
      prevStatus,
      acceptedBy:     order.accepted_by_name,
      acceptedById:   req.user._id,
      acceptedAt:     order.accepted_at,
    };
    if (io) {
      // notify kitchen, pos, waiter that order was picked up
      io.to(`franchise:${fid}`).emit('order:statusUpdate', payload);
      io.to(`franchise:${fid}`).emit('order:collected', payload);
      io.to(`pos:${fid}`).emit('order:collected', payload);
    }

    res.json({ success: true, order, acceptedBy: order.accepted_by_name });
  } catch (err) {
    console.error('[acceptDelivery]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getKitchenOrders, updateKitchenStatus, getKitchenHistory, getKitchenStats, acceptDelivery };
