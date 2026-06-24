require('./helpers/testEnv');
const request = require('supertest');
const db = require('./helpers/db');
const { createApp } = require('../app');

let app;

beforeAll(async () => {
  await db.connect();
  app = createApp();
});

afterEach(async () => {
  await db.clearDatabase();
});

afterAll(async () => {
  await db.closeDatabase();
});

async function loginAsMaster() {
  await request(app).post('/api/auth/setup-master').send({ setupKey: process.env.SETUP_KEY });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: process.env.MASTER_EMAIL, password: process.env.MASTER_PASSWORD });
  return res.body.token;
}

describe('Core workflow: place an order end-to-end', () => {
  test('franchise -> staff -> menu item -> customer -> order', async () => {
    const masterToken = await loginAsMaster();

    // 1. Master admin creates a franchise
    const franchiseRes = await request(app)
      .post('/api/franchises')
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        name: 'UTC Café — Test Outlet',
        location: 'Test Street',
        city: 'Hyderabad',
        state: 'Telangana',
        gstin: '36AABCU9603R1ZX',
        address: '1 Test Street, Hyderabad',
        phone: '9000000001',
        email: 'test-outlet@utccafe.com',
      });
    expect(franchiseRes.status).toBe(201);
    const franchiseId = franchiseRes.body.franchise._id;
    expect(franchiseId).toBeDefined();

    // 2. Master admin creates a pos_staff user for that franchise
    const staffRes = await request(app)
      .post('/api/auth/create-staff')
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        name: 'Test POS Staff',
        email: 'pos-staff@utccafe.com',
        password: 'PosStaff@1234',
        role: 'pos_staff',
        phone: '9000000002',
        franchise_id: franchiseId,
      });
    expect(staffRes.status).toBe(201);

    // 3. Master admin creates a menu item (multipart form, no image file)
    const menuRes = await request(app)
      .post('/api/menu')
      .set('Authorization', `Bearer ${masterToken}`)
      .field('name', 'Filter Coffee')
      .field('description', 'South Indian filter coffee')
      .field('category', 'Beverages')
      .field('price', '60')
      .field('gst_rate', '5')
      .field('hsn_code', '2101');
    expect(menuRes.status).toBe(201);
    const menuItemId = menuRes.body.item._id;
    expect(menuItemId).toBeDefined();

    // 4. POS staff logs in
    const posLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'pos-staff@utccafe.com', password: 'PosStaff@1234' });
    expect(posLoginRes.status).toBe(200);
    const posToken = posLoginRes.body.token;

    // 5. POS staff creates a customer
    const customerRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${posToken}`)
      .send({ phone_no: '9876543210', name: 'Test Customer' });
    expect(customerRes.status).toBe(201);
    const customerId = customerRes.body.customer._id;
    expect(customerId).toBeDefined();

    // 6. POS staff places an order — the highest-risk path in the app
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${posToken}`)
      .send({
        customer_id: customerId,
        items: [{ item_id: menuItemId, quantity: 2 }],
        payment_mode: 'cash',
        order_type: 'dine_in',
      });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body.success).toBe(true);
    expect(orderRes.body.order).toBeDefined();
    expect(orderRes.body.order.items.length).toBeGreaterThan(0);
    expect(orderRes.body.invoice).toBeDefined();

    // 7. Fetch the order back by ID — confirms it actually persisted correctly
    const orderId = orderRes.body.order._id;
    const fetchRes = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${posToken}`);
    expect(fetchRes.status).toBe(200);
  });

  test('order creation rejects an unavailable/non-existent menu item', async () => {
    const masterToken = await loginAsMaster();

    const franchiseRes = await request(app)
      .post('/api/franchises')
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        name: 'UTC Café — Test Outlet 2',
        location: 'Test Street 2',
        city: 'Hyderabad',
        state: 'Telangana',
        gstin: '36AABCU9603R1ZY',
        address: '2 Test Street, Hyderabad',
        phone: '9000000003',
        email: 'test-outlet-2@utccafe.com',
      });
    const franchiseId = franchiseRes.body.franchise._id;

    await request(app)
      .post('/api/auth/create-staff')
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        name: 'Test POS Staff 2', email: 'pos-staff-2@utccafe.com', password: 'PosStaff@1234',
        role: 'pos_staff', phone: '9000000004', franchise_id: franchiseId,
      });
    const posToken = (await request(app)
      .post('/api/auth/login')
      .send({ email: 'pos-staff-2@utccafe.com', password: 'PosStaff@1234' })).body.token;

    const customerRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${posToken}`)
      .send({ phone_no: '9876500000', name: 'Test Customer 2' });

    const fakeMenuItemId = '64b000000000000000000000'; // valid ObjectId shape, doesn't exist
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${posToken}`)
      .send({
        customer_id: customerRes.body.customer._id,
        items: [{ item_id: fakeMenuItemId, quantity: 1 }],
        payment_mode: 'cash',
      });

    expect(orderRes.status).toBe(400);
    expect(orderRes.body.success).toBe(false);
  });
});
