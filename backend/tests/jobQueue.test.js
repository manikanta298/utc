require('./helpers/testEnv');
const db = require('./helpers/db');

let Job, jobQueueService;

beforeAll(async () => {
  await db.connect();
  Job = require('../models/Job');
  jobQueueService = require('../services/jobQueueService');
});

afterEach(async () => {
  await db.clearDatabase();
});

afterAll(async () => {
  await db.closeDatabase();
});

describe('jobQueueService', () => {
  test('a job for an unregistered function fails the attempt and retries with backoff', async () => {
    const job = await jobQueueService.enqueueJob('sms', { fn: 'notARealFunction', args: [] });
    const processed = await jobQueueService.processOneJob();

    expect(processed._id.toString()).toBe(job._id.toString());
    expect(processed.status).toBe('pending'); // attempt 1 of 3, retried with backoff
    expect(processed.lastError).toMatch(/Unknown SMS function/);
    expect(processed.attempts).toBe(1);
    expect(processed.runAfter.getTime()).toBeGreaterThan(Date.now());
  });

  test('a job is marked failed permanently after exceeding maxAttempts', async () => {
    await jobQueueService.enqueueJob('sms', { fn: 'notARealFunction', args: [] }, { maxAttempts: 1 });

    const processed = await jobQueueService.processOneJob();
    expect(processed.attempts).toBe(1);
    expect(processed.status).toBe('failed'); // attempts (1) >= maxAttempts (1)
    expect(processed.completedAt).toBeDefined();
  });

  test('processPendingJobs processes multiple queued jobs in one tick', async () => {
    // SMS_ENABLED is not 'true' in test env, so sendSMS resolves success:true (dev-mode log, no real Twilio call)
    await jobQueueService.enqueueJob('sms', { fn: 'sendOrderPlaced', args: ['9876543210', 'Test', 'ORD-1', 1, 'UTC Cafe', '100.00'] });
    await jobQueueService.enqueueJob('sms', { fn: 'sendOrderReady', args: ['9876543211', 'Test2', 2, 'UTC Cafe'] });

    const processedCount = await jobQueueService.processPendingJobs();
    expect(processedCount).toBe(2);

    const completed = await Job.find({ status: 'completed' });
    expect(completed).toHaveLength(2);
  });

  test('processOneJob returns null when the queue is empty', async () => {
    const result = await jobQueueService.processOneJob();
    expect(result).toBeNull();
  });

  test('a job scheduled in the future is not picked up early', async () => {
    await Job.create({
      type: 'sms',
      payload: { fn: 'sendOrderPlaced', args: [] },
      runAfter: new Date(Date.now() + 60_000),
    });
    const result = await jobQueueService.processOneJob();
    expect(result).toBeNull();
  });
});
