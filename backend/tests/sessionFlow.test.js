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

async function setupFranchiseAndStaff(suffix = '') {
  await request(app).post('/api/auth/setup-master').send({ setupKey: process.env.SETUP_KEY });
  const masterToken = (await request(app)
    .post('/api/auth/login')
    .send({ email: process.env.MASTER_EMAIL, password: process.env.MASTER_PASSWORD })).body.token;

  const franchiseRes = await request(app)
    .post('/api/franchises')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({
      name: `UTC Café — Session Test${suffix}`,
      location: 'Test Street', city: 'Hyderabad', state: 'Telangana',
      gstin: `36AABCU9603R1Z${suffix || 'X'}`, address: '1 Test Street, Hyderabad',
      phone: `900000100${suffix || '0'}`, email: `session-test${suffix}@utccafe.com`,
    });
  const franchiseId = franchiseRes.body.franchise._id;

  await request(app)
    .post('/api/auth/create-staff')
    .set('Authorization', `Bearer ${masterToken}`)
    .send({
      name: `Session POS Staff${suffix}`, email: `session-pos${suffix}@utccafe.com`,
      password: 'PosStaff@1234', role: 'pos_staff', phone: `900000200${suffix || '0'}`, franchise_id: franchiseId,
    });
  const posToken = (await request(app)
    .post('/api/auth/login')
    .send({ email: `session-pos${suffix}@utccafe.com`, password: 'PosStaff@1234' })).body.token;

  const menuRes = await request(app)
    .post('/api/menu')
    .set('Authorization', `Bearer ${masterToken}`)
    .field('name', 'Filter Coffee').field('category', 'Beverages')
    .field('price', '60').field('gst_rate', '5').field('hsn_code', '2101');
  const menuItemId = menuRes.body.item._id;

  return { masterToken, posToken, franchiseId, menuItemId };
}

describe('Core workflow: full session lifecycle (highest-risk path)', () => {
  test('start -> add order -> generate bill -> record payment -> fully paid', async () => {
    const { posToken, menuItemId } = await setupFranchiseAndStaff('1');

    // 1. Start a session
    const startRes = await request(app)
      .post('/api/sessions/start')
      .set('Authorization', `Bearer ${posToken}`)
      .send({ mobile: '9876543210', tableNumber: 'T1', orderType: 'dine_in' });
    expect(startRes.status).toBe(201);
    expect(startRes.body.isResumed).toBe(false);
    const sessionId = startRes.body.session._id;

    // 2. Add an order to the session
    const addOrderRes = await request(app)
      .post(`/api/sessions/${sessionId}/orders`)
      .set('Authorization', `Bearer ${posToken}`)
      .send({ items: [{ menuItemId, qty: 2 }], destination: 'kitchen' });
    expect(addOrderRes.status).toBe(200);
    expect(addOrderRes.body.order.items).toHaveLength(1);
    expect(addOrderRes.body.isAddition).toBe(false);

    // 3. Generate the bill
    const billRes = await request(app)
      .post(`/api/sessions/${sessionId}/bill`)
      .set('Authorization', `Bearer ${posToken}`)
      .send({});
    expect(billRes.status).toBe(200);
    const totalAmount = billRes.body.session.totalAmount;
    expect(totalAmount).toBeGreaterThan(0);
    expect(billRes.body.session.status).toBe('bill_pending');

    // 4. Record full payment — the highest-risk transition in the app
    const payRes = await request(app)
      .post(`/api/sessions/${sessionId}/payment`)
      .set('Authorization', `Bearer ${posToken}`)
      .send({ amount: totalAmount, method: 'Cash' });
    expect(payRes.status).toBe(200);
    expect(payRes.body.session.status).toBe('paid');
    expect(payRes.body.session.paymentStatus).toBe('fully_paid');
    expect(payRes.body.balance).toBe(0);
    expect(payRes.body.invoice).toBeDefined();
    expect(payRes.body.invoice).not.toBeNull();

    // 5. Fetch the session back — confirms it actually persisted correctly
    const getRes = await request(app)
      .get(`/api/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${posToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.session.status).toBe('paid');
  });

  test('partial payment leaves the session open with a remaining balance', async () => {
    const { posToken, menuItemId } = await setupFranchiseAndStaff('2');

    const sessionId = (await request(app)
      .post('/api/sessions/start')
      .set('Authorization', `Bearer ${posToken}`)
      .send({ mobile: '9876543211', tableNumber: 'T2' })).body.session._id;

    await request(app)
      .post(`/api/sessions/${sessionId}/orders`)
      .set('Authorization', `Bearer ${posToken}`)
      .send({ items: [{ menuItemId, qty: 4 }] });

    const billRes = await request(app)
      .post(`/api/sessions/${sessionId}/bill`)
      .set('Authorization', `Bearer ${posToken}`)
      .send({});
    const totalAmount = billRes.body.session.totalAmount;

    const partialAmount = Math.floor(totalAmount / 2);
    const payRes = await request(app)
      .post(`/api/sessions/${sessionId}/payment`)
      .set('Authorization', `Bearer ${posToken}`)
      .send({ amount: partialAmount, method: 'Cash' });

    expect(payRes.status).toBe(200);
    expect(payRes.body.session.status).not.toBe('paid');
    expect(payRes.body.session.paymentStatus).toBe('partially_paid');
    expect(payRes.body.balance).toBeGreaterThan(0);
  });

  test('cannot record payment before a bill has been generated', async () => {
    const { posToken, menuItemId } = await setupFranchiseAndStaff('3');

    const sessionId = (await request(app)
      .post('/api/sessions/start')
      .set('Authorization', `Bearer ${posToken}`)
      .send({ mobile: '9876543212', tableNumber: 'T3' })).body.session._id;

    await request(app)
      .post(`/api/sessions/${sessionId}/orders`)
      .set('Authorization', `Bearer ${posToken}`)
      .send({ items: [{ menuItemId, qty: 1 }] });

    const payRes = await request(app)
      .post(`/api/sessions/${sessionId}/payment`)
      .set('Authorization', `Bearer ${posToken}`)
      .send({ amount: 100, method: 'Cash' });

    expect(payRes.status).toBe(400);
    expect(payRes.body.success).toBe(false);
  });

  test('hold -> resume returns a session to open status', async () => {
    const { posToken } = await setupFranchiseAndStaff('4');

    const sessionId = (await request(app)
      .post('/api/sessions/start')
      .set('Authorization', `Bearer ${posToken}`)
      .send({ mobile: '9876543213', tableNumber: 'T4' })).body.session._id;

    const holdRes = await request(app)
      .post(`/api/sessions/${sessionId}/hold`)
      .set('Authorization', `Bearer ${posToken}`)
      .send({ note: 'Customer stepped out' });
    expect(holdRes.status).toBe(200);
    expect(holdRes.body.session.status).toBe('on_hold');

    const heldListRes = await request(app)
      .get('/api/sessions/held')
      .set('Authorization', `Bearer ${posToken}`);
    expect(heldListRes.body.sessions.some(s => s._id === sessionId)).toBe(true);

    const resumeRes = await request(app)
      .post(`/api/sessions/${sessionId}/resume`)
      .set('Authorization', `Bearer ${posToken}`);
    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.session.status).toBe('open');
  });

  test('cancelling a session marks it cancelled and frees the table', async () => {
    const { posToken } = await setupFranchiseAndStaff('5');

    const sessionId = (await request(app)
      .post('/api/sessions/start')
      .set('Authorization', `Bearer ${posToken}`)
      .send({ mobile: '9876543214', tableNumber: 'T5' })).body.session._id;

    const cancelRes = await request(app)
      .post(`/api/sessions/${sessionId}/cancel`)
      .set('Authorization', `Bearer ${posToken}`)
      .send({ reason: 'Customer left' });
    expect(cancelRes.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${posToken}`);
    expect(getRes.body.session.status).toBe('cancelled');
  });

  test('starting a second session for the same mobile the same day resumes instead of duplicating', async () => {
    const { posToken } = await setupFranchiseAndStaff('6');

    const first = await request(app)
      .post('/api/sessions/start')
      .set('Authorization', `Bearer ${posToken}`)
      .send({ mobile: '9876543215', tableNumber: 'T6' });
    expect(first.body.isResumed).toBe(false);

    const second = await request(app)
      .post('/api/sessions/start')
      .set('Authorization', `Bearer ${posToken}`)
      .send({ mobile: '9876543215', tableNumber: 'T6' });
    expect(second.status).toBe(200);
    expect(second.body.isResumed).toBe(true);
    expect(second.body.session._id).toBe(first.body.session._id);
  });
});
