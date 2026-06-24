require('./helpers/testEnv');
const request = require('supertest');
const db = require('./helpers/db');
const { createApp } = require('../app');

let app;

beforeAll(async () => {
  await db.connect();
  app = createApp();
});

afterAll(async () => {
  await db.closeDatabase();
});

describe('Security smoke test', () => {
  test('helmet security headers are present', async () => {
    const res = await request(app).get('/api/health');
    // helmet defaults
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  test('protected route rejects requests with no token', async () => {
    const res = await request(app).get('/api/menu/all');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('protected route rejects a garbage/invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
  });

  test('rate limiter headers are present on API responses', async () => {
    const res = await request(app).get('/api/menu/all');
    // express-rate-limit with standardHeaders: true sets RateLimit-*
    expect(
      res.headers['ratelimit-limit'] !== undefined ||
      res.headers['x-ratelimit-limit'] !== undefined
    ).toBe(true);
  });

  test('login endpoint rejects malformed input before touching the database', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: '123' });
    expect(res.status).toBe(400);
  });

  test('setup-master rejects an invalid setup key', async () => {
    const res = await request(app)
      .post('/api/auth/setup-master')
      .send({ setupKey: 'wrong-key' });
    expect(res.status).toBe(403);
  });
});
