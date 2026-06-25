const { mergeSubOrderItems } = require('../services/sessionService');

// Mongoose subdocuments have .toObject() — stub it for plain test objects
const item = (overrides) => ({
  name: 'Filter Coffee',
  qty: 1,
  unitPrice: 60,
  totalPrice: 60,
  gst_rate: 5,
  hsn_code: '2101',
  toObject() { return { ...this }; },
  ...overrides,
});

describe('sessionService — mergeSubOrderItems', () => {
  test('merges quantities of the same item across multiple sub-orders', () => {
    const subOrders = [
      { items: [item({ qty: 1, totalPrice: 60 })] },
      { items: [item({ qty: 2, totalPrice: 120 })] },
    ];
    const merged = mergeSubOrderItems(subOrders);
    expect(merged).toHaveLength(1);
    expect(merged[0].qty).toBe(3);
    expect(merged[0].totalPrice).toBe(180); // 60 unitPrice * 3
  });

  test('keeps different items separate', () => {
    const subOrders = [
      { items: [item({ name: 'Filter Coffee' }), item({ name: 'Masala Dosa', unitPrice: 90, totalPrice: 90 })] },
    ];
    const merged = mergeSubOrderItems(subOrders);
    expect(merged).toHaveLength(2);
    expect(merged.map(i => i.name).sort()).toEqual(['Filter Coffee', 'Masala Dosa']);
  });

  test('handles a single sub-order with no additions', () => {
    const subOrders = [{ items: [item({ qty: 2, totalPrice: 120 })] }];
    const merged = mergeSubOrderItems(subOrders);
    expect(merged).toHaveLength(1);
    expect(merged[0].qty).toBe(2);
  });
});
