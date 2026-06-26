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

async function setup() {
  await request(app).post('/api/auth/setup-master').send({ setupKey: process.env.SETUP_KEY });
  const masterToken = (await request(app)
    .post('/api/auth/login')
    .send({ email: process.env.MASTER_EMAIL, password: process.env.MASTER_PASSWORD })).body.token;

  const franchiseId = (await request(app)
    .post('/api/franchises')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({
      name: 'UTC Café — Waiter Flow Test', location: 'Test Street', city: 'Hyderabad', state: 'Telangana',
      gstin: '36AABCU9603R1ZW', address: '1 Test Street, Hyderabad', phone: '9000004001', email: 'waiterflow-test@utccafe.com',
    })).body.franchise._id;

  await request(app).post('/api/auth/create-staff').set('Authorization', `Bearer ${masterToken}`)
    .send({ name: 'Test Waiter', email: 'waiterflow-waiter@utccafe.com', password: 'Waiter@1234', role: 'waiter', phone: '9000004002', franchise_id: franchiseId });
  const waiterToken = (await request(app).post('/api/auth/login')
    .send({ email: 'waiterflow-waiter@utccafe.com', password: 'Waiter@1234' })).body.token;

  await request(app).post('/api/auth/create-staff').set('Authorization', `Bearer ${masterToken}`)
    .send({ name: 'Test POS', email: 'waiterflow-pos@utccafe.com', password: 'PosStaff@1234', role: 'pos_staff', phone: '9000004003', franchise_id: franchiseId });
  const posToken = (await request(app).post('/api/auth/login')
    .send({ email: 'waiterflow-pos@utccafe.com', password: 'PosStaff@1234' })).body.token;

  await request(app).post('/api/auth/create-staff').set('Authorization', `Bearer ${masterToken}`)
    .send({ name: 'Test Kitchen', email: 'waiterflow-kitchen@utccafe.com', password: 'Kitchen@1234', role: 'kitchen_staff', phone: '9000004004', franchise_id: franchiseId });
  const kitchenToken = (await request(app).post('/api/auth/login')
    .send({ email: 'waiterflow-kitchen@utccafe.com', password: 'Kitchen@1234' })).body.token;

  const menuItemId = (await request(app).post('/api/menu').set('Authorization', `Bearer ${masterToken}`)
    .field('name', 'Filter Coffee').field('category', 'Beverages')
    .field('price', '60').field('gst_rate', '5').field('hsn_code', '2101')).body.item._id;

  return { masterToken, waiterToken, posToken, kitchenToken, franchiseId, menuItemId };
}

describe('Waiter order approval -> kitchen visibility (the critical fix)', () => {
  test('an order placed by a waiter and approved by POS is actually visible on the kitchen screen', async () => {
    const { waiterToken, posToken, kitchenToken, menuItemId } = await setup();

    // 1. Waiter places an order
    const placeRes = await request(app)
      .post('/api/waiter/place-order')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ tableNumber: 'T9', orderType: 'dine_in', customerMobile: '9876543230', customerName: 'Waiter Test Customer', items: [{ menuItemId, qty: 2 }] });
    expect(placeRes.status).toBe(201);
    const sessionId = placeRes.body.session._id;

    // 2. Before approval: kitchen sees nothing (no Order exists yet — this is the intended gate)
    const beforeApproval = await request(app).get('/api/kitchen/orders').set('Authorization', `Bearer ${kitchenToken}`);
    expect(beforeApproval.body.orders).toHaveLength(0);

    // 3. POS sees it in the pending-approval queue
    const pendingRes = await request(app).get('/api/waiter/pending-sessions').set('Authorization', `Bearer ${posToken}`);
    expect(pendingRes.body.sessions.some(s => s._id === sessionId)).toBe(true);

    // 4. POS approves it
    const approveRes = await request(app)
      .post(`/api/waiter/sessions/${sessionId}/approve`)
      .set('Authorization', `Bearer ${posToken}`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.session.status).toBe('open');

    // 5. THE FIX: kitchen now actually sees the order
    const afterApproval = await request(app).get('/api/kitchen/orders').set('Authorization', `Bearer ${kitchenToken}`);
    expect(afterApproval.body.orders).toHaveLength(1);
    expect(afterApproval.body.orders[0].items).toHaveLength(1);
    expect(afterApproval.body.orders[0].items[0].quantity).toBe(2);
    expect(afterApproval.body.orders[0].kitchen_status).toBe('Pending');
    expect(afterApproval.body.orders[0].order_source).toBe('waiter');
  });

  test('re-approving an already-approved session is idempotent (does not duplicate the order)', async () => {
    const { waiterToken, posToken, kitchenToken, menuItemId } = await setup();

    const sessionId = (await request(app).post('/api/waiter/place-order').set('Authorization', `Bearer ${waiterToken}`)
      .send({ tableNumber: 'T10', orderType: 'dine_in', customerMobile: '9876543231', items: [{ menuItemId, qty: 1 }] })).body.session._id;

    await request(app).post(`/api/waiter/sessions/${sessionId}/approve`).set('Authorization', `Bearer ${posToken}`);
    const secondApprove = await request(app).post(`/api/waiter/sessions/${sessionId}/approve`).set('Authorization', `Bearer ${posToken}`);
    expect(secondApprove.status).toBe(200);
    expect(secondApprove.body.message).toMatch(/already approved/i);

    const kitchenRes = await request(app).get('/api/kitchen/orders').set('Authorization', `Bearer ${kitchenToken}`);
    expect(kitchenRes.body.orders).toHaveLength(1); // not duplicated
  });

  test('a rejected session never creates an order and never reaches the kitchen', async () => {
    const { waiterToken, posToken, kitchenToken, menuItemId } = await setup();

    const sessionId = (await request(app).post('/api/waiter/place-order').set('Authorization', `Bearer ${waiterToken}`)
      .send({ tableNumber: 'T11', orderType: 'dine_in', customerMobile: '9876543232', items: [{ menuItemId, qty: 1 }] })).body.session._id;

    const rejectRes = await request(app)
      .post(`/api/waiter/sessions/${sessionId}/reject`)
      .set('Authorization', `Bearer ${posToken}`)
      .send({ reason: 'Table already left' });
    expect(rejectRes.status).toBe(200);

    const kitchenRes = await request(app).get('/api/kitchen/orders').set('Authorization', `Bearer ${kitchenToken}`);
    expect(kitchenRes.body.orders).toHaveLength(0);
  });
});
