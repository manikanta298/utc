const {
  normalizePaymentMethod,
  filterAndSummarizePayments,
  buildPaymentReportFilter,
  buildSalesReportFilter,
} = require('../services/reportService');

describe('reportService — normalizePaymentMethod', () => {
  test('maps known methods case-insensitively', () => {
    expect(normalizePaymentMethod('cash')).toBe('Cash');
    expect(normalizePaymentMethod('UPI')).toBe('UPI');
    expect(normalizePaymentMethod('net banking')).toBe('Net Banking');
  });

  test('falls back to Pending for empty input', () => {
    expect(normalizePaymentMethod('')).toBe('Pending');
    expect(normalizePaymentMethod(undefined)).toBe('Pending');
  });

  test('falls back to Other for unrecognized methods', () => {
    expect(normalizePaymentMethod('Bitcoin')).toBe('Other');
  });
});

describe('reportService — filterAndSummarizePayments', () => {
  const rows = [
    { paymentType: 'Cash', finalAmount: 100 },
    { paymentType: 'UPI', finalAmount: 250 },
    { paymentType: 'Cash', finalAmount: 50 },
  ];

  test('summarizes totals per payment type when no filter applied', () => {
    const { summary, filteredRows, reportLabel } = filterAndSummarizePayments(rows, 'all');
    expect(filteredRows).toHaveLength(3);
    expect(summary.total).toBe(400);
    expect(summary.Cash).toBe(150);
    expect(summary.UPI).toBe(250);
    expect(reportLabel).toBe('All Payments Report');
  });

  test('filters to a single payment type when requested', () => {
    const { filteredRows, summary, reportLabel } = filterAndSummarizePayments(rows, 'cash');
    expect(filteredRows).toHaveLength(2);
    expect(summary.total).toBe(150);
    expect(reportLabel).toBe('Cash Report');
  });

  test('returns zeroed summary for an empty row set', () => {
    const { filteredRows, summary } = filterAndSummarizePayments([], 'all');
    expect(filteredRows).toHaveLength(0);
    expect(summary.total).toBe(0);
  });
});

describe('reportService — buildPaymentReportFilter', () => {
  test('franchise users are scoped to their own franchise and today only', () => {
    const filter = buildPaymentReportFilter({
      isMaster: false,
      requestingFranchiseId: 'franchise-123',
    });
    expect(filter.franchiseId).toBe('franchise-123');
    expect(filter.openedAt.$gte).toBeInstanceOf(Date);
    expect(filter.openedAt.$lte).toBeInstanceOf(Date);
  });

  test('master admin with no franchiseId gets an unscoped filter', () => {
    const filter = buildPaymentReportFilter({ isMaster: true });
    expect(filter.franchiseId).toBeUndefined();
  });

  test('master admin can scope to a specific franchise and date range', () => {
    const filter = buildPaymentReportFilter({
      isMaster: true,
      franchiseId: 'franchise-456',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
    expect(filter.franchiseId).toBe('franchise-456');
    expect(filter.openedAt.$gte.toISOString()).toContain('2026-01-01');
  });
});

describe('reportService — buildSalesReportFilter', () => {
  test('franchise users are always scoped to their own franchise', () => {
    const filter = buildSalesReportFilter({
      isMaster: false,
      requestingFranchiseId: 'franchise-789',
      period: 'daily',
    });
    expect(filter.franchise_id).toBe('franchise-789');
    expect(filter.archivedAt).toBeNull();
  });

  test('weekly period looks back further than daily', () => {
    const daily = buildSalesReportFilter({ isMaster: true, period: 'daily' });
    const weekly = buildSalesReportFilter({ isMaster: true, period: 'weekly' });
    expect(weekly.createdAt.$gte.getTime()).toBeLessThan(daily.createdAt.$gte.getTime());
  });
});
