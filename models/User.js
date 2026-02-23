const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserSchema = new Schema({
  role: {
    type: String,
    enum: ['STUDENT', 'PARENT', 'ADMIN', 'SUPER_ADMIN'],
    required: true,
    index: true // Faster lookups by role
  },
  username: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  phone_number: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true }, // Don't return by default
  parent_phone_number : {type : String} ,
  // Relationships
  parent_linked_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },

  // Subscription Logic
  subscription_status: {
    type: String,
    enum: ['ACTIVE', 'EXPIRED', 'FREE_TRIAL', 'CHURNED'],
    default: 'FREE_TRIAL'
  },
  current_plan_id: { type: String, default: null }, // Could be String ID or ObjectId
  plan_expiry_date: { type: Date, default: null },

  // Security
  device_fingerprints: [{ type: String }], // Array of device IDs
  last_login_ip: { type: String },
  
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);