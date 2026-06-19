const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    item_id: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    name: { type: String, required: true },        // snapshot at time of order
    price: { type: Number, required: true },       // price snapshot
    gst_rate: { type: Number, required: true },    // gst snapshot
    hsn_code: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    item_total: { type: Number, required: true },  // price × quantity (before tax)
  },
  { _id: true }
);

const orderSchema = new mongoose.Schema(
  {
    order_number: { type: String, unique: true },  // e.g. FR01-ORD-00001
    franchise_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
    customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    items: [orderItemSchema],

    // Financials
    sub_total: { type: Number, required: true },        // taxable amount
    cgst_amount: { type: Number, default: 0 },
    sgst_amount: { type: Number, default: 0 },
    igst_amount: { type: Number, default: 0 },
    total_tax: { type: Number, default: 0 },
    gross_total: { type: Number, required: true },      // sub_total + total_tax
    discount_amount: { type: Number, default: 0 },      // loyalty point discount
    coupon_code:     { type: String, default: null },    // coupon code applied
    coupon_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
    coupon_discount: { type: Number, default: 0 },       // discount from coupon
    total_discount:  { type: Number, default: 0 },       // coupon_discount + loyalty discount
    points_redeemed: { type: Number, default: 0 },
    final_amount: { type: Number, required: true },     // gross_total - discount

    // Tax type
    tax_type: { type: String, enum: ['CGST_SGST', 'IGST'], required: true },

    // Payment
    payment_mode: { type: String, enum: ['Cash', 'Card', 'UPI'], required: true },
    payment_status: { type: String, enum: ['Pending', 'Paid', 'Refunded'], default: 'Paid' },

    // Kitchen status
    kitchen_status: {
      type: String,
      enum: ['Pending', 'Accepted', 'Preparing', 'Ready', 'Delivered', 'Completed', 'Cancelled'],
      default: 'Pending',
    },
    status_history: [
      {
        status: String,
        updatedAt: { type: Date, default: Date.now },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      },
    ],

    // Token number shown to customer (sequential per day per franchise)
    token_number: { type: Number },

    // Order type — dine_in | parcel | counter
    order_type: {
      type: String,
      enum: ['dine_in', 'parcel', 'counter'],
      default: 'dine_in',
    },

    // Table info snapshot for kitchen/receipt display
    table_number: { type: String, default: '' },
    table_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'Table', default: null },

    // Who created this order: pos_operator | waiter | qr_customer
    order_source: {
      type: String,
      enum: ['pos_operator', 'waiter', 'qr_customer'],
      default: 'pos_operator',
    },

    // Delivery acceptance tracking
    accepted_by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    accepted_by_name: { type: String, default: '' },
    accepted_at:      { type: Date,   default: null },

    // Waiter/Staff who placed this order
    waiter_name:  { type: String, default: '' },

    // Session link
    session_id: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderSession', default: null },

    // Customer mobile snapshot for kitchen display
    customer_mobile: { type: String, default: '' },

    // POS staff who created the order
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Points earned from this order
    points_earned: { type: Number, default: 0 },

    // Visit type — internal use only (never shown on customer invoice)
    visit_type: {
      type: String,
      enum: ['single', 'couple', 'family', 'friends'],
      default: 'single',
    },

    // Archived automatically after the operational 30-day window.
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

orderSchema.index({ franchise_id: 1, createdAt: -1 });
orderSchema.index({ customer_id: 1 });
orderSchema.index({ kitchen_status: 1, franchise_id: 1 });
orderSchema.index({ archivedAt: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
