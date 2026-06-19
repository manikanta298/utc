const express = require('express');
const PDFDocument = require('pdfkit');
const router = express.Router();
const Invoice = require('../models/Invoice');
const Order = require('../models/Order');
const { protect, authorise } = require('../middleware/auth');
const { enforceActiveFranchise } = require('../middleware/franchiseGuard');
const { logAudit } = require('../utils/auditHelper');

const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Net Banking', 'Other'];

const normalizePaymentMethod = (value = '') => {
  const method = String(value || '').trim();
  if (!method) return '';
  const match = PAYMENT_METHODS.find((allowed) => allowed.toLowerCase() === method.toLowerCase());
  return match || 'Other';
};

const csvEscape = (value) => {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

const formatCurrency = (value) => `Rs. ${Number(value || 0).toFixed(2)}`;

const assertInvoiceAccess = (req, invoice) => {
  if (req.user.role === 'master_admin') return true;
  const userFranchise = (req.user.franchise_id._id || req.user.franchise_id).toString();
  return invoice.franchise_id?._id
    ? invoice.franchise_id._id.toString() === userFranchise
    : invoice.franchise_id.toString() === userFranchise;
};

const buildInvoiceFilter = (req) => {
  const { franchiseId, month, year, phone, paymentMethod } = req.query;
  const filter = {};
  if (req.user.role !== 'master_admin') {
    filter.franchise_id = req.user.franchise_id._id || req.user.franchise_id;
  } else if (franchiseId) {
    filter.franchise_id = franchiseId;
  }
  if (phone) {
    filter.customer_phone = phone.trim();
  }
  if (paymentMethod && paymentMethod !== 'all') {
    const normalized = normalizePaymentMethod(paymentMethod);
    filter.payment_mode = normalized === 'Other'
      ? { $nin: ['Cash', 'UPI', 'Card', 'Net Banking', '', null] }
      : normalized;
  }
  if (month && year) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    filter.invoice_date = { $gte: start, $lt: end };
  }
  return filter;
};

const sendInvoicesPdf = (res, invoices) => {
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="gst-invoices.pdf"');
  doc.pipe(res);

  doc.fontSize(18).text('UTC Cafe GST Invoice Report', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Generated: ${new Date().toLocaleString('en-IN')}`, { align: 'center' });
  doc.moveDown();

  const totals = invoices.reduce((acc, invoice) => {
    acc.taxable += Number(invoice.taxable_amount || 0);
    acc.tax += Number(invoice.total_tax || 0);
    acc.discount += Number(invoice.discount_amount || 0);
    acc.final += Number(invoice.final_amount || 0);
    return acc;
  }, { taxable: 0, tax: 0, discount: 0, final: 0 });

  doc.font('Helvetica-Bold').fontSize(10).text(
    `Taxable: ${formatCurrency(totals.taxable)}   Tax: ${formatCurrency(totals.tax)}   Discount: ${formatCurrency(totals.discount)}   Final: ${formatCurrency(totals.final)}`
  );
  doc.moveDown();

  invoices.slice(0, 500).forEach((invoice) => {
    doc.font('Helvetica-Bold').fontSize(9).text(`${invoice.invoice_no} | ${invoice.franchise_id?.name || invoice.franchise_name || ''} | ${invoice.payment_mode || ''}`);
    doc.font('Helvetica').fontSize(8).text(`${invoice.customer_name || '-'} ${invoice.customer_phone || ''} | Tax ${formatCurrency(invoice.total_tax)} | Final ${formatCurrency(invoice.final_amount)} | ${invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleString('en-IN') : ''}`);
    doc.moveDown(0.35);
  });

  if (invoices.length > 500) doc.text(`Showing first 500 of ${invoices.length} invoices. Export CSV/Excel for full data.`);
  doc.end();
};

const renderReceiptHtml = (invoice) => {
  const rows = (invoice.items || []).map((item) => `
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
      <title>${invoice.invoice_no}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #111; margin: 24px; }
        .receipt { max-width: 380px; margin: 0 auto; }
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
        <h1>${invoice.franchise_name || invoice.franchise_id?.name || 'UTC Cafe'}</h1>
        <p>${invoice.franchise_address || invoice.franchise_id?.address || ''}</p>
        <h2>Tax Invoice</h2>
        <div class="meta">
          <div class="line"><span>Invoice</span><strong>${invoice.invoice_no}</strong></div>
          <div class="line"><span>Date</span><span>${new Date(invoice.invoice_date || invoice.createdAt).toLocaleString('en-IN')}</span></div>
          <div class="line"><span>Customer</span><span>${invoice.customer_name || ''}</span></div>
          <div class="line"><span>Mobile</span><span>${invoice.customer_phone || ''}</span></div>
          <div class="line"><span>GSTIN</span><span>${invoice.franchise_gstin || invoice.franchise_id?.gstin || ''}</span></div>
        </div>
        <table>
          <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="totals">
          <div class="line"><span>Taxable</span><span>${formatCurrency(invoice.taxable_amount)}</span></div>
          <div class="line"><span>CGST</span><span>${formatCurrency(invoice.cgst)}</span></div>
          <div class="line"><span>SGST</span><span>${formatCurrency(invoice.sgst)}</span></div>
          <div class="line"><span>IGST</span><span>${formatCurrency(invoice.igst)}</span></div>
          <div class="line"><span>Discount</span><span>${formatCurrency(invoice.discount_amount)}</span></div>
          <div class="line final"><span>Total</span><span>${formatCurrency(invoice.final_amount)}</span></div>
        </div>
        <p style="margin-top:18px;font-size:12px;">Thank you. Please visit again.</p>
        <button onclick="window.print()" style="margin-top:16px;width:100%;padding:10px;">Print / Save PDF</button>
      </div>
    </body>
    </html>`;
};

const streamInvoicePdf = (res, invoice) => {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_no}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text(invoice.franchise_name || invoice.franchise_id?.name || 'UTC Cafe', { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(10).text(invoice.franchise_address || invoice.franchise_id?.address || '', { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(12).text('Tax Invoice', { align: 'center' });
  doc.moveDown();

  const metaRows = [
    ['Invoice', invoice.invoice_no],
    ['Date', new Date(invoice.invoice_date || invoice.createdAt).toLocaleString('en-IN')],
    ['Customer', invoice.customer_name || ''],
    ['Mobile', invoice.customer_phone || ''],
    ['GSTIN', invoice.franchise_gstin || invoice.franchise_id?.gstin || ''],
  ];

  metaRows.forEach(([label, value]) => {
    doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
    doc.font('Helvetica').text(value || '');
  });

  doc.moveDown();
  doc.font('Helvetica-Bold').text('Items');
  doc.moveDown(0.5);

  (invoice.items || []).forEach((item) => {
    doc.font('Helvetica-Bold').text(item.name || '', { continued: true });
    doc.font('Helvetica').text(`  x${item.quantity || 0}`);
    doc.fontSize(10).fillColor('#555').text(`Rate ${formatCurrency(item.price)} · Total ${formatCurrency(item.item_total)}`);
    doc.fillColor('#000').fontSize(12).moveDown(0.4);
  });

  doc.moveDown();
  [
    ['Taxable', invoice.taxable_amount],
    ['CGST', invoice.cgst],
    ['SGST', invoice.sgst],
    ['IGST', invoice.igst],
    ['Discount', invoice.discount_amount],
    ['Total', invoice.final_amount],
  ].forEach(([label, value]) => {
    doc.font(label === 'Total' ? 'Helvetica-Bold' : 'Helvetica').text(`${label}: ${formatCurrency(value)}`, { align: 'right' });
  });

  doc.moveDown();
  doc.fontSize(10).font('Helvetica').text('Thank you. Please visit again.', { align: 'center' });
  doc.end();
};

router.get('/', protect, enforceActiveFranchise, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const filter = buildInvoiceFilter(req);
    const skip = (page - 1) * limit;
    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .populate('franchise_id', 'name franchiseCode')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Invoice.countDocuments(filter),
    ]);
    res.json({ success: true, invoices, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/search', protect, enforceActiveFranchise, authorise('pos_staff', 'shift_operator', 'manager', 'franchise_owner'), async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number required' });

    const invoices = await Invoice.find(buildInvoiceFilter(req))
      .populate('franchise_id', 'name franchiseCode')
      .sort({ invoice_date: -1, createdAt: -1 })
      .limit(100);

    res.json({ success: true, invoices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/export.csv', protect, enforceActiveFranchise, authorise('master_admin'), async (req, res) => {
  try {
    const { format = 'csv' } = req.query;
    const invoices = await Invoice.find(buildInvoiceFilter(req))
      .populate('franchise_id', 'name franchiseCode')
      .sort({ createdAt: -1 })
      .limit(5000);

    const header = ['Invoice No', 'Date', 'Franchise', 'Customer', 'Phone', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total Tax', 'Discount', 'Final', 'Payment'];
    const rows = invoices.map((invoice) => [
      invoice.invoice_no,
      invoice.invoice_date?.toISOString(),
      `${invoice.franchise_id?.franchiseCode || ''} ${invoice.franchise_id?.name || ''}`.trim(),
      invoice.customer_name,
      invoice.customer_phone,
      invoice.taxable_amount,
      invoice.cgst,
      invoice.sgst,
      invoice.igst,
      invoice.total_tax,
      invoice.discount_amount,
      invoice.final_amount,
      invoice.payment_mode,
    ]);

    if (format === 'pdf') return sendInvoicesPdf(res, invoices);

    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
    res.setHeader('Content-Type', format === 'excel' ? 'application/vnd.ms-excel; charset=utf-8' : 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="gst-invoices.${format === 'excel' ? 'xls' : 'csv'}"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/:id/financials', protect, enforceActiveFranchise, authorise('master_admin'), async (req, res) => {
  try {
    const allowedFields = [
      'taxable_amount',
      'cgst',
      'sgst',
      'igst',
      'total_tax',
      'discount_amount',
      'final_amount',
      'payment_mode',
      'customer_name',
      'customer_phone',
    ];
    const invoice = await Invoice.findById(req.params.id).populate('franchise_id', 'name franchiseCode');
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    const oldValues = {
      amount: invoice.final_amount,
      payment_mode: invoice.payment_mode,
      taxable_amount: invoice.taxable_amount,
      cgst: invoice.cgst,
      sgst: invoice.sgst,
      igst: invoice.igst,
      total_tax: invoice.total_tax,
      discount_amount: invoice.discount_amount,
    };

    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });
    if (updates.payment_mode !== undefined) updates.payment_mode = normalizePaymentMethod(updates.payment_mode);

    Object.assign(invoice, updates);
    await invoice.save();

    if (invoice.order_id) {
      const orderUpdates = {};
      if (updates.payment_mode !== undefined) orderUpdates.payment_mode = updates.payment_mode;
      if (updates.discount_amount !== undefined) orderUpdates.discount_amount = Number(updates.discount_amount);
      if (updates.final_amount !== undefined) orderUpdates.final_amount = Number(updates.final_amount);
      if (Object.keys(orderUpdates).length) await Order.findByIdAndUpdate(invoice.order_id, { $set: orderUpdates });
    }

    await logAudit('INVOICE_FINANCIALS_EDITED', req, invoice._id, 'Invoice', {
      invoiceId: invoice._id,
      invoiceNo: invoice.invoice_no,
      franchiseId: invoice.franchise_id?._id || invoice.franchise_id,
      franchiseName: invoice.franchise_id?.name || invoice.franchise_name || '',
      oldAmount: oldValues.amount,
      newAmount: invoice.final_amount,
      oldPaymentMethod: oldValues.payment_mode,
      newPaymentMethod: invoice.payment_mode,
      oldValues,
      newValues: updates,
      editedBy: req.user?.name || '',
      editedById: req.user?._id,
      editedAt: new Date(),
      reason: req.body.reason || '',
    });

    res.json({ success: true, invoice, message: 'Invoice financials updated and audited' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', protect, enforceActiveFranchise, authorise('master_admin'), async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('franchise_id', 'name franchiseCode');
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    const auditDetails = {
      invoiceId: invoice._id,
      invoiceNo: invoice.invoice_no,
      franchiseId: invoice.franchise_id?._id || invoice.franchise_id,
      franchiseName: invoice.franchise_id?.name || invoice.franchise_name || '',
      oldAmount: invoice.final_amount,
      newAmount: 0,
      paymentMethod: invoice.payment_mode,
      editedBy: req.user?.name || '',
      editedById: req.user?._id,
      editedAt: new Date(),
      reason: req.body?.reason || '',
    };

    await invoice.deleteOne();
    await logAudit('INVOICE_DELETED', req, auditDetails.invoiceId, 'Invoice', auditDetails);
    res.json({ success: true, message: 'Invoice deleted and audited' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', protect, enforceActiveFranchise, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('franchise_id', 'name franchiseCode state gstin');
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    if (!assertInvoiceAccess(req, invoice)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    res.json({ success: true, invoice });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id/receipt', protect, enforceActiveFranchise, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('franchise_id', 'name franchiseCode state gstin address phone');
    if (!invoice) return res.status(404).send('Invoice not found');
    if (!assertInvoiceAccess(req, invoice)) return res.status(403).send('Access denied');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderReceiptHtml(invoice));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.get('/:id/pdf', protect, enforceActiveFranchise, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate('franchise_id', 'name franchiseCode state gstin address phone');
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    if (!assertInvoiceAccess(req, invoice)) return res.status(403).json({ success: false, message: 'Access denied' });

    streamInvoicePdf(res, invoice);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
