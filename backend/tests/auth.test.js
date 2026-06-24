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

describe('Core workflow: auth', () => {
  test('setup-master creates the master admin account', async () => {
    const res = await request(app)
      .post('/api/auth/setup-master')
      .send({ setupKey: process.env.SETUP_KEY });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.email).toBe(process.env.MASTER_EMAIL);
  });

  test('login succeeds with correct master credentials and returns tokens', async () => {
    await request(app).post('/api/auth/setup-master').send({ setupKey: process.env.SETUP_KEY });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: process.env.MASTER_EMAIL, password: process.env.MASTER_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.role).toBe('master_admin');
  });

  test('login fails with the wrong password', async () => {
    await request(app).post('/api/auth/setup-master').send({ setupKey: process.env.SETUP_KEY });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: process.env.MASTER_EMAIL, password: 'TotallyWrongPassword1' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('a valid token can fetch /api/auth/me', async () => {
    await request(app).post('/api/auth/setup-master').send({ setupKey: process.env.SETUP_KEY });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: process.env.MASTER_EMAIL, password: process.env.MASTER_PASSWORD });

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(process.env.MASTER_EMAIL);
  });
});
