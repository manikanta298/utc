const { derivePaymentStatus, buildUpiLink } = require('../services/paymentService');

describe('paymentService — derivePaymentStatus', () => {
  test('fully paid when paidAmount equals totalAmount', () => {
    const { paymentStatus, isFullyPaid, balance } = derivePaymentStatus(500, 500);
    expect(paymentStatus).toBe('fully_paid');
    expect(isFullyPaid).toBe(true);
    expect(balance).toBe(0);
  });

  test('fully paid when paidAmount exceeds totalAmount', () => {
    const { paymentStatus, isFullyPaid, balance } = derivePaymentStatus(600, 500);
    expect(paymentStatus).toBe('fully_paid');
    expect(isFullyPaid).toBe(true);
    expect(balance).toBe(-100);
  });

  test('partially paid when some but not all has been paid', () => {
    const { paymentStatus, isFullyPaid, balance } = derivePaymentStatus(200, 500);
    expect(paymentStatus).toBe('partially_paid');
    expect(isFullyPaid).toBe(false);
    expect(balance).toBe(300);
  });

  test('unpaid when nothing has been paid yet', () => {
    const { paymentStatus, isFullyPaid } = derivePaymentStatus(0, 500);
    expect(paymentStatus).toBe('unpaid');
    expect(isFullyPaid).toBe(false);
  });

  test('handles missing totalAmount gracefully (treated as 0)', () => {
    const { paymentStatus, isFullyPaid } = derivePaymentStatus(0, undefined);
    expect(isFullyPaid).toBe(true); // 0 >= 0
    expect(paymentStatus).toBe('fully_paid');
  });
});

describe('paymentService — buildUpiLink', () => {
  test('builds a valid upi:// deep link with the given amount', () => {
    const link = buildUpiLink({ amount: 150, upiId: 'cafe@upi', merchantName: 'UTC Cafe' });
    expect(link).toMatch(/^upi:\/\/pay\?/);
    expect(link).toContain('pa=cafe@upi');
    expect(link).toContain('am=150.00');
    expect(link).toContain('cu=INR');
  });

  test('falls back to default merchant name when none given', () => {
    const link = buildUpiLink({ amount: 100, upiId: 'cafe@upi' });
    expect(link).toContain(encodeURIComponent('UTC Cafe'));
  });
});
