const { getSystemHealth } = require('../services/systemHealthService');

// GET /api/system/health — detailed resource health, master_admin only
const getHealth = async (req, res) => {
  try {
    res.json({ success: true, health: getSystemHealth() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getHealth };
