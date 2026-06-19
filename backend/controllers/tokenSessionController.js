const PDFDocument = require('pdfkit');
const TokenSession = require('../models/TokenSession');
const Invoice = require('../models/Invoice');
const Order = require('../models/Order');

const getStartOfDay = (date = new Date()) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
};

const getFranchiseId = (req) => req.user.franchise_id?._id || req.user.franchise_id;
const formatCurrency = (value) => `Rs. ${Number(value || 0).toFixed(2)}`;

const assertSessionAccess = (req, session) => {
  if (req.user.role === 'master_admin') return true;
  const userFranchise = getFranchiseId(req)?.toString();
  return session.franchise_id?._id
    ? session.franchise_id._id.toString() === userFranchise
    : session.franchise_id.toString() === userFranchise;
};

const serializeSession = (session) => {
  const source = session.toObject ? session.toObject() : session;
  const outstandingAmount = +(Number(source.total_amount || 0) - Number(source.amount_paid || 0)).toFixed(2);

  return {
    ...source,
    outstanding_amount: Math.max(0, outstandingAmount),
    order_count: source.order_ids?.length || 0,
  };
};

const buildSessionSummary = async (sessionId) => {
  const session = await TokenSession.findById(sessionId)
    .populate('customer_id', 'name phone_no total_points city')
    .populate('franchise_id', 'name franchiseCode address gstin')
    .populate({
      path: 'order_ids',
      populate: { path: 'customer_id', select: 'name phone_no' },
      options: { sort: { createdAt: 1 } },
    });

  if (!session) return null;

  const invoices = await Invoice.find({ session_id: session._id }).sort({ invoice_date: 1, createdAt: 1 });
  const mergedItemMap = new Map();
  const kitchenBreakdown = { Pending: 0, Accepted: 0, Preparing: 0, Ready: 0, Delivered: 0 };

  for (const order of session.order_ids || []) {
    kitchenBreakdown[order.kitchen_status] = (kitchenBreakdown[order.kitchen_status] || 0) + 1;
    for (const item of order.items || []) {
      const key = `${item.item_id || item.name}:${item.price}:${item.gst_rate}`;
      const existing = mergedItemMap.get(key) || {
        name: item.name,
        price: item.price,
        gst_rate: item.gst_rate,
        quantity: 0,
        item_total: 0,
      };
      existing.quantity += Number(item.quantity || 0);
      existing.item_total = +(Number(existing.item_total) + Number(item.item_total || 0)).toFixed(2);
      mergedItemMap.set(key, existing);
    }
  }

  const mergedItems = Array.from(mergedItemMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  const totalTax = session.order_ids.reduce((sum, order) => sum + Number(order.total_tax || 0), 0);
  const discountAmount = session.order_ids.reduce((sum, order) => sum + Number(order.discount_amount || 0), 0);
  const totalAmount = Number(session.total_amount || 0);
  const amountPaid = Number(session.amount_paid || 0);
  const outstandingAmount = Math.max(0, +(totalAmount - amountPaid).toFixed(2));

  return {
    session,
    invoices,
    mergedItems,
    kitchenBreakdown,
    totals: {
      taxableAmount: +(totalAmount - totalTax + discountAmount).toFixed(2),
      totalTax: +totalTax.toFixed(2),
      discountAmount: +discountAmount.toFixed(2),
      totalAmount: +totalAmount.toFixed(2),
      amountPaid: +amountPaid.toFixed(2),
      outstandingAmount,
    },
  };
};

const renderSessionReceiptHtml = (summary) => {
  const { session, mergedItems, totals } = summary;
  const rows = mergedItems.map((item) => `
    <tr>
      <td>${item.name || ''}</td>
      <td>${item.quantity || 0}</td>
      <td>${Number(item.price || 0).toFixed(2)}</td>
      <td>${Number(item.item_total || 0).toFixed(2)}</td>
    </tr>
  `).join('');

  return `<!doctype html>
    <html>
    <head>
      <title>${session.token_label} Bill</title>
      <style>
        body { font-family: Arial, sans-serif; color: #111; margin: 24px; }
        .receipt { max-width: 420px; margin: 0 auto; }
        h1, h2, p { margin: 0; text-align: center; }
        h1 { font-size: 20px; }
        h2 { font-size: 14px; margin-top: 4px; }
        .meta, .totals { margin-top: 14px; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
        th, td { border-bottom: 1px dashed #aaa; padding: 6px 2px; text-align: left; }
        td:nth-child(2), td:nth-child(3), td:nth-child(4), th:nth-child(2), th:nth-child(3), th:nth-child(4) { text-align: right; }
        .line { display: flex; justify-content: space-between; margin: 4px 0; }
        .final { font-size: 16px; font-weight: 700; border-top: 1px solid #111; padding-top: 8px; }
        @media print { button { display: none; } body { margin: 0; } }
      </style>
    </head>
    <body>
      <div class="receipt">
        <h1>${session.franchise_id?.name || 'UTC Cafe'}</h1>
        <p>${session.franchise_id?.address || ''}</p>
        <h2>Merged Session Bill</h2>
        <div class="meta">
          <div class="line"><span>Token</span><strong>${session.token_label}</strong></div>
          <div class="line"><span>Table</span><span>${session.table_number || 'Counter'}</span></div>
          <div class="line"><span>Date</span><span>${new Date(session.createdAt).toLocaleString('en-IN')}</span></div>
          <div class="line"><span>Customer</span><span>${session.customer_id?.name || ''}</span></div>
          <div class="line"><span>Mobile</span><span>${session.customer_id?.phone_no || ''}</span></div>
          <div class="line"><span>GSTIN</span><span>${session.franchise_id?.gstin || ''}</span></div>
          <div class="line"><span>Orders Merged</span><span>${session.order_ids?.length || 0}</span></div>
        </div>
        <table>
          <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="totals">
          <div class="line"><span>Taxable</span><span>${formatCurrency(totals.taxableAmount)}</span></div>
          <div class="line"><span>Total Tax</span><span>${formatCurrency(totals.totalTax)}</span></div>
          <div class="line"><span>Discount</span><span>${formatCurrency(totals.discountAmount)}</span></div>
          <div class="line"><span>Collected</span><span>${formatCurrency(totals.amountPaid)}</span></div>
          <div class="line"><span>Outstanding</span><span>${formatCurrency(totals.outstandingAmount)}</span></div>
          <div class="line final"><span>Total</span><span>${formatCurrency(totals.totalAmount)}</span></div>
        </div>
        <p style="margin-top:18px;font-size:12px;">Thank you. Please visit again.</p>
        <button onclick="window.print()" style="margin-top:16px;width:100%;padding:10px;">Print / Save PDF</button>
      </div>
    </body>
    </html>`;
};

const streamSessionPdf = (res, summary) => {
  const { session, mergedItems, totals } = summary;
  const doc = new PDFDocument({ size: 'A4', margin: 40 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${session.token_label || 'session-bill'}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text(session.franchise_id?.name || 'UTC Cafe', { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(10).text(session.franchise_id?.address || '', { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(12).text('Merged Session Bill', { align: 'center' });
  doc.moveDown();

  [
    ['Token', session.token_label],
    ['Table', session.table_number || 'Counter'],
    ['Date', new Date(session.createdAt).toLocaleString('en-IN')],
    ['Customer', session.customer_id?.name || ''],
    ['Mobile', session.customer_id?.phone_no || ''],
    ['Orders Merged', String(session.order_ids?.length || 0)],
  ].forEach(([label, value]) => {
    doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
    doc.font('Helvetica').text(value || '');
  });

  doc.moveDown();
  doc.font('Helvetica-Bold').text('Items');
  doc.moveDown(0.5);

  mergedItems.forEach((item) => {
    doc.font('Helvetica-Bold').text(item.name || '', { continued: true });
    doc.font('Helvetica').text(`  x${item.quantity || 0}`);
    doc.fontSize(10).fillColor('#555').text(`Rate ${formatCurrency(item.price)} · Total ${formatCurrency(item.item_total)}`);
    doc.fillColor('#000').fontSize(12).moveDown(0.4);
  });

  doc.moveDown();
  [
    ['Taxable', totals.taxableAmount],
    ['Total Tax', totals.totalTax],
    ['Discount', totals.discountAmount],
    ['Collected', totals.amountPaid],
    ['Outstanding', totals.outstandingAmount],
    ['Total', totals.totalAmount],
  ].forEach(([label, value]) => {
    doc.font(label === 'Total' ? 'Helvetica-Bold' : 'Helvetica').text(`${label}: ${formatCurrency(value)}`, { align: 'right' });
  });

  doc.moveDown();
  doc.fontSize(10).font('Helvetica').text('Thank you. Please visit again.', { align: 'center' });
  doc.end();
};

const buildSessionRealtimePayload = (session, extra = {}) => ({
  sessionId: session._id,
  tokenLabel: session.token_label,
  tokenNumber: session.token_number,
  tableNumber: session.table_number,
  status: session.status,
  paymentStatus: session.payment_status,
  totalAmount: session.total_amount,
  amountPaid: session.amount_paid,
  outstandingAmount: Math.max(0, +(Number(session.total_amount || 0) - Number(session.amount_paid || 0)).toFixed(2)),
  updatedAt: new Date(),
  ...extra,
});

const getActiveSession = async (req, res) => {
  try {
    const { customerId } = req.query;
    if (!customerId) {
      return res.status(400).json({ success: false, message: 'customerId required' });
    }

    const filter = {
      customer_id: customerId,
      token_date: getStartOfDay(),
      status: { $in: ['Open', 'Bill Pending'] },
    };

    if (req.user.role !== 'master_admin') {
      filter.franchise_id = getFranchiseId(req);
    } else if (req.query.franchiseId) {
      filter.franchise_id = req.query.franchiseId;
    }

    const session = await TokenSession.findOne(filter)
      .populate('customer_id', 'name phone_no')
      .populate('order_ids');

    res.json({ success: true, session: session ? serializeSession(session) : null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const listSessions = async (req, res) => {
  try {
    const { status, customerId, date, includeClosed } = req.query;
    const filter = {};

    filter.token_date = date ? getStartOfDay(new Date(date)) : getStartOfDay();
    if (status) {
      filter.status = status;
    } else if (includeClosed !== 'true') {
      filter.status = { $in: ['Open', 'Bill Pending'] };
    }
    if (customerId) filter.customer_id = customerId;

    if (req.user.role !== 'master_admin') {
      filter.franchise_id = getFranchiseId(req);
    } else if (req.query.franchiseId) {
      filter.franchise_id = req.query.franchiseId;
    }

    const sessions = await TokenSession.find(filter)
      .populate('customer_id', 'name phone_no city')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(200);

    res.json({ success: true, sessions: sessions.map(serializeSession) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getSessionById = async (req, res) => {
  try {
    const summary = await buildSessionSummary(req.params.id);
    if (!summary) return res.status(404).json({ success: false, message: 'Token session not found' });
    if (!assertSessionAccess(req, summary.session)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({
      success: true,
      session: serializeSession(summary.session),
      mergedItems: summary.mergedItems,
      invoices: summary.invoices,
      kitchenBreakdown: summary.kitchenBreakdown,
      totals: summary.totals,
      orders: summary.session.order_ids,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getReadyBoard = async (req, res) => {
  try {
    const filter = {
      token_date: getStartOfDay(),
      status: { $ne: 'Cancelled' },
    };

    if (req.user.role !== 'master_admin') {
      filter.franchise_id = getFranchiseId(req);
    } else if (req.query.franchiseId) {
      filter.franchise_id = req.query.franchiseId;
    }

    const sessions = await TokenSession.find(filter)
      .populate('customer_id', 'name phone_no')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(200);

    const sessionIds = sessions.map((session) => session._id);
    const orders = await Order.find({ session_id: { $in: sessionIds } })
      .select('session_id kitchen_status token_label token_number table_number createdAt items is_addition')
      .sort({ createdAt: 1 });

    const ordersBySession = new Map();
    for (const order of orders) {
      const key = order.session_id?.toString();
      const bucket = ordersBySession.get(key) || [];
      bucket.push(order);
      ordersBySession.set(key, bucket);
    }

    const boardItems = sessions.map((session) => {
      const linkedOrders = ordersBySession.get(session._id.toString()) || [];
      const readyCount = linkedOrders.filter((order) => order.kitchen_status === 'Ready').length;
      const activeCount = linkedOrders.filter((order) => ['Pending', 'Accepted', 'Preparing'].includes(order.kitchen_status)).length;
      const deliveredCount = linkedOrders.filter((order) => order.kitchen_status === 'Delivered').length;

      return {
        sessionId: session._id,
        tokenLabel: session.token_label,
        tokenNumber: session.token_number,
        tableNumber: session.table_number,
        customerName: session.customer_id?.name || 'Walk-in',
        status: session.status,
        paymentStatus: session.payment_status,
        totalAmount: Number(session.total_amount || 0),
        amountPaid: Number(session.amount_paid || 0),
        outstandingAmount: Math.max(0, +(Number(session.total_amount || 0) - Number(session.amount_paid || 0)).toFixed(2)),
        readyCount,
        activeCount,
        deliveredCount,
        orderCount: linkedOrders.length,
        updatedAt: session.updatedAt,
      };
    });

    res.json({
      success: true,
      readyNow: boardItems.filter((item) => item.readyCount > 0 && item.activeCount === 0 && item.deliveredCount === 0),
      inProgress: boardItems.filter((item) => item.activeCount > 0),
      delivered: boardItems.filter((item) => item.deliveredCount > 0).slice(0, 20),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const settleSession = async (req, res) => {
  try {
    const { amount_paid, payment_status = 'Fully Paid', payment_mode } = req.body;
    const session = await TokenSession.findById(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: 'Token session not found' });
    if (!assertSessionAccess(req, session)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const paidAmount = Number(amount_paid ?? session.total_amount);
    session.amount_paid = paidAmount;
    session.payment_status = payment_status;

    if (payment_status === 'Fully Paid' || paidAmount >= session.total_amount) {
      session.status = 'Closed';
      session.payment_status = 'Fully Paid';
      session.closed_at = new Date();
      session.closed_by = req.user._id;
    } else if (paidAmount > 0) {
      session.status = 'Bill Pending';
      session.payment_status = 'Partially Paid';
    } else {
      session.status = 'Bill Pending';
      session.payment_status = 'Pending';
    }

    await session.save();

    await Invoice.updateMany(
      { session_id: session._id },
      {
        $set: {
          payment_status: session.payment_status,
          ...(payment_mode ? { payment_mode } : {}),
        },
      }
    );
    await Order.updateMany({ session_id: session._id }, { $set: { payment_status: session.payment_status } });

    const io = req.app.get('io');
    const payload = buildSessionRealtimePayload(session);
    io.to(`franchise:${session.franchise_id}`).emit('token:updated', payload);
    io.to(`pos:${session.franchise_id}`).emit('token:updated', payload);
    io.to(`kitchen:${session.franchise_id}`).emit('token:updated', payload);
    io.to(`display:${session.franchise_id}`).emit('token:updated', payload);

    res.json({ success: true, session: serializeSession(session) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getSessionReceipt = async (req, res) => {
  try {
    const summary = await buildSessionSummary(req.params.id);
    if (!summary) return res.status(404).send('Token session not found');
    if (!assertSessionAccess(req, summary.session)) return res.status(403).send('Access denied');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderSessionReceiptHtml(summary));
  } catch (err) {
    res.status(500).send(err.message);
  }
};

const getSessionPdf = async (req, res) => {
  try {
    const summary = await buildSessionSummary(req.params.id);
    if (!summary) return res.status(404).json({ success: false, message: 'Token session not found' });
    if (!assertSessionAccess(req, summary.session)) return res.status(403).json({ success: false, message: 'Access denied' });

    streamSessionPdf(res, summary);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getActiveSession,
  listSessions,
  getSessionById,
  getReadyBoard,
  settleSession,
  getSessionReceipt,
  getSessionPdf,
};
