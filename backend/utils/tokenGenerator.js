const TokenCounter = require('../models/TokenCounter');

const generateToken = async (franchiseId) => {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const counter = await TokenCounter.findOneAndUpdate(
    { franchiseId, date: today },
    { $inc: { lastToken: 1 } },
    { upsert: true, new: true }
  );
  return `TOKEN-${counter.lastToken}`;
};

const generateSessionRef = (franchiseCode, tokenNumber, date) => {
  const d = date || new Date().toISOString().split('T')[0].replace(/-/g, '');
  const num = tokenNumber.replace('TOKEN-', '');
  return `${franchiseCode}-SES-${d}-${num}`;
};

module.exports = { generateToken, generateSessionRef };
