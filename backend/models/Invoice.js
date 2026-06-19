const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema(
  {
    invoice_no: { type: String, required: true, unique: true }, // FR01-INV-001
    order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    franchise_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true },
    customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },

    // Franchise billing details (snapshot)
    franchise_name: { type: String },
    franchise_gstin: { type: String },
    franchise_address: { type: String },
    franchise_state: { type: String },

    // Customer details (snapshot)
    customer_name: { type: String },
    customer_phone: { type: String },

    // Tax breakdown
    taxable_amount: { type: Number, required: true },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    total_tax: { type: Number, required: true },
    discount_amount: { type: Number, default: 0 },
    final_amount: { type: Number, required: true },

    payment_mode: { type: String },

    // Items snapshot for invoice
    items: [
      {
        name: String,
        hsn_code: String,
        quantity: Number,
        price: Number,
        gst_rate: Number,
        item_total: Number,
      },
    ],
    invoice_date: { type: Date, default: Date.now },
    pdf_url: { type: String, default: '' }, // Cloudinary or local PDF
    // Visit type — internal use only (never printed on customer invoice)
    visit_type: { type: String, default: '' },
  },
  { timestamps: true }
);

invoiceSchema.index({ franchise_id: 1, createdAt: -1 });
invoiceSchema.index({ franchise_id: 1, invoice_date: -1, payment_mode: 1 });
invoiceSchema.index({ payment_mode: 1, invoice_date: -1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
