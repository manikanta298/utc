const {
  applyLoyaltyRedemption,
  buildOrderListFilter,
  buildOrderHistoryFilter,
  buildOrderCsvRows,
} = require('../services/orderService');

describe('orderService — applyLoyaltyRedemption', () => {
  test('caps redemption at the customer\'s available points', () => {
    const customer = { total_points: 50 };
    const { pointsRedeemed } = applyLoyaltyRedemption(customer, 200);
    expect(pointsRedeemed).toBe(50);
  });

  test('redeems the requested amount when within balance', () => {
    const customer = { total_points: 500 };
    const { pointsRedeemed, discountAmount } = applyLoyaltyRedemption(customer, 100);
    expect(pointsRedeemed).toBe(100);
    expect(discountAmount).toBeGreaterThan(0);
  });

  test('redeems nothing when not requested', () => {
    const customer = { total_points: 500 };
    const { pointsRedeemed, discountAmount } = applyLoyaltyRedemption(customer, 0);
    expect(pointsRedeemed).toBe(0);
    expect(discountAmount).toBe(0);
  });

  test('redeems nothing for a negative request', () => {
    const customer = { total_points: 500 };
    const { pointsRedeemed } = applyLoyaltyRedemption(customer, -50);
    expect(pointsRedeemed).toBe(0);
  });
});

describe('orderService — buildOrderListFilter', () => {
  test('franchise users are always scoped to their own franchise', () => {
    const filter = buildOrderListFilter({ isMaster: false, requestingFranchiseId: 'f-1' });
    expect(filter.franchise_id).toBe('f-1');
    expect(filter.archivedAt).toBeNull();
  });

  test('master admin sees everything unless a franchise is specified', () => {
    const unscoped = buildOrderListFilter({ isMaster: true });
    expect(unscoped.franchise_id).toBeUndefined();

    const scoped = buildOrderListFilter({ isMaster: true, queryFranchiseId: 'f-2' });
    expect(scoped.franchise_id).toBe('f-2');
  });

  test('includeArchived=true skips the archivedAt exclusion', () => {
    const filter = buildOrderListFilter({ isMaster: true, includeArchived: 'true' });
    expect(filter.archivedAt).toBeUndefined();
  });

  test('search builds a case-insensitive regex on order_number', () => {
    const filter = buildOrderListFilter({ isMaster: true, search: 'FR01' });
    expect(filter.order_number.$regex).toBe('FR01');
    expect(filter.order_number.$options).toBe('i');
  });
});

describe('orderService — buildOrderHistoryFilter', () => {
  test('a resolved customerId with no date applies a rolling cutoff', () => {
    const filter = buildOrderHistoryFilter({ isMaster: true, customerId: 'c-1', days: 30 });
    expect(filter.customer_id).toBe('c-1');
    expect(filter.createdAt.$gte).toBeInstanceOf(Date);
  });

  test('an explicit date overrides the rolling cutoff', () => {
    const filter = buildOrderHistoryFilter({ isMaster: true, customerId: 'c-1', date: '2026-01-15' });
    expect(filter.createdAt.$gte.toISOString()).toContain('2026-01-15');
    expect(filter.createdAt.$lt).toBeInstanceOf(Date);
  });

  test('orderId search skips the rolling cutoff entirely', () => {
    const filter = buildOrderHistoryFilter({ isMaster: true, orderId: 'FR01-ORD-001' });
    expect(filter.createdAt).toBeUndefined();
    expect(filter.$or).toBeDefined();
  });
});

describe('orderService — buildOrderCsvRows', () => {
  test('shapes order documents into CSV-ready rows', () => {
    const orders = [{
      order_number: 'FR01-ORD-00001',
      createdAt: new Date('2026-01-01T10:00:00Z'),
      franchise_id: { franchiseCode: 'FR01', name: 'Test Outlet' },
      customer_id: { name: 'Test Customer', phone_no: '9999999999' },
      items: [{ name: 'Filter Coffee', quantity: 2 }],
      payment_mode: 'cash',
      kitchen_status: 'Pending',
      sub_total: 100,
      total_tax: 5,
      discount_amount: 0,
      final_amount: 105,
      visit_type: 'single',
    }];

    const { header, rows } = buildOrderCsvRows(orders);
    expect(header).toContain('Order No');
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe('FR01-ORD-00001');
    expect(rows[0][5]).toBe('Filter Coffee x 2');
  });
});
