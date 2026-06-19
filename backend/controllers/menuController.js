const MenuItem = require('../models/MenuItem');
const { uploadMenuImage, saveMenuImage, deleteImage, withSignedUrl, withSignedUrls } = require('../utils/gcsUpload');

// @GET /api/menu  — All menu items (filtered by franchise availability)
const getMenu = async (req, res) => {
  try {
    const { category, franchiseId } = req.query;
    const filter = { isGlobalActive: true };
    if (category) filter.category = category;

    let items = await MenuItem.find(filter);
    items.sort((a, b) => a.category.localeCompare(b.category) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    // Filter out items disabled at this franchise
    const fId = franchiseId || (req.user?.franchise_id?._id || req.user?.franchise_id)?.toString();
    if (fId) {
      items = items.filter((item) => !(item.disabledInFranchises || []).map(String).includes(fId));
    }

    items = await withSignedUrls(items);
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @GET /api/menu/all  — Master Admin — all items including inactive
const getAllMenu = async (req, res) => {
  try {
    const filter = req.user.role === 'master_admin' ? {} : { isGlobalActive: true };
    let items = await MenuItem.find(filter);
    items.sort((a, b) => a.category.localeCompare(b.category) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    items = await withSignedUrls(items);
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
        ? await saveMenuImage(req.file.buffer, req.file.originalname)
        : { object_path: '' };

      let item = await MenuItem.create({
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
      item = await withSignedUrl(item);
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
      const existing = await MenuItem.findById(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Item not found' });

      const { name, description, category, price, gst_rate, hsn_code, isVeg,
              preparationTime, isGlobalActive, sortOrder,
              stock_enabled, stock_qty, unit, low_stock_threshold } = req.body;

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (category !== undefined) updates.category = category;
      if (price !== undefined) updates.price = Number(price);
      if (gst_rate !== undefined) updates.gst_rate = Number(gst_rate);
      if (hsn_code !== undefined) updates.hsn_code = hsn_code;
      if (isVeg !== undefined) updates.isVeg = isVeg !== 'false';
      if (preparationTime !== undefined) updates.preparationTime = Number(preparationTime);
      if (isGlobalActive !== undefined) updates.isGlobalActive = isGlobalActive === 'true' || isGlobalActive === true;
      if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);
      if (stock_enabled !== undefined) updates.stock_enabled = stock_enabled === 'true' || stock_enabled === true;
      if (stock_qty !== undefined) updates.stock_qty = Math.max(0, Number(stock_qty));
      if (unit !== undefined) updates.unit = unit;
      if (low_stock_threshold !== undefined) updates.low_stock_threshold = Number(low_stock_threshold);

      if (req.file) {
        // Delete old image from GCS, then upload the new one
        if (existing.image?.object_path) await deleteImage(existing.image.object_path);
        updates.image = await saveMenuImage(req.file.buffer, req.file.originalname);
      }

      let item = await MenuItem.updateById(req.params.id, updates);
      item = await withSignedUrl(item);

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
    if (item.image?.object_path) await deleteImage(item.image.object_path);
    await MenuItem.deleteById(req.params.id);
    res.json({ success: true, message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @PUT /api/menu/:id/toggle-franchise  — Franchise owner toggles item for their outlet
const toggleFranchiseItem = async (req, res) => {
  try {
    const franchiseId = (req.user.franchise_id._id || req.user.franchise_id).toString();
    const existing = await MenuItem.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Item not found' });

    const disabled = (existing.disabledInFranchises || []).map(String);
    const idx = disabled.indexOf(franchiseId);
    if (idx === -1) {
      disabled.push(franchiseId); // disable
    } else {
      disabled.splice(idx, 1); // enable
    }

    let item = await MenuItem.updateById(req.params.id, { disabledInFranchises: disabled });
    item = await withSignedUrl(item);
    const isEnabled = !disabled.includes(franchiseId);

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
    const existing = await MenuItem.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Item not found' });

    let item = await MenuItem.updateById(req.params.id, { isGlobalActive: !existing.isGlobalActive });
    item = await withSignedUrl(item);

    const io = req.app.get('io');
    if (io) io.emit('menu:globalUpdate', { itemId: item._id, isGlobalActive: item.isGlobalActive, item });
    res.json({ success: true, item, isGlobalActive: item.isGlobalActive });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getMenu, getAllMenu, createMenuItem, updateMenuItem, deleteMenuItem, toggleFranchiseItem, toggleGlobalActive };
