const Job = require('../models/Job');
const smsFunctions = require('../utils/sms');

// Each handler receives the job's payload and either resolves (success,
// job marked completed) or throws (failure, retried with backoff up to
// maxAttempts, then marked failed).
const HANDLERS = {
  sms: async (payload) => {
    const fn = smsFunctions[payload.fn];
    if (typeof fn !== 'function') throw new Error(`Unknown SMS function: ${payload.fn}`);
    const result = await fn(...payload.args);
    // sendSMS() catches its own errors and returns { success: false } rather
    // than throwing (so a single bad send never crashes the order/kitchen
    // flow that originally called it inline) — translate that back into a
    // thrown error here so the job queue's retry logic actually kicks in.
    if (result && result.success === false) {
      throw new Error(result.error || 'SMS send failed');
    }
    return result;
  },
};

const BACKOFF_MS = [10_000, 60_000, 5 * 60_000]; // 10s, 1min, 5min

async function enqueueJob(type, payload, { maxAttempts = 3 } = {}) {
  return Job.create({ type, payload, maxAttempts });
}

async function claimNextJob() {
  return Job.findOneAndUpdate(
    { status: 'pending', runAfter: { $lte: new Date() } },
    { $set: { status: 'processing' }, $inc: { attempts: 1 } },
    { sort: { runAfter: 1 }, new: true }
  );
}

async function processOneJob() {
  const job = await claimNextJob();
  if (!job) return null;

  const handler = HANDLERS[job.type];
  try {
    if (!handler) throw new Error(`No handler registered for job type: ${job.type}`);
    await handler(job.payload);
    job.status = 'completed';
    job.completedAt = new Date();
    await job.save();
  } catch (err) {
    if (job.attempts >= job.maxAttempts) {
      job.status = 'failed';
      job.lastError = err.message;
      job.completedAt = new Date();
      console.error(`[jobQueue] job ${job._id} (${job.type}) failed permanently after ${job.attempts} attempts:`, err.message);
    } else {
      job.status = 'pending';
      job.lastError = err.message;
      job.runAfter = new Date(Date.now() + BACKOFF_MS[Math.min(job.attempts - 1, BACKOFF_MS.length - 1)]);
      console.warn(`[jobQueue] job ${job._id} (${job.type}) attempt ${job.attempts} failed, retrying:`, err.message);
    }
    await job.save();
  }
  return job;
}

async function processPendingJobs({ maxJobsPerTick = 10 } = {}) {
  let processed = 0;
  for (let i = 0; i < maxJobsPerTick; i++) {
    const job = await processOneJob();
    if (!job) break;
    processed++;
  }
  return processed;
}

module.exports = { enqueueJob, processOneJob, processPendingJobs };
