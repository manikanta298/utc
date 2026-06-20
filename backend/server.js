const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
require('dotenv').config();
const Order = require('./models/Order');
const cron = require('node-cron');
const { initSchema, watchOrderTracking, syncCustomersBatch } = require('./utils/cockroachSync');
const { mongoSanitize, preventParamPollution, securityHeaders } = require('./middleware/security');

// ── SECURITY: Fail fast if critical env vars are missing
const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[FATAL] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const app = express();
const server = http.createServer(app);

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
  // ── BUG FIX: expose X-Refresh-Token so the frontend interceptor can read it
  // Without this, browsers block JS access to the header → refresh token never
  // stored in localStorage → all token refresh calls fail with 401
  exposedHeaders: ['X-Refresh-Token'],
  maxAge: 86400, // cache preflight for 24h — reduces OPTIONS requests
};

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  allowEIO3: true,
  // ── PERFORMANCE: Enable connection state recovery (handles brief disconnects)
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 min
    skipMiddlewares: true,
  },
});

app.set('io', io);
app.set('trust proxy', 1);

// ── SECURITY: Helmet with strict CSP
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

// ── SECURITY: Additional headers
app.use(securityHeaders);

// ── SECURITY: MongoDB injection sanitisation
app.use(mongoSanitize);

// ── SECURITY: HTTP Parameter Pollution prevention
app.use(preventParamPollution);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  // Production: log only errors with minimal info (no sensitive data)
  app.use(morgan('combined', {
    skip: (req, res) => res.statusCode < 400,
  }));
}

// ── RATE LIMITING
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/seed-demo',
  message: { success: false, message: 'Too many authentication attempts. Please try again later.' },
});

// General API rate limiter — 300 req/min per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health',
  message: { success: false, message: 'Too many requests, please slow down.' },
});
app.use('/api', apiLimiter);

// ── ROUTES
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

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many requests, please slow down.' },
});
app.use('/api/public', publicLimiter, require('./routes/public'));
app.use('/api/reports',       require('./routes/reports'));
app.use('/api/search',        require('./routes/search'));
app.use('/api/inventory',     require('./routes/inventory'));
app.use('/api/raw-materials', require('./routes/rawMaterials'));
app.use('/api/categories',    require('./routes/categories'));
app.use('/api/waiter',        require('./routes/waiter'));
app.use('/api/qrpayment',     require('./routes/qrpayment'));

// ── HEALTH CHECK
app.get('/api/health', (req, res) => res.json({
  success: true,
  status: 'UTC Cafe API running',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
  version: process.env.npm_package_version || '1.0.0',
}));

// ── 404 handler — catch unmatched routes before global error handler
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ── GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  // Don't leak stack traces in production
  if (process.env.NODE_ENV === 'production') {
    console.error(`[${new Date().toISOString()}] ${err.status || 500} — ${req.method} ${req.path} — ${err.message}`);
  } else {
    console.error(err.stack);
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ success: false, message: messages[0], errors: messages });
  }

  // Handle Mongoose duplicate key errors
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ success: false, message: `Duplicate value for ${field}` });
  }

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  }

  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : (err.message || 'Internal Server Error'),
  });
});

// ── SOCKET.IO handlers
io.on('connection', (socket) => {
  const socketRooms = new Map();

  const joinRoom = (event, roomName, payload) => {
    socket.join(roomName);
    socketRooms.set(event, payload);
  };

  socket.on('join:franchise', (franchiseId) => {
    if (!franchiseId) return;
    console.log(`[socket] ${socket.id} → join:franchise:${franchiseId}`);
    joinRoom('join:franchise', `franchise:${franchiseId}`, franchiseId);
  });
  socket.on('join:pos', (franchiseId) => {
    if (!franchiseId) return;
    console.log(`[socket] ${socket.id} → join:pos:${franchiseId}`);
    joinRoom('join:pos', `pos:${franchiseId}`, franchiseId);
    socket.join(`franchise:${franchiseId}`);
  });
  socket.on('join:waiter', (franchiseId) => {
    if (!franchiseId) return;
    console.log(`[socket] ${socket.id} -> join:waiter:${franchiseId}`);
    joinRoom('join:waiter', `waiter:${franchiseId}`, franchiseId);
    socket.join(`franchise:${franchiseId}`);
  });
  socket.on('join:display', (franchiseId) => {
    if (!franchiseId) return;
    joinRoom('join:display', `display:${franchiseId}`, franchiseId);
  });
  socket.on('join:admin', () => {
    joinRoom('join:admin', 'admin', null);
  });
  socket.on('join:tables', (franchiseId) => {
    if (!franchiseId) return;
    joinRoom('join:tables', `tables:${franchiseId}`, franchiseId);
    socket.join(`franchise:${franchiseId}`);
  });
  socket.on('join:customer', (franchiseId) => {
    if (!franchiseId) return;
    joinRoom('join:customer', `customer:${franchiseId}`, franchiseId);
  });

  // Re-join all rooms after reconnect
  socket.on('rejoin', (rooms) => {
    if (Array.isArray(rooms)) {
      rooms.forEach(({ event, payload }) => {
        socket.emit(event, payload);
      });
    }
  });

  // Kitchen marks token ready -> display board + POS
  socket.on('token:ready', ({ franchiseId, tokenNumber, tableNumber }) => {
    if (!franchiseId) return;
    io.to(`display:${franchiseId}`).emit('token:announce', { tokenNumber, tableNumber });
    io.to(`pos:${franchiseId}`).emit('token:announce', { tokenNumber, tableNumber });
  });

  socket.on('disconnect', () => {
    socketRooms.clear();
  });
});

// ── ARCHIVE CRON
const { startArchiveCron } = require('./jobs/archiveOrders');
startArchiveCron();

// ── DB CONNECTION & SERVER START
const PORT = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    // ── PERFORMANCE: Enable read preference for secondaries where possible
    readPreference: 'primaryPreferred',
  })
  .then(async () => {
    console.log('MongoDB connected');

    // Drop legacy indexes
    const legacyIndexes = [
      { col: 'ordersessions', name: 'tokenNumber_1' },
      { col: 'ordersessions', name: 'franchiseId_1_tokenNumber_1' },
      { col: 'ordersessions', name: 'franchiseId_tokenNumber_partial_unique' },
    ];
    for (const { col, name } of legacyIndexes) {
      try {
        await mongoose.connection.collection(col).dropIndex(name);
        console.log(`Dropped index: ${col}.${name}`);
      } catch (e) {
        if (e.codeName !== 'IndexNotFound') console.warn(`Drop ${name} skipped:`, e.message);
      }
    }

    // Backfill: archive old orders
    Order.updateMany(
      { createdAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, archivedAt: null },
      { $set: { archivedAt: new Date() } }
    ).catch((err) => console.error('Order archive backfill failed:', err.message));

    // ── CockroachDB: downstream sync, never blocks MongoDB/app startup
    try {
      await initSchema();
      watchOrderTracking();
      cron.schedule('*/5 * * * *', syncCustomersBatch); // every 5 minutes
      syncCustomersBatch(); // also run once at startup
    } catch (err) {
      console.error('[CockroachDB] setup failed (app continues on MongoDB regardless):', err.message);
    }

    server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });

// ── GRACEFUL SHUTDOWN
const shutdown = (signal) => {
  console.log(`[Shutdown] Received ${signal}. Closing server...`);
  server.close(() => {
    mongoose.connection.close(false).then(() => {
      console.log('[Shutdown] MongoDB connection closed. Bye!');
      process.exit(0);
    });
  });
  // Force exit after 10s if graceful fails
  setTimeout(() => process.exit(1), 10000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ── UNHANDLED REJECTIONS
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UnhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]', err.message, err.stack);
  // Don't crash on non-fatal uncaught exceptions, but log them
});
