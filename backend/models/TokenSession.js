const mongoose = require('mongoose');

const tokenSessionSchema = new mongoose.Schema(
  {
    token_label: { type: String, required: true },
    token_number: { type: Number, required: true },
    token_date: { type: Date, required: true },
    franchise_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
    customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    table_number: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['Open', 'Bill Pending', 'Closed', 'Cancelled'],
      default: 'Open',
    },
    payment_status: {
      type: String,
      enum: ['Pending', 'Advance Paid', 'Partially Paid', 'Fully Paid'],
      default: 'Pending',
    },
    order_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
    total_amount: { type: Number, default: 0 },
    amount_paid: { type: Number, default: 0 },
    closed_at: { type: Date, default: null },
    closed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

tokenSessionSchema.index(
  { franchise_id: 1, customer_id: 1, token_date: 1, status: 1 },
  { name: 'active_customer_token_lookup' }
);
tokenSessionSchema.index(
  { franchise_id: 1, token_date: 1, token_number: 1 },
  { unique: true, name: 'daily_franchise_token_sequence' }
);

module.exports = mongoose.model('TokenSession', tokenSessionSchema);
