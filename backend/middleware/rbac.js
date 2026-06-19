// ── BUG FIX: rbac.js was appended at the bottom of auth.js — extracted to its own file
const ROLE_ALIASES = {
  pos_shift_operator: 'shift_operator',
};

const normalizeRole = (role) => ROLE_ALIASES[role] || role;

const checkRole = (...allowedRoles) => {
  const normalizedAllowedRoles = allowedRoles.map(normalizeRole);

  return (req, res, next) => {
    const userRole = normalizeRole(req.user?.role);

    if (!userRole || !normalizedAllowedRoles.includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    next();
  };
};

module.exports = { checkRole, normalizeRole };
