const { isLocked, lockRemainingMs, MAX_FAILED_ATTEMPTS, LOCK_DURATION_MS } = require('../services/authSecurityService');

describe('authSecurityService — isLocked / lockRemainingMs', () => {
  test('a user with no lockUntil is not locked', () => {
    expect(isLocked({ lockUntil: null })).toBe(false);
  });

  test('a user with a future lockUntil is locked', () => {
    const user = { lockUntil: new Date(Date.now() + 60_000) };
    expect(isLocked(user)).toBe(true);
    expect(lockRemainingMs(user)).toBeGreaterThan(0);
    expect(lockRemainingMs(user)).toBeLessThanOrEqual(60_000);
  });

  test('a user with a past lockUntil is no longer locked', () => {
    const user = { lockUntil: new Date(Date.now() - 1000) };
    expect(isLocked(user)).toBe(false);
    expect(lockRemainingMs(user)).toBe(0);
  });

  test('exports sensible constants', () => {
    expect(MAX_FAILED_ATTEMPTS).toBeGreaterThan(0);
    expect(LOCK_DURATION_MS).toBeGreaterThan(0);
  });
});
