const { sendOrderPlaced } = require('../utils/sms');
const Order = require('../models/Order');
const {
  placeOrder,
  buildOrderListFilter,
  getOrdersPaginated,
  getOrderForUser,
  buildOrderCsv,
  exportOrdersCsvData,
  archiveOldOrders,
  buildOrderHistoryFilter,
  getOrderHistoryData,
  findCustomerByMobile,
} = require('../services/orderService');

const handleServiceError = (res, err) => {
  res.status(err.status || 500).json({ success: false, message: err.message });
};

const resolveFranchiseScope = (req) => ({
  isMaster: req.user.role === 'master_admin',
  requestingFranchiseId: req.user.franchise_id?._id || req.user.franchise_id,
});

// @POST /api/orders — Create new order (POS staff)
const createOrder = async (req, res) => {
  try {
    const {
      customer_id, items, payment_mode, points_to_redeem, customer_state,
      order_type = 'dine_in', table_number = '', table_id = null,
      session_id = null, visit_type = 'single', coupon_code,
    } = req.body;

    const { order, invoice, customer } = await placeOrder({
      franchiseId: req.user.franchise_id,
      customerId: customer_id,
      items,
      paymentMode: payment_mode,
      pointsToRedeem: points_to_redeem,
      customerState: customer_state,
      orderType: order_type,
      tableNumber: table_number,
      tableId: table_id,
      sessionId: session_id,
      visitType: visit_type,
      couponCode: coupon_code,
      createdBy: req.user._id,
      waiterName: req.user.name || req.user.username || '',
    });

    const populatedOrder = await Order.findById(order._id)
      .populate('customer_id', 'name phone_no')
      .populate('franchise_id', 'name franchiseCode');

    const io = req.app.get('io');
    io.to(`franchise:${order.franchise_id}`).emit('order:new', populatedOrder);
    io.to('admin').emit('order:new', populatedOrder); // master admin live dashboard

    sendOrderPlaced(
      customer.phone_no,
      customer.name,
      order.order_number,
      order.token_number,
      populatedOrder.franchise_id?.name || '',
      order.final_amount.toFixed(2)
    ).catch((e) => console.error('SMS sendOrderPlaced error:', e.message));

    res.status(201).json({
      success: true,
      order: populatedOrder,
      invoice,
      customer: { ...customer.toObject(), total_points: customer.total_points },
    });
  } catch (err) {
    console.error(err);
    handleServiceError(res, err);
  }
};

// @GET /api/orders — List orders (franchise-scoped)
const getOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, date, search, includeArchived, franchise_id } = req.query;
    const { isMaster, requestingFranchiseId } = resolveFranchiseScope(req);

    const filter = buildOrderListFilter({
      isMaster, requestingFranchiseId, queryFranchiseId: franchise_id,
      includeArchived, status, search, date,
    });

    const { orders, total } = await getOrdersPaginated(filter, { page: Number(page), limit: Number(limit) });
    res.json({ success: true, orders, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    handleServiceError(res, err);
  }
};

// @GET /api/orders/:id
const getOrderById = async (req, res) => {
  try {
    const { isMaster, requestingFranchiseId } = resolveFranchiseScope(req);
    const { order, invoice } = await getOrderForUser(req.params.id, { isMaster, requestingFranchiseId });
    res.json({ success: true, order, invoice });
  } catch (err) {
    handleServiceError(res, err);
  }
};

// @GET /api/orders/export.csv - Download franchise-scoped order report
const exportOrdersCsv = async (req, res) => {
  try {
    const { date, status, includeArchived, franchise_id } = req.query;
    const { isMaster, requestingFranchiseId } = resolveFranchiseScope(req);

    const filter = buildOrderListFilter({
      isMaster, requestingFranchiseId, queryFranchiseId: franchise_id,
      includeArchived, status, date,
    });

    const csv = await exportOrdersCsvData(filter);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="orders-report.csv"');
    res.send(csv);
  } catch (err) {
    handleServiceError(res, err);
  }
};

// @POST /api/orders/archive-old - Mark operational orders older than 30 days as archived
const archiveOldOrdersHandler = async (req, res) => {
  try {
    const { archived, cutoff } = await archiveOldOrders();
    res.json({ success: true, archived, cutoff });
  } catch (err) {
    handleServiceError(res, err);
  }
};

// @GET /api/orders/history
const getOrderHistory = async (req, res) => {
  try {
    const { mobile, orderId, date, customerId: queryCustomerId, days = 30, franchise_id } = req.query;
    const { isMaster, requestingFranchiseId } = resolveFranchiseScope(req);

    let resolvedCustomerId = queryCustomerId;
    if (mobile) {
      const customer = await findCustomerByMobile(mobile);
      if (!customer) {
        return res.json({
          success: true,
          orders: [],
          summary: { totalVisits: 0, totalSpent: 0, averageOrderValue: 0 },
          customer: null,
        });
      }
      resolvedCustomerId = customer._id;
    }

    const filter = buildOrderHistoryFilter({
      isMaster, requestingFranchiseId, queryFranchiseId: franchise_id,
      orderId, customerId: resolvedCustomerId, date, days,
    });

    const { orders, summary, customer } = await getOrderHistoryData(filter);
    res.json({ success: true, orders, summary, customer });
  } catch (err) {
    handleServiceError(res, err);
  }
};

module.exports = {
  createOrder,
  getOrders,
  getOrderHistory,
  getOrderById,
  exportOrdersCsv,
  archiveOldOrders: archiveOldOrdersHandler,
};
