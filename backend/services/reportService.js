const Order = require('../models/Order');
const OrderSession = require('../models/OrderSession');

const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Net Banking', 'Other'];

function normalizePaymentMethod(value = '') {
  const method = String(value || '').trim();
  if (!method) return 'Pending';
  const match = PAYMENT_METHODS.find((allowed) => allowed.toLowerCase() === method.toLowerCase());
  return match || 'Other';
}

/**
 * Builds the OrderSession query filter for the payment report, given an
 * already-resolved RBAC scope (controller decides isMaster / franchiseId —
 * this function has no knowledge of req/res or roles, just data shaping).
 */
function buildPaymentReportFilter({ isMaster, franchiseId, requestingFranchiseId, startDate, endDate }) {
  const filter = {};

  if (!isMaster) {
    filter.franchiseId = requestingFranchiseId;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    filter.openedAt = { $gte: start, $lte: end };
  } else if (franchiseId) {
    filter.franchiseId = franchiseId;
  }

  if (isMaster && (startDate || endDate)) {
    filter.openedAt = {};
    if (startDate) filter.openedAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.openedAt.$lte = end;
    }
  }

  return filter;
}

async function getPaymentReportRows(filter) {
  const sessions = await OrderSession.find(filter)
    .populate('franchiseId', 'name franchiseCode')
    .populate('customerId', 'name phone_no')
    .sort({ openedAt: -1 })
    .limit(5000)
    .lean();

  const rows = [];
  for (const s of sessions) {
    if (!s.payments || s.payments.length === 0) {
      rows.push({
        sessionRef: s.sessionRef || s._id,
        franchise: s.franchiseId?.name || '',
        customerName: s.customerId?.name || s.customerName || '',
        mobile: s.customerMobile || '',
        paymentType: 'Pending',
        originalAmount: s.totalAmount || 0,
        discount: s.discountAmount || 0,
        finalAmount: s.totalAmount || 0,
        paymentStatus: s.paymentStatus || 'unpaid',
        tokenNumber: s.tokenNumber || '',
        date: s.openedAt,
      });
    } else {
      for (const p of s.payments) {
        rows.push({
          sessionRef: s.sessionRef || s._id,
          franchise: s.franchiseId?.name || '',
          customerName: s.customerId?.name || s.customerName || '',
          mobile: s.customerMobile || '',
          paymentType: normalizePaymentMethod(p.method),
          originalAmount: s.subtotal || s.totalAmount || 0,
          discount: s.discountAmount || 0,
          finalAmount: p.amount || 0,
          paymentStatus: s.paymentStatus || '',
          tokenNumber: s.tokenNumber || '',
          date: p.paidAt || s.openedAt,
        });
      }
    }
  }
  return rows;
}

/** Pure function — no DB, no HTTP. Easy to unit test in isolation. */
function filterAndSummarizePayments(rows, paymentMethod = 'all') {
  const normalizedFilterMethod = paymentMethod === 'all' ? 'all' : normalizePaymentMethod(paymentMethod);
  const filteredRows = normalizedFilterMethod === 'all'
    ? rows
    : rows.filter((row) => row.paymentType === normalizedFilterMethod);

  const summary = filteredRows.reduce((acc, r) => {
    acc.total += Number(r.finalAmount || 0);
    acc[r.paymentType] = (acc[r.paymentType] || 0) + r.finalAmount;
    return acc;
  }, { total: 0, Cash: 0, UPI: 0, Card: 0, 'Net Banking': 0, Other: 0, Pending: 0 });

  const reportLabel = normalizedFilterMethod === 'all' ? 'All Payments Report' : `${normalizedFilterMethod} Report`;

  return { filteredRows, summary, reportLabel, normalizedFilterMethod };
}

function buildSalesReportFilter({ isMaster, franchiseId, requestingFranchiseId, period }) {
  const filter = {};

  if (!isMaster) {
    filter.franchise_id = requestingFranchiseId;
  } else if (franchiseId) {
    filter.franchise_id = franchiseId;
  }

  const startDate = new Date();
  if (period === 'daily') startDate.setDate(startDate.getDate() - 30);
  else if (period === 'weekly') startDate.setDate(startDate.getDate() - 90);
  else if (period === 'monthly') startDate.setMonth(startDate.getMonth() - 12);

  filter.createdAt = { $gte: startDate };
  filter.archivedAt = null;
  return filter;
}

async function getSalesReportData(filter) {
  const orders = await Order.find(filter)
    .populate('franchise_id', 'name franchiseCode')
    .select('final_amount payment_mode createdAt franchise_id discount_amount total_tax')
    .lean();

  const grouped = {};
  for (const o of orders) {
    const key = o.createdAt.toISOString().split('T')[0];
    if (!grouped[key]) grouped[key] = { date: key, total: 0, orders: 0, cash: 0, upi: 0, card: 0 };
    grouped[key].total += o.final_amount;
    grouped[key].orders += 1;
    const mode = (o.payment_mode || '').toLowerCase();
    if (mode === 'cash') grouped[key].cash += o.final_amount;
    else if (mode === 'upi') grouped[key].upi += o.final_amount;
    else if (mode === 'card') grouped[key].card += o.final_amount;
  }

  const data = Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
  const totalRevenue = orders.reduce((s, o) => s + o.final_amount, 0);
  return { data, totalRevenue, totalOrders: orders.length };
}

module.exports = {
  PAYMENT_METHODS,
  normalizePaymentMethod,
  buildPaymentReportFilter,
  getPaymentReportRows,
  filterAndSummarizePayments,
  buildSalesReportFilter,
  getSalesReportData,
};
