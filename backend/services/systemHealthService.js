const os = require('os');
const mongoose = require('mongoose');
const { sendSecurityAlert } = require('../utils/securityAlert');

const MEMORY_ALERT_THRESHOLD_PERCENT = 85;

const MONGO_STATES = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

function getSystemHealth() {
  const mem = process.memoryUsage();
  const heapUsedMB = +(mem.heapUsed / 1024 / 1024).toFixed(1);
  const heapTotalMB = +(mem.heapTotal / 1024 / 1024).toFixed(1);

  return {
    uptimeSeconds: Math.round(process.uptime()),
    memory: {
      rssMB: +(mem.rss / 1024 / 1024).toFixed(1),
      heapUsedMB,
      heapTotalMB,
      heapUsedPercent: heapTotalMB ? +((heapUsedMB / heapTotalMB) * 100).toFixed(1) : 0,
    },
    system: {
      loadAverage: os.loadavg(),
      freeMemoryMB: +(os.freemem() / 1024 / 1024).toFixed(1),
      totalMemoryMB: +(os.totalmem() / 1024 / 1024).toFixed(1),
      cpuCount: os.cpus().length,
    },
    mongo: {
      state: MONGO_STATES[mongoose.connection.readyState] || 'unknown',
    },
  };
}

/** Called periodically (see server.js cron). Logs + alerts (throttled) if
 * memory usage crosses the threshold — doesn't throw, never affects the app. */
async function checkResourceThresholds() {
  const health = getSystemHealth();

  if (health.memory.heapUsedPercent > MEMORY_ALERT_THRESHOLD_PERCENT) {
    console.warn(`[systemHealth] High memory usage: ${health.memory.heapUsedPercent}% (${health.memory.heapUsedMB}MB / ${health.memory.heapTotalMB}MB)`);
    sendSecurityAlert(
      'high-memory',
      'High memory usage detected',
      `<p>Heap usage at <strong>${health.memory.heapUsedPercent}%</strong> (${health.memory.heapUsedMB}MB / ${health.memory.heapTotalMB}MB).</p>
       <p>Uptime: ${Math.round(health.uptimeSeconds / 60)} minutes. Mongo: ${health.mongo.state}.</p>`
    ).catch((e) => console.error('[systemHealth] alert send error:', e.message));
  }

  if (health.mongo.state !== 'connected') {
    console.warn(`[systemHealth] MongoDB connection state: ${health.mongo.state}`);
    sendSecurityAlert(
      'mongo-disconnected',
      'MongoDB connection lost',
      `<p>MongoDB connection state is currently <strong>${health.mongo.state}</strong>.</p>`
    ).catch((e) => console.error('[systemHealth] alert send error:', e.message));
  }

  return health;
}

module.exports = { getSystemHealth, checkResourceThresholds, MEMORY_ALERT_THRESHOLD_PERCENT };
