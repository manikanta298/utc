const { validationResult } = require('express-validator');
const Franchise = require('../models/Franchise');

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return null;
  return res.status(400).json({
    success: false,
    message: errors.array()[0].msg,
    errors: errors.array(),
  });
};

const normalizeStatus = (franchise) => franchise.status || (franchise.isActive ? 'active' : 'inactive');

const updateFranchiseStatus = async (req, res, status) => {
  try {
    const updates = {
      status,
      isActive: status === 'active',
      archivedAt: status === 'archived' ? new Date() : null,
      deletedBy: status === 'archived' ? req.user._id : null,
    };

    const franchise = await Franchise.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).populate('owner_id', 'name email');

    if (!franchise) {
      return res.status(404).json({ success: false, message: 'Franchise not found' });
    }

    res.json({ success: true, franchise, message: status === 'active' ? 'Franchise restored and activated' : `Franchise marked ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @GET /api/franchises
const getFranchises = async (req, res) => {
  try {
    const franchises = await Franchise.find()
      .populate('owner_id', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      franchises: franchises.map((franchise) => ({
        ...franchise,
        status: normalizeStatus(franchise),
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @POST /api/franchises
const createFranchise = async (req, res) => {
  try {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) return validationResponse;

    const { name, location, city, state, gstin, phone, email, address } = req.body;
    const franchise = await Franchise.create({ name, location, city, state, gstin, phone, email, address });
    res.status(201).json({ success: true, franchise });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @PUT /api/franchises/:id
const updateFranchise = async (req, res) => {
  try {
    const validationResponse = handleValidation(req, res);
    if (validationResponse) return validationResponse;

    const updates = { ...req.body };
    if (updates.isActive !== undefined && updates.status === undefined) {
      updates.status = updates.isActive ? 'active' : 'inactive';
    }
    if (updates.status === 'archived') {
      updates.archivedAt = updates.archivedAt || new Date();
      updates.deletedBy = req.user._id;
    } else if (updates.status) {
      updates.archivedAt = null;
      updates.deletedBy = null;
    }

    const franchise = await Franchise.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!franchise) return res.status(404).json({ success: false, message: 'Franchise not found' });
    res.json({ success: true, franchise });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @DELETE /api/franchises/:id
const deleteFranchise = async (req, res) => updateFranchiseStatus(req, res, 'archived');
const activateFranchise = async (req, res) => updateFranchiseStatus(req, res, 'active');
const deactivateFranchise = async (req, res) => updateFranchiseStatus(req, res, 'inactive');
const archiveFranchise = async (req, res) => updateFranchiseStatus(req, res, 'archived');
const restoreFranchise = async (req, res) => updateFranchiseStatus(req, res, 'active');

// @GET /api/franchises/:id
const getFranchiseById = async (req, res) => {
  try {
    const franchise = await Franchise.findById(req.params.id).populate('owner_id', 'name email phone');
    if (!franchise) return res.status(404).json({ success: false, message: 'Franchise not found' });
    res.json({ success: true, franchise: { ...franchise.toObject(), status: normalizeStatus(franchise) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getFranchises,
  createFranchise,
  updateFranchise,
  deleteFranchise,
  activateFranchise,
  deactivateFranchise,
  archiveFranchise,
  restoreFranchise,
  getFranchiseById,
  setEditPin,
};

// @PUT /api/franchises/:id/edit-pin  — Set/update the order-edit PIN for a franchise
async function setEditPin(req, res) {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{4,6}$/.test(String(pin))) {
      return res.status(400).json({ success: false, message: 'PIN must be 4–6 digits' });
    }

    // Franchise owner can only set their own franchise PIN
    if (req.user.role !== 'master_admin') {
      const ownId = (req.user.franchise_id?._id || req.user.franchise_id)?.toString();
      if (ownId !== req.params.id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const bcrypt = require('bcryptjs');
    const hashed = await bcrypt.hash(String(pin), 10);
    const franchise = await Franchise.findByIdAndUpdate(
      req.params.id,
      { edit_pin: hashed },
      { new: true }
    ).select('name franchiseCode');

    if (!franchise) return res.status(404).json({ success: false, message: 'Franchise not found' });

    const { logAudit } = require('../utils/auditHelper');
    await logAudit('EDIT_PIN_SET', req, franchise._id, 'Franchise', { franchiseName: franchise.name });

    res.json({ success: true, message: 'Edit PIN updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
