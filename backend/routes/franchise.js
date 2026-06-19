const express = require('express');
const { body } = require('express-validator');
const {
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
} = require('../controllers/franchiseController');
const { protect, authorise } = require('../middleware/auth');

const router = express.Router();

const franchiseValidators = [
  body('name').optional().trim().notEmpty().withMessage('Name is required'),
  body('location').optional().trim().notEmpty().withMessage('Location is required'),
  body('city').optional().trim().notEmpty().withMessage('City is required'),
  body('state').optional().trim().notEmpty().withMessage('State is required'),
  body('gstin').optional().trim().notEmpty().withMessage('GSTIN is required'),
];

router.get('/', protect, authorise('master_admin'), getFranchises);
router.post('/', protect, authorise('master_admin'), franchiseValidators, createFranchise);
router.get('/:id', protect, authorise('master_admin', 'franchise_owner', 'manager', 'pos_staff', 'shift_operator', 'waiter', 'kitchen_staff'), getFranchiseById);
router.put('/:id', protect, authorise('master_admin'), franchiseValidators, updateFranchise);
router.patch('/:id/activate', protect, authorise('master_admin'), activateFranchise);
router.patch('/:id/deactivate', protect, authorise('master_admin'), deactivateFranchise);
router.patch('/:id/archive', protect, authorise('master_admin'), archiveFranchise);
router.patch('/:id/restore', protect, authorise('master_admin'), restoreFranchise);
router.delete('/:id', protect, authorise('master_admin'), deleteFranchise);
router.put('/:id/edit-pin', protect, authorise('master_admin', 'franchise_owner', 'manager'), setEditPin);

module.exports = router;
