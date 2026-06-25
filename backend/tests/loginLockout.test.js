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

describe('Login brute-force lockout', () => {
  test('locks the account after 5 failed attempts, rejects further attempts with 423', async () => {
    await request(app).post('/api/auth/setup-master').send({ setupKey: process.env.SETUP_KEY });

    const wrongLogin = () => request(app)
      .post('/api/auth/login')
      .send({ email: process.env.MASTER_EMAIL, password: 'TotallyWrongPassword1' });

    // 4 failed attempts — still just "Invalid credentials", not locked yet
    for (let i = 0; i < 4; i++) {
      const res = await wrongLogin();
      expect(res.status).toBe(401);
    }

    // 5th failed attempt crosses the threshold and locks the account
    const fifthRes = await wrongLogin();
    expect(fifthRes.status).toBe(401);

    // 6th attempt (even with the CORRECT password) is rejected as locked
    const lockedRes = await request(app)
      .post('/api/auth/login')
      .send({ email: process.env.MASTER_EMAIL, password: process.env.MASTER_PASSWORD });
    expect(lockedRes.status).toBe(423);
    expect(lockedRes.body.success).toBe(false);
    expect(lockedRes.body.message).toMatch(/locked/i);
  });

  test('a successful login resets the failed-attempt counter', async () => {
    await request(app).post('/api/auth/setup-master').send({ setupKey: process.env.SETUP_KEY });

    // 2 failed attempts, well under the threshold
    await request(app).post('/api/auth/login').send({ email: process.env.MASTER_EMAIL, password: 'wrong1' });
    await request(app).post('/api/auth/login').send({ email: process.env.MASTER_EMAIL, password: 'wrong2' });

    // correct login succeeds and clears the counter
    const successRes = await request(app)
      .post('/api/auth/login')
      .send({ email: process.env.MASTER_EMAIL, password: process.env.MASTER_PASSWORD });
    expect(successRes.status).toBe(200);

    // subsequent wrong attempts start counting from zero again, not from 2
    const User = require('../models/User');
    const user = await User.findOne({ email: process.env.MASTER_EMAIL });
    expect(user.failedLoginAttempts).toBe(0);
  });

  test('every login attempt is recorded in the audit log', async () => {
    await request(app).post('/api/auth/setup-master').send({ setupKey: process.env.SETUP_KEY });
    await request(app).post('/api/auth/login').send({ email: process.env.MASTER_EMAIL, password: 'wrongpass' });
    await request(app).post('/api/auth/login').send({ email: process.env.MASTER_EMAIL, password: process.env.MASTER_PASSWORD });

    const AuditLog = require('../models/AuditLog');
    const logs = await AuditLog.find({ action: { $in: ['LOGIN_SUCCESS', 'LOGIN_FAILED'] } });
    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(logs.some(l => l.action === 'LOGIN_FAILED')).toBe(true);
    expect(logs.some(l => l.action === 'LOGIN_SUCCESS')).toBe(true);
  });
});
