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

describe('Stability smoke test', () => {
  test('GET /api/health returns 200 and a healthy payload', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toMatch(/running/i);
    expect(typeof res.body.uptime).toBe('number');
  });

  test('unknown route returns a clean 404, not a crash', async () => {
    const res = await request(app).get('/api/this-route-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
