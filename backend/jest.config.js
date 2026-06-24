module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 30000, // mongodb-memory-server's first download/boot can be slow
  verbose: true,
};
