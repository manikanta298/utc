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

async function setupFranchiseAndStaff() {
  await request(app).post('/api/auth/setup-master').send({ setupKey: process.env.SETUP_KEY });
  const masterToken = (await request(app)
    .post('/api/auth/login')
    .send({ email: process.env.MASTER_EMAIL, password: process.env.MASTER_PASSWORD })).body.token;

  const franchiseRes = await request(app)
    .post('/api/franchises')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({
      name: 'UTC Café — Notif Test', location: 'Test Street', city: 'Hyderabad', state: 'Telangana',
      gstin: '36AABCU9603R1ZN', address: '1 Test Street, Hyderabad', phone: '9000003001', email: 'notif-test@utccafe.com',
    });
  const franchiseId = franchiseRes.body.franchise._id;

  await request(app)
    .post('/api/auth/create-staff')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({
      name: 'Notif POS Staff', email: 'notif-pos@utccafe.com', password: 'PosStaff@1234',
      role: 'pos_staff', phone: '9000003002', franchise_id: franchiseId,
    });
  const posToken = (await request(app)
    .post('/api/auth/login')
    .send({ email: 'notif-pos@utccafe.com', password: 'PosStaff@1234' })).body.token;

  const menuRes = await request(app)
    .post('/api/menu')
    .set('Authorization', `Bearer ${masterToken}`)
    .field('name', 'Filter Coffee').field('category', 'Beverages')
    .field('price', '60').field('gst_rate', '5').field('hsn_code', '2101');
  const menuItemId = menuRes.body.item._id;

  const customerRes = await request(app)
    .post('/api/customers')
    .set('Authorization', `Bearer ${posToken}`)
    .send({ phone_no: '9876543220', name: 'Notif Customer' });

  return { masterToken, posToken, franchiseId, menuItemId, customerId: customerRes.body.customer._id };
}

describe('Notification persistence', () => {
  test('placing an order creates a persisted new_order notification', async () => {
    const { posToken, menuItemId, customerId } = await setupFranchiseAndStaff();

    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${posToken}`)
      .send({ customer_id: customerId, items: [{ item_id: menuItemId, quantity: 1 }], payment_mode: 'cash' });
    expect(orderRes.status).toBe(201);

    const listRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${posToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.notifications.length).toBeGreaterThan(0);
    const notif = listRes.body.notifications[0];
    expect(notif.type).toBe('new_order');
    expect(notif.is_read).toBe(false);
  });

  test('marking a notification read persists the change', async () => {
    const { posToken, menuItemId, customerId } = await setupFranchiseAndStaff();

    await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${posToken}`)
      .send({ customer_id: customerId, items: [{ item_id: menuItemId, quantity: 1 }], payment_mode: 'cash' });

    const listRes = await request(app).get('/api/notifications').set('Authorization', `Bearer ${posToken}`);
    const notifId = listRes.body.notifications[0]._id;

    const readRes = await request(app)
      .patch(`/api/notifications/${notifId}/read`)
      .set('Authorization', `Bearer ${posToken}`);
    expect(readRes.status).toBe(200);
    expect(readRes.body.notification.is_read).toBe(true);
  });

  test('mark-all-read clears unread state for the whole franchise', async () => {
    const { posToken, menuItemId, customerId } = await setupFranchiseAndStaff();

    await request(app).post('/api/orders').set('Authorization', `Bearer ${posToken}`)
      .send({ customer_id: customerId, items: [{ item_id: menuItemId, quantity: 1 }], payment_mode: 'cash' });
    await request(app).post('/api/orders').set('Authorization', `Bearer ${posToken}`)
      .send({ customer_id: customerId, items: [{ item_id: menuItemId, quantity: 2 }], payment_mode: 'cash' });

    const readAllRes = await request(app)
      .patch('/api/notifications/read-all')
      .set('Authorization', `Bearer ${posToken}`);
    expect(readAllRes.status).toBe(200);
    expect(readAllRes.body.updated).toBeGreaterThanOrEqual(2);

    const listRes = await request(app).get('/api/notifications').set('Authorization', `Bearer ${posToken}`);
    expect(listRes.body.notifications.every(n => n.is_read)).toBe(true);
  });

  test('a notification from another franchise is not accessible', async () => {
    const a = await setupFranchiseAndStaff();
    await request(app).post('/api/orders').set('Authorization', `Bearer ${a.posToken}`)
      .send({ customer_id: a.customerId, items: [{ item_id: a.menuItemId, quantity: 1 }], payment_mode: 'cash' });
    const notifId = (await request(app).get('/api/notifications').set('Authorization', `Bearer ${a.posToken}`))
      .body.notifications[0]._id;

    // a second, unrelated franchise + staff
    const masterToken = (await request(app)
      .post('/api/auth/login')
      .send({ email: process.env.MASTER_EMAIL, password: process.env.MASTER_PASSWORD })).body.token;
    const franchiseB = (await request(app)
      .post('/api/franchises')
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        name: 'UTC Café — Notif Test B', location: 'Other Street', city: 'Hyderabad', state: 'Telangana',
        gstin: '36AABCU9603R1ZB', address: '2 Other Street', phone: '9000003003', email: 'notif-test-b@utccafe.com',
      })).body.franchise._id;
    await request(app).post('/api/auth/create-staff').set('Authorization', `Bearer ${masterToken}`)
      .send({ name: 'Notif POS B', email: 'notif-pos-b@utccafe.com', password: 'PosStaff@1234', role: 'pos_staff', phone: '9000003004', franchise_id: franchiseB });
    const posTokenB = (await request(app).post('/api/auth/login')
      .send({ email: 'notif-pos-b@utccafe.com', password: 'PosStaff@1234' })).body.token;

    const readRes = await request(app)
      .patch(`/api/notifications/${notifId}/read`)
      .set('Authorization', `Bearer ${posTokenB}`);
    expect(readRes.status).toBe(404); // scoped query finds nothing for the wrong franchise
  });
});
