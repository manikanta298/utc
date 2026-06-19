const MenuItem = require('../models/MenuItem');
const { logAudit } = require('../utils/auditHelper');

// GET /api/inventory  — all items with stock info
const getInventory = async (req, res) => {
  try {
    const { category, stockAlert } = req.query;
    const filter = {};
    if (category && category !== 'All') filter.category = category;

    let items = await MenuItem.find(filter).sort({ category: 1, sortOrder: 1, name: 1 });

    if (stockAlert === 'true') {
      items = items.filter(
        (i) => i.stock_enabled && i.stock_qty <= i.low_stock_threshold
      );
    }

    // Attach stock status
    const enriched = items.map((item) => {
      const obj = item.toObject();
      if (!obj.stock_enabled) obj.stock_status = 'untracked';
      else if (obj.stock_qty === 0) obj.stock_status = 'out';
      else if (obj.stock_qty <= obj.low_stock_threshold) obj.stock_status = 'low';
      else obj.stock_status = 'ok';
      return obj;
    });

    const summary = {
      total:     enriched.length,
      tracked:   enriched.filter((i) => i.stock_enabled).length,
      low:       enriched.filter((i) => i.stock_status === 'low').length,
      out:       enriched.filter((i) => i.stock_status === 'out').length,
    };

    res.json({ success: true, items: enriched, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/inventory/:id/stock  — update stock qty for one item
const updateStock = async (req, res) => {
  try {
    const { stock_qty, stock_enabled, unit, low_stock_threshold, adjustment, reason } = req.body;
    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    const prevQty = item.stock_qty;

    if (stock_enabled !== undefined) item.stock_enabled = stock_enabled;
    if (unit !== undefined) item.unit = unit;
    if (low_stock_threshold !== undefined) item.low_stock_threshold = Number(low_stock_threshold);

    if (adjustment !== undefined) {
      // Relative: +10 or -5
      item.stock_qty = Math.max(0, item.stock_qty + Number(adjustment));
    } else if (stock_qty !== undefined) {
      // Absolute set
      item.stock_qty = Math.max(0, Number(stock_qty));
    }

    await item.save();

    await logAudit('STOCK_UPDATED', req, item._id, 'MenuItem', {
      itemName: item.name,
      prevQty,
      newQty: item.stock_qty,
      reason: reason || '',
    });

    const obj = item.toObject();
    if (!obj.stock_enabled) obj.stock_status = 'untracked';
    else if (obj.stock_qty === 0) obj.stock_status = 'out';
    else if (obj.stock_qty <= obj.low_stock_threshold) obj.stock_status = 'low';
    else obj.stock_status = 'ok';

    res.json({ success: true, item: obj });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/inventory/bulk-stock  — bulk stock update
const bulkUpdateStock = async (req, res) => {
  try {
    const { updates } = req.body; // [{ itemId, stock_qty, unit, low_stock_threshold }]
    if (!Array.isArray(updates) || !updates.length) {
      return res.status(400).json({ success: false, message: 'updates array required' });
    }

    const results = [];
    for (const u of updates) {
      const item = await MenuItem.findById(u.itemId);
      if (!item) continue;
      if (u.stock_qty !== undefined) item.stock_qty = Math.max(0, Number(u.stock_qty));
      if (u.unit) item.unit = u.unit;
      if (u.low_stock_threshold !== undefined) item.low_stock_threshold = Number(u.low_stock_threshold);
      await item.save();
      results.push(item._id);
    }

    await logAudit('BULK_STOCK_UPDATE', req, null, 'MenuItem', { updatedCount: results.length });
    res.json({ success: true, updatedCount: results.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getInventory, updateStock, bulkUpdateStock, createItem, updateItem, deleteItem };

// POST /api/inventory/items
async function createItem(req, res) {
  try {
    const {
      name, category, price, gst_rate, hsn_code, isVeg,
      preparationTime, stock_enabled, stock_qty, unit, low_stock_threshold, description,
    } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Name required' });
    if (!category?.trim()) return res.status(400).json({ success: false, message: 'Category required' });
    if (!price || price < 0) return res.status(400).json({ success: false, message: 'Valid price required' });

    const item = await MenuItem.create({
      name: name.trim(),
      category: category.trim(),
      price: Number(price),
      gst_rate: Number(gst_rate) || 5,
      hsn_code: hsn_code?.trim() || '',
      description: description?.trim() || '',
      isVeg: isVeg !== false,
      preparationTime: Number(preparationTime) || 10,
      stock_enabled: stock_enabled || false,
      stock_qty: Number(stock_qty) || 0,
      unit: unit || 'pcs',
      low_stock_threshold: Number(low_stock_threshold) || 10,
      isGlobalActive: true,
    });

    await logAudit('ITEM_CREATED', req, item._id, 'MenuItem', { name: item.name, price: item.price });
    res.status(201).json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// PUT /api/inventory/items/:id
async function updateItem(req, res) {
  try {
    const {
      name, category, price, gst_rate, hsn_code, isVeg,
      preparationTime, isGlobalActive, description,
    } = req.body;

    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    if (name !== undefined)            item.name            = name.trim();
    if (category !== undefined)        item.category        = category.trim();
    if (price !== undefined)           item.price           = Number(price);
    if (gst_rate !== undefined)        item.gst_rate        = Number(gst_rate);
    if (hsn_code !== undefined)        item.hsn_code        = hsn_code.trim();
    if (description !== undefined)     item.description     = description.trim();
    if (isVeg !== undefined)           item.isVeg           = isVeg;
    if (preparationTime !== undefined) item.preparationTime = Number(preparationTime);
    if (isGlobalActive !== undefined)  item.isGlobalActive  = isGlobalActive;

    await item.save();
    await logAudit('ITEM_UPDATED', req, item._id, 'MenuItem', { name: item.name, price: item.price });
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// DELETE /api/inventory/items/:id
async function deleteItem(req, res) {
  try {
    const item = await MenuItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    await logAudit('ITEM_DELETED', req, req.params.id, 'MenuItem', { name: item.name });
    res.json({ success: true, message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
