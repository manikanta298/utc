const RawMaterial = require('../models/RawMaterial');
const { logAudit } = require('../utils/auditHelper');

const getFranchiseId = (req) =>
  (req.user.franchise_id?._id || req.user.franchise_id)?.toString();

// GET /api/raw-materials
const getAll = async (req, res) => {
  try {
    const franchiseId = getFranchiseId(req);
    const { category, stockAlert } = req.query;
    const filter = { franchiseId, isActive: true };
    if (category && category !== 'All') filter.category = category;

    let items = await RawMaterial.find(filter).sort({ category: 1, name: 1 });
    if (stockAlert === 'true') {
      items = items.filter((i) => i.stockStatus === 'low' || i.stockStatus === 'out');
    }

    const summary = {
      total:   items.length,
      low:     items.filter((i) => i.stockStatus === 'low').length,
      out:     items.filter((i) => i.stockStatus === 'out').length,
      ok:      items.filter((i) => i.stockStatus === 'ok').length,
    };
    res.json({ success: true, items, summary });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// POST /api/raw-materials
const create = async (req, res) => {
  try {
    const franchiseId = getFranchiseId(req);
    const { name, category, unit, currentStock, minStock, costPerUnit } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required' });

    const item = await RawMaterial.create({
      franchiseId, name, category: category || 'General',
      unit: unit || 'kg', currentStock: currentStock || 0,
      minStock: minStock || 1, costPerUnit: costPerUnit || 0,
    });
    await logAudit('RAW_MATERIAL_CREATED', req, item._id, 'RawMaterial', { name });
    res.status(201).json({ success: true, item });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// PATCH /api/raw-materials/:id/stock  — kitchen staff / pos adds usage or purchase
const updateStock = async (req, res) => {
  try {
    const { type, qty, reason, supplier, costPerUnit } = req.body;
    // type: 'usage' | 'purchase'
    if (!['usage', 'purchase'].includes(type)) {
      return res.status(400).json({ success: false, message: 'type must be usage or purchase' });
    }
    const item = await RawMaterial.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });

    const franchiseId = getFranchiseId(req);
    if (item.franchiseId.toString() !== franchiseId && req.user.role !== 'master_admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const amount = Math.abs(Number(qty));
    if (!amount) return res.status(400).json({ success: false, message: 'qty required' });

    const isOwnerOrAdmin = ['master_admin', 'franchise_owner', 'manager'].includes(req.user.role);

    if (type === 'usage') {
      if (item.currentStock < amount) {
        return res.status(400).json({ success: false, message: 'Insufficient stock' });
      }
      item.currentStock = Math.max(0, item.currentStock - amount);
      item.usageLogs.push({
        qtyUsed: amount,
        usedBy: req.user._id,
        role: req.user.role,
        reason: reason || '',
        // Auto-approve if owner/manager; else pending
        status: isOwnerOrAdmin ? 'approved' : 'pending',
        approvedBy: isOwnerOrAdmin ? req.user._id : null,
        approvedAt: isOwnerOrAdmin ? new Date() : null,
      });
    } else {
      // purchase — add stock
      const cost = Number(costPerUnit) || item.costPerUnit || 0;
      item.currentStock += amount;
      if (costPerUnit) item.costPerUnit = cost;
      item.purchaseLogs.push({
        qty: amount,
        costPerUnit: cost,
        totalCost: cost * amount,
        supplier: supplier || '',
        addedBy: req.user._id,
      });
    }

    await item.save();
    const io = req.app.get('io');
    if (io) {
      io.to(`franchise:${franchiseId}`).emit('stock:updated', {
        itemId: item._id,
        name: item.name,
        currentStock: item.currentStock,
        stockStatus: item.stockStatus,
        type,
      });
    }
    await logAudit('STOCK_' + type.toUpperCase(), req, item._id, 'RawMaterial', { amount, reason });
    res.json({ success: true, item });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// GET /api/raw-materials/daily-usage  — owner sees today's usage pending approval
const getDailyUsage = async (req, res) => {
  try {
    const franchiseId = getFranchiseId(req);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const items = await RawMaterial.find({ franchiseId })
      .populate('usageLogs.usedBy', 'name role')
      .populate('usageLogs.approvedBy', 'name');

    const report = [];
    items.forEach((item) => {
      const todayLogs = item.usageLogs.filter((l) => new Date(l.date) >= today);
      if (todayLogs.length) {
        report.push({
          itemId: item._id,
          name: item.name,
          unit: item.unit,
          currentStock: item.currentStock,
          stockStatus: item.stockStatus,
          todayUsage: todayLogs.reduce((s, l) => s + l.qtyUsed, 0),
          pendingCount: todayLogs.filter((l) => l.status === 'pending').length,
          logs: todayLogs,
        });
      }
    });
    res.json({ success: true, report });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// PATCH /api/raw-materials/:id/approve-usage/:logId
const approveUsage = async (req, res) => {
  try {
    const { action } = req.body; // 'approved' | 'rejected'
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be approved or rejected' });
    }
    const item = await RawMaterial.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });

    const log = item.usageLogs.id(req.params.logId);
    if (!log) return res.status(404).json({ success: false, message: 'Log not found' });

    log.status = action;
    log.approvedBy = req.user._id;
    log.approvedAt = new Date();

    // If rejected, restore stock
    if (action === 'rejected') {
      item.currentStock += log.qtyUsed;
    }

    await item.save();
    res.json({ success: true, item });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// DELETE /api/raw-materials/:id
const remove = async (req, res) => {
  try {
    const item = await RawMaterial.findByIdAndUpdate(req.params.id, { isActive: false });
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// PUT /api/raw-materials/:id
const update = async (req, res) => {
  try {
    const { name, category, unit, minStock, costPerUnit } = req.body;
    const item = await RawMaterial.findByIdAndUpdate(
      req.params.id,
      { name, category, unit, minStock, costPerUnit },
      { new: true }
    );
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, item });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = { getAll, create, updateStock, getDailyUsage, approveUsage, remove, update };
