const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');

// Seed default categories if none exist
const seedDefaults = async () => {
  const count = await Category.countDocuments();
  if (count > 0) return;
  await Category.insertMany([
    { name: 'Beverages', icon: '☕', color: '#3b82f6', sortOrder: 1 },
    { name: 'Snacks',    icon: '🍟', color: '#f59e0b', sortOrder: 2 },
    { name: 'Meals',     icon: '🍛', color: '#10b981', sortOrder: 3 },
    { name: 'Desserts',  icon: '🍰', color: '#ec4899', sortOrder: 4 },
    { name: 'Breads',    icon: '🍞', color: '#d97706', sortOrder: 5 },
    { name: 'Specials',  icon: '⭐', color: '#8b5cf6', sortOrder: 6 },
    { name: 'Add-ons',   icon: '➕', color: '#6b7280', sortOrder: 7 },
  ]);
};

// GET /api/categories
const getCategories = async (req, res) => {
  try {
    await seedDefaults();
    const filter = req.query.all === 'true' ? {} : { isActive: true };
    const cats = await Category.find(filter).sort({ sortOrder: 1, name: 1 });
    res.json({ success: true, categories: cats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/categories
const createCategory = async (req, res) => {
  try {
    const { name, color, icon, sortOrder } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Name required' });
    const cat = await Category.create({ name: name.trim(), color, icon, sortOrder: Number(sortOrder) || 0 });
    res.status(201).json({ success: true, category: cat });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Category already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/categories/:id
const updateCategory = async (req, res) => {
  try {
    const { name, color, icon, sortOrder, isActive } = req.body;
    const cat = await Category.findByIdAndUpdate(
      req.params.id,
      { name, color, icon, sortOrder, isActive },
      { new: true, runValidators: true }
    );
    if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, category: cat });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/categories/:id
const deleteCategory = async (req, res) => {
  try {
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });
    const inUse = await MenuItem.countDocuments({ category: cat.name });
    if (inUse > 0) {
      return res.status(400).json({ success: false, message: `Cannot delete — ${inUse} item(s) use this category` });
    }
    await cat.deleteOne();
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
