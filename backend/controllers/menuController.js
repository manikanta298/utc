const MenuItem = require('../models/MenuItem');
const { uploadMenuImage, deleteImage } = require('../utils/cloudinary');

// @GET /api/menu  — All menu items (filtered by franchise availability)
const getMenu = async (req, res) => {
  try {
    const { category, franchiseId } = req.query;
    const filter = { isGlobalActive: true };
    if (category) filter.category = category;

    let items = await MenuItem.find(filter).sort({ category: 1, sortOrder: 1, name: 1 });

    // Filter out items disabled at this franchise
    const fId = franchiseId || (req.user?.franchise_id?._id || req.user?.franchise_id)?.toString();
    if (fId) {
      items = items.filter((item) => !item.disabledInFranchises.map(String).includes(fId));
    }

    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @GET /api/menu/all  — Master Admin — all items including inactive
const getAllMenu = async (req, res) => {
  try {
    const filter = req.user.role === 'master_admin' ? {} : { isGlobalActive: true };
    const items = await MenuItem.find(filter).sort({ category: 1, sortOrder: 1, name: 1 });
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @POST /api/menu  — Master Admin creates item
const createMenuItem = async (req, res) => {
  uploadMenuImage(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    try {
      const { name, description, category, price, gst_rate, hsn_code, isVeg,
              preparationTime, isGlobalActive, sortOrder, stock_enabled, stock_qty, unit, low_stock_threshold } = req.body;
      const imageData = req.file
        ? { url: req.file.path, public_id: req.file.filename }
        : { url: '', public_id: '' };

      const item = await MenuItem.create({
        name, description, category,
        price: Number(price),
        gst_rate: Number(gst_rate),
        hsn_code,
        image: imageData,
        isVeg: isVeg !== 'false',
        isGlobalActive: isGlobalActive === 'false' || isGlobalActive === false ? false : true,
        preparationTime: Number(preparationTime) || 10,
        sortOrder: Number(sortOrder) || 0,
        stock_enabled: stock_enabled === 'true' || stock_enabled === true,
        stock_qty: Number(stock_qty) || 0,
        unit: unit || 'pcs',
        low_stock_threshold: Number(low_stock_threshold) || 10,
      });
      res.status(201).json({ success: true, item });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });
};

// @PUT /api/menu/:id  — Master Admin updates item
const updateMenuItem = async (req, res) => {
  uploadMenuImage(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    try {
      const item = await MenuItem.findById(req.params.id);
      if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

      const { name, description, category, price, gst_rate, hsn_code, isVeg,
              preparationTime, isGlobalActive, sortOrder,
              stock_enabled, stock_qty, unit, low_stock_threshold } = req.body;

      if (name !== undefined) item.name = name;
      if (description !== undefined) item.description = description;
      if (category !== undefined) item.category = category;
      if (price !== undefined) item.price = Number(price);
      if (gst_rate !== undefined) item.gst_rate = Number(gst_rate);
      if (hsn_code !== undefined) item.hsn_code = hsn_code;
      if (isVeg !== undefined) item.isVeg = isVeg !== 'false';
      if (preparationTime !== undefined) item.preparationTime = Number(preparationTime);
      if (isGlobalActive !== undefined) item.isGlobalActive = isGlobalActive === 'true' || isGlobalActive === true;
      if (sortOrder !== undefined) item.sortOrder = Number(sortOrder);
      if (stock_enabled !== undefined) item.stock_enabled = stock_enabled === 'true' || stock_enabled === true;
      if (stock_qty !== undefined) item.stock_qty = Math.max(0, Number(stock_qty));
      if (unit !== undefined) item.unit = unit;
      if (low_stock_threshold !== undefined) item.low_stock_threshold = Number(low_stock_threshold);

      if (req.file) {
        // Delete old image from Cloudinary
        if (item.image?.public_id) await deleteImage(item.image.public_id);
        item.image = { url: req.file.path, public_id: req.file.filename };
      }

      await item.save();
      const io = req.app.get('io');
      if (io) { io.emit('menu:globalUpdate', { itemId: item._id, isGlobalActive: item.isGlobalActive, item }); }
      res.json({ success: true, item });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });
};

// @DELETE /api/menu/:id  — Master Admin deletes item
const deleteMenuItem = async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    if (item.image?.public_id) await deleteImage(item.image.public_id);
    await item.deleteOne();
    res.json({ success: true, message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @PUT /api/menu/:id/toggle-franchise  — Franchise owner toggles item for their outlet
const toggleFranchiseItem = async (req, res) => {
  try {
    const franchiseId = (req.user.franchise_id._id || req.user.franchise_id).toString();
    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

    const idx = item.disabledInFranchises.map(String).indexOf(franchiseId);
    if (idx === -1) {
      item.disabledInFranchises.push(franchiseId); // disable
    } else {
      item.disabledInFranchises.splice(idx, 1); // enable
    }
    await item.save();
    const isEnabled = !item.disabledInFranchises.map(String).includes(franchiseId);
    const io = req.app.get('io');
    io.to(`franchise:${franchiseId}`).to(`pos:${franchiseId}`).emit('menu:availability', {
      itemId: item._id,
      isEnabled,
      item,
    });
    res.json({ success: true, item, isEnabled });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /menu/:id/global-toggle — master admin quick active/inactive flip
const toggleGlobalActive = async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    item.isGlobalActive = !item.isGlobalActive;
    await item.save();
    const io = req.app.get('io');
    if (io) io.emit('menu:globalUpdate', { itemId: item._id, isGlobalActive: item.isGlobalActive, item });
    res.json({ success: true, item, isGlobalActive: item.isGlobalActive });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getMenu, getAllMenu, createMenuItem, updateMenuItem, deleteMenuItem, toggleFranchiseItem, toggleGlobalActive };
