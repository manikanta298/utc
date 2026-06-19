const Franchise = require('../models/Franchise');

const enforceActiveFranchise = async (req, res, next) => {
  if (!req.user || req.user.role === 'master_admin') return next();

  const franchiseId = req.user.franchise_id?._id || req.user.franchise_id;
  if (!franchiseId) return next();

  try {
    const franchise = await Franchise.findById(franchiseId).select('status isActive name');
    if (!franchise) {
      return res.status(403).json({
        success: false,
        code: 'FRANCHISE_NOT_FOUND',
        message: 'Franchise not found. Contact your administrator.',
      });
    }

    // Normalise: if status field missing/null, fall back to isActive boolean.
    // Old DB documents may only have isActive=true without a status string.
    const status = franchise.status || (franchise.isActive !== false ? 'active' : 'inactive');

    if (status === 'archived') {
      return res.status(403).json({
        success: false,
        code: 'FRANCHISE_ARCHIVED',
        message: `Franchise "${franchise.name}" has been archived. Contact master admin.`,
      });
    }

    if (status !== 'active') {
      return res.status(403).json({
        success: false,
        code: 'FRANCHISE_INACTIVE',
        // FIX: clearer message so UI can show proper guidance instead of generic 403
        message: `Franchise "${franchise.name}" is inactive. Ask your master admin to activate it from the Franchises page.`,
      });
    }

    req.franchise = franchise;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { enforceActiveFranchise };
