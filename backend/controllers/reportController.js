const PDFDocument = require('pdfkit');
const {
  buildPaymentReportFilter,
  getPaymentReportRows,
  filterAndSummarizePayments,
  buildSalesReportFilter,
  getSalesReportData,
} = require('../services/reportService');

const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const money = (v) => `Rs. ${Number(v || 0).toFixed(2)}`;

const paymentHeaders = ['Session Ref', 'Franchise', 'Customer', 'Mobile', 'Payment Type',
  'Original Amount', 'Discount', 'Amount Paid', 'Status', 'Token', 'Date'];

const paymentRowValues = (r) => [
  r.sessionRef, r.franchise, r.customerName, r.mobile,
  r.paymentType, r.originalAmount, r.discount, r.finalAmount,
  r.paymentStatus, r.tokenNumber, r.date,
];

const sendPaymentPdf = (res, rows, summary, reportLabel) => {
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${reportLabel.toLowerCase().replace(/\s+/g, '-')}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text(`UTC Cafe ${reportLabel}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Generated: ${new Date().toLocaleString('en-IN')}`, { align: 'center' });
  doc.moveDown();
  doc.font('Helvetica-Bold').text(`Total: ${money(summary.total)}   Cash: ${money(summary.Cash)}   UPI: ${money(summary.UPI)}   Card: ${money(summary.Card)}   Net Banking: ${money(summary['Net Banking'])}   Other: ${money(summary.Other)}`);
  doc.moveDown();

  rows.slice(0, 400).forEach((r) => {
    doc.font('Helvetica-Bold').fontSize(9).text(`${r.sessionRef} | ${r.franchise} | ${r.paymentType}`);
    doc.font('Helvetica').fontSize(8).text(`${r.customerName || '-'} ${r.mobile || ''} | Paid ${money(r.finalAmount)} | Discount ${money(r.discount)} | ${r.paymentStatus} | ${r.date ? new Date(r.date).toLocaleString('en-IN') : ''}`);
    doc.moveDown(0.35);
  });

  if (rows.length > 400) doc.text(`Showing first 400 of ${rows.length} rows. Export CSV/Excel for full data.`);
  doc.end();
};

// GET /api/reports/payments
const getPaymentReport = async (req, res) => {
  try {
    const { franchiseId, startDate, endDate, format = 'json', paymentMethod = 'all' } = req.query;
    const isExport = ['csv', 'excel', 'pdf'].includes(format);
    const isMaster = req.user.role === 'master_admin';

    if (isExport && !isMaster) {
      return res.status(403).json({ success: false, message: 'Only Master Admin can download financial reports' });
    }

    const filter = buildPaymentReportFilter({
      isMaster,
      franchiseId,
      startDate,
      endDate,
      requestingFranchiseId: req.user.franchise_id?._id || req.user.franchise_id,
    });

    const rows = await getPaymentReportRows(filter);
    const { filteredRows, summary, reportLabel } = filterAndSummarizePayments(rows, paymentMethod);

    if (format === 'csv' || format === 'excel') {
      const csvRows = filteredRows.map(r => paymentRowValues(r).map(csvEscape).join(','));
      const csv = [paymentHeaders.map(csvEscape).join(','), ...csvRows].join('\n');
      res.setHeader('Content-Type', format === 'excel' ? 'application/vnd.ms-excel; charset=utf-8' : 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${reportLabel.toLowerCase().replace(/\s+/g, '-')}.${format === 'excel' ? 'xls' : 'csv'}"`);
      return res.send(csv);
    }

    if (format === 'pdf') {
      return sendPaymentPdf(res, filteredRows, summary, reportLabel);
    }

    res.json({ success: true, rows: filteredRows, summary, total: filteredRows.length, reportLabel });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/reports/sales
const getSalesReport = async (req, res) => {
  try {
    const { period = 'daily', franchiseId } = req.query;
    const isMaster = req.user.role === 'master_admin';

    if (!isMaster && period !== 'daily') {
      return res.status(403).json({ success: false, message: 'Franchise users can only view daily summaries' });
    }

    const filter = buildSalesReportFilter({
      isMaster,
      franchiseId,
      period,
      requestingFranchiseId: req.user.franchise_id?._id || req.user.franchise_id,
    });

    const { data, totalRevenue, totalOrders } = await getSalesReportData(filter);
    res.json({ success: true, data, totalRevenue, totalOrders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getPaymentReport, getSalesReport };
