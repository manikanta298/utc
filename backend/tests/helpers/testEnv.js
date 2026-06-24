// Imported first in every test file, before requiring '../app'.
// middleware/auth.js calls process.exit(1) at require-time if JWT_SECRET is
// missing, so these must be set before the app module graph is loaded.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-smoke-tests-only';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-for-smoke-tests-only';
process.env.SETUP_KEY = 'test-setup-key';
process.env.SEED_SECRET = 'test-seed-secret';
process.env.MASTER_EMAIL = 'admin@test.local';
process.env.MASTER_PASSWORD = 'TestAdmin@1234';
process.env.FRONTEND_URL = 'http://localhost:5173';
