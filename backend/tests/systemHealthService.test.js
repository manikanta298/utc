const { getSystemHealth } = require('../services/systemHealthService');

describe('systemHealthService — getSystemHealth', () => {
  test('returns sensible memory, system, and mongo fields', () => {
    const health = getSystemHealth();

    expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(health.memory.heapUsedMB).toBeGreaterThan(0);
    expect(health.memory.heapTotalMB).toBeGreaterThan(0);
    expect(health.memory.heapUsedPercent).toBeGreaterThanOrEqual(0);
    expect(health.memory.heapUsedPercent).toBeLessThanOrEqual(100);
    expect(Array.isArray(health.system.loadAverage)).toBe(true);
    expect(health.system.cpuCount).toBeGreaterThan(0);
    expect(['connected', 'disconnected', 'connecting', 'disconnecting', 'unknown']).toContain(health.mongo.state);
  });
});
