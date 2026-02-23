const mongoose = require('mongoose');
const { Schema } = mongoose;

const TransactionSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Payment Gateway Details
  gateway_transaction_id: { type: String, required: true, unique: true }, // e.g., pay_29s83...
  amount_paid: { type: mongoose.Decimal128, required: true }, // Precise decimal storage
  currency: { type: String, default: 'INR' },
  
  // Order Details
  plan_selected: { type: String, required: true }, // e.g., "Board_Booster_2026"
  coupon_code_used: { type: String, default: null },
  
  // Status Tracking
  payment_status: {
    type: String,
    enum: ['SUCCESS', 'FAILED', 'REFUNDED', 'PENDING'],
    required: true,
    index: true
  },
  payment_mode: { type: String, enum: ['UPI', 'CREDIT_CARD', 'NETBANKING', 'WALLET'] },
  
  // Audit
  invoice_url: { type: String },
  valid_from: { type: Date },
  valid_till: { type: Date },
  created_at: { type: Date, default: Date.now } // Immutable timestamp

});

module.exports = mongoose.model('Transaction', TransactionSchema);