/**
 * security.js — Additional security middleware
 * Input sanitisation, MongoDB injection prevention, parameter pollution protection
 */
const mongoose = require('mongoose');

/**
 * Sanitise request body/query/params to strip MongoDB operator injections
 * e.g. { "email": { "$gt": "" } } → stripped
 */
const sanitizeInput = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$')) {
      delete obj[key];
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      obj[key] = sanitizeInput(obj[key]);
    }
  }
  return obj;
};

const mongoSanitize = (req, res, next) => {
  if (req.body)   req.body   = sanitizeInput(JSON.parse(JSON.stringify(req.body)));
  if (req.query)  req.query  = sanitizeInput(JSON.parse(JSON.stringify(req.query)));
  if (req.params) req.params = sanitizeInput(JSON.parse(JSON.stringify(req.params)));
  next();
};

/**
 * Validate that any :id route param is a valid MongoDB ObjectId
 * Prevents CastError leaking to the client
 */
const validateObjectId = (paramName = 'id') => (req, res, next) => {
  const id = req.params[paramName];
  if (id && !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: `Invalid ${paramName} format` });
  }
  next();
};

/**
 * Prevent HTTP Parameter Pollution — keep only the last value for each key
 */
const preventParamPollution = (req, res, next) => {
  if (req.query) {
    for (const key of Object.keys(req.query)) {
      if (Array.isArray(req.query[key])) {
        req.query[key] = req.query[key][req.query[key].length - 1];
      }
    }
  }
  next();
};

/**
 * Security headers beyond helmet defaults
 */
const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
};

/**
 * Request size guard — enforce a hard limit on payload size per route type
 */
const guardRequestSize = (maxBytes = 1024 * 1024) => (req, res, next) => {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > maxBytes) {
    return res.status(413).json({ success: false, message: 'Payload too large' });
  }
  next();
};

module.exports = { mongoSanitize, validateObjectId, preventParamPollution, securityHeaders, guardRequestSize };
