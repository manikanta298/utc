/**
 * cluster.js — Multi-process load balancing
 *
 * Spawns one worker per CPU core. Each worker runs the full Express server.
 * The OS round-robins incoming TCP connections across workers.
 * If a worker crashes it is automatically restarted.
 *
 * Usage:
 *   NODE_ENV=production node cluster.js
 *
 * In development (or single-process environments like Render free tier):
 *   node server.js
 */

const cluster = require('cluster');
const os      = require('os');

// Allow overriding worker count via env (useful on constrained hosts)
const WORKERS = parseInt(process.env.CLUSTER_WORKERS || os.cpus().length, 10);

if (cluster.isPrimary) {
  console.log(`[Cluster] Primary ${process.pid} started. Spawning ${WORKERS} workers...`);

  for (let i = 0; i < WORKERS; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`[Cluster] Worker ${worker.process.pid} died (code=${code}, signal=${signal}). Restarting...`);
    // Brief delay before restart to prevent rapid-restart loops
    setTimeout(() => cluster.fork(), 1000);
  });

  cluster.on('online', (worker) => {
    console.log(`[Cluster] Worker ${worker.process.pid} online`);
  });

  // Graceful shutdown on SIGTERM
  process.on('SIGTERM', () => {
    console.log('[Cluster] SIGTERM received — shutting down workers...');
    for (const id in cluster.workers) {
      cluster.workers[id].kill('SIGTERM');
    }
    setTimeout(() => process.exit(0), 8000);
  });

} else {
  // Worker: run the full server
  require('./server');
}
