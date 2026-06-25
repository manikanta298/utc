const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const { mongoSanitize, preventParamPollution, securityHeaders } = require('./middleware/security');

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const normalizeOrigin = (value) => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, '');
  }
};

/**
 * Builds the Express app — all middleware and routes, no Mongo connection,
 * no Socket.IO server, no cron jobs. This is what makes the app testable
 * with supertest without needing a real server listening on a port.
 *
 * @param {object} [opts]
 * @param {object} [opts.io] - real Socket.IO server in production; omitted
 *   in tests, where a no-op stub is used instead so controllers calling
 *   req.app.get('io').emit(...) don't throw.
 */
function createApp({ io } = {}) {
  const app = express();

  const configuredOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter(Boolean);

  const allowedOrigins = Array.from(new Set([...defaultOrigins, ...configuredOrigins]));

  const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    if (allowedOrigins.includes(origin)) return true;
    if (/https:\/\/[a-z0-9-]+-manikanta298s-projects\.vercel\.app$/.test(origin)) return true;
    if (/https:\/\/utc-cafe[a-z0-9-]*\.vercel\.app$/.test(origin)) return true;
    return false;
  };

  const corsOptions = {
    origin: (origin, callback) =>
      callback(isAllowedOrigin(origin) ? null : new Error(`Not allowed by CORS: ${origin}`), isAllowedOrigin(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Refresh-Token'],
    maxAge: 86400,
  };

  // No-op stub so req.app.get('io').emit(...) never throws when no real
  // Socket.IO server is attached (e.g. in tests).
  app.set('io', io || { emit: () => {}, to: () => ({ emit: () => {}, to: () => ({ emit: () => {} }) }) });
  app.set('trust proxy', 1);

  app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
        connectSrc: ["'self'", ...allowedOrigins],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  }));

  app.use(compression());
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use(securityHeaders);
  app.use(mongoSanitize);
  app.use(preventParamPollution);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  if (process.env.NODE_ENV === 'test') {
    // silent — no request logging during test runs
  } else if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined', { skip: (req, res) => res.statusCode < 400 }));
  }

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/seed-demo',
    message: { success: false, message: 'Too many authentication attempts. Please try again later.' },
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/api/health',
    message: { success: false, message: 'Too many requests, please slow down.' },
  });
  app.use('/api', apiLimiter);

  app.use('/api/auth', authLimiter, require('./routes/auth'));
  app.use('/api/franchises', require('./routes/franchise'));
  app.use('/api/menu', require('./routes/menu'));
  app.use('/api/orders', require('./routes/orders'));
  app.use('/api/customers', require('./routes/customers'));
  app.use('/api/kitchen', require('./routes/kitchen'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/invoices', require('./routes/invoices'));
  app.use('/api/loyalty', require('./routes/loyalty'));
  app.use('/api/staff', require('./routes/staff'));
  app.use('/api/sessions', require('./routes/sessions'));
  app.use('/api/coupons', require('./routes/coupons'));
  app.use('/api/tables', require('./routes/tables'));
  app.use('/api/payment-config', require('./routes/paymentConfig'));
  app.use('/api/audit', require('./routes/audit'));
  app.use('/api/token-sessions', require('./routes/tokenSessions'));
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/system', require('./routes/system'));

  const publicLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { success: false, message: 'Too many requests, please slow down.' },
  });
  app.use('/api/public', publicLimiter, require('./routes/public'));
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/search', require('./routes/search'));
  app.use('/api/inventory', require('./routes/inventory'));
  app.use('/api/raw-materials', require('./routes/rawMaterials'));
  app.use('/api/categories', require('./routes/categories'));
  app.use('/api/waiter', require('./routes/waiter'));
  app.use('/api/qrpayment', require('./routes/qrpayment'));

  app.get('/api/health', (req, res) => res.json({
    success: true,
    status: 'UTC Cafe API running',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  }));

  app.use((req, res, next) => {
    res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
  });

  app.use((err, req, res, next) => {
    if (process.env.NODE_ENV === 'production') {
      console.error(`[${new Date().toISOString()}] ${err.status || 500} — ${req.method} ${req.path} — ${err.message}`);
    } else if (process.env.NODE_ENV !== 'test') {
      console.error(err.stack);
    }

    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ success: false, message: messages[0], errors: messages });
    }
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      return res.status(409).json({ success: false, message: `Duplicate value for ${field}` });
    }
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }

    res.status(err.status || 500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : (err.message || 'Internal Server Error'),
    });
  });

  return app;
}

module.exports = { createApp };
