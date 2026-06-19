const mongoose = require('mongoose');

const sessionItemSchema = new mongoose.Schema({
  menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
  name: { type: String, required: true },
  qty: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true },
  totalPrice: { type: Number, required: true },
  gst_rate: { type: Number, default: 5 },
  hsn_code: { type: String, default: '' },
  notes: { type: String, default: '' },
}, { _id: true });

const subOrderSchema = new mongoose.Schema({
  orderedAt: { type: Date, default: Date.now },
  isAddition: { type: Boolean, default: false },
  destination: { type: String, enum: ['kitchen', 'counter', 'both'], default: 'kitchen' },
  items: [sessionItemSchema],
  placedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }, // linked Order doc
}, { _id: true });

const paymentEntrySchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  method: { type: String, enum: ['Cash', 'UPI', 'Card', 'Net Banking', 'Wallet'], required: true },
  paidAt: { type: Date, default: Date.now },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reference: { type: String, default: '' }, // UPI ref / card last4
}, { _id: true });

const orderSessionSchema = new mongoose.Schema({
  tokenNumber: { type: String }, // e.g. TOKEN-101 (unique per franchise, see compound index below)
  sessionRef: { type: String, unique: true },  // e.g. FR01-SES-20250509-101
  franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
  tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', default: null },
  tableNumber: { type: String, default: 'Counter' },
  customerMobile: { type: String, required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  customerName: { type: String, default: '' },
  orderType: { type: String, enum: ['dine_in', 'counter', 'parcel'], default: 'dine_in' },
  status: {
    type: String,
    enum: ['pending_pos', 'open', 'bill_pending', 'on_hold', 'paid', 'closed', 'cancelled'],
    default: 'open',
  },
  subOrders: [subOrderSchema],
  // Computed on bill generation
  mergedItems: [sessionItemSchema],
  subtotal: { type: Number, default: 0 },
  cgst_amount: { type: Number, default: 0 },
  sgst_amount: { type: Number, default: 0 },
  total_tax: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  couponCode: { type: String, default: '' },
  totalAmount: { type: Number, default: 0 },
  // Payment
  paidAmount: { type: Number, default: 0 },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partially_paid', 'advance_paid', 'fully_paid'],
    default: 'unpaid',
  },
  payments: [paymentEntrySchema],
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
  openedAt: { type: Date, default: Date.now },
  billGeneratedAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },
  openedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt:      { type: Date, default: null },
  rejectedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectedAt:      { type: Date, default: null },
  rejectionReason: { type: String, default: '' },
  isParcel:        { type: Boolean, default: false },
  held_at:       { type: Date, default: null },
  hold_note:     { type: String, default: '' },
  cancelled_at:  { type: Date, default: null },
  cancel_reason: { type: String, default: '' },
  visitType:     { type: String, enum: ['single', 'couple', 'family', 'friends'], default: 'single' },
}, { timestamps: true });

orderSessionSchema.index({ franchiseId: 1, status: 1, openedAt: -1 });
orderSessionSchema.index({ customerMobile: 1, franchiseId: 1, status: 1 });
// Only index sessions that have a real tokenNumber (not null/undefined).
// partialFilterExpression ensures nulls are excluded from the unique check.
// sparse: true as a fallback for older MongoDB versions.
orderSessionSchema.index(
  { franchiseId: 1, tokenNumber: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { tokenNumber: { $type: 'string' } },
    name: 'franchiseId_tokenNumber_partial_unique',
  }
);
orderSessionSchema.index({ franchiseId: 1, openedAt: -1, paymentStatus: 1 });

module.exports = mongoose.model('OrderSession', orderSessionSchema);
