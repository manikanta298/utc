const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
require('dotenv').config();
const Order = require('./models/Order');
const cron = require('node-cron');
const { initSchema, watchOrderTracking, syncCustomersBatch } = require('./utils/cockroachSync');
const { processPendingJobs } = require('./services/jobQueueService');
const { checkResourceThresholds } = require('./services/systemHealthService');
const { createApp } = require('./app');

// ── SECURITY: Fail fast if critical env vars are missing
const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[FATAL] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const app = createApp();
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

app.set('io', io); // overwrite the no-op stub from createApp() with the real one

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
      // Superseded by better-ordered/more precise compound indexes — see models/Order.js
      { col: 'orders', name: 'kitchen_status_1_franchise_id_1' },
      { col: 'orders', name: 'customer_id_1' },
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

    // ── Background job queue: SMS sending, retried with backoff on failure
    cron.schedule('*/15 * * * * *', () => {
      processPendingJobs().catch((err) => console.error('[jobQueue] tick failed:', err.message));
    });
    processPendingJobs().catch((err) => console.error('[jobQueue] startup run failed:', err.message));

    // ── Resource monitoring: memory + Mongo connection state, every 5 minutes
    cron.schedule('*/5 * * * *', () => {
      checkResourceThresholds().catch((err) => console.error('[systemHealth] check failed:', err.message));
    });

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
