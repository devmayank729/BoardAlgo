const mongoose = require('mongoose');
const { Schema } = mongoose;

const VisitorLogSchema = new Schema({
  session_cookie_id: { type: String, required: true, index: true },
  ip_address: { type: String },
  
  // UTM Parameters
  utm_source: { type: String },
  utm_campaign: { type: String },
  
  // Flow
  landing_page: { type: String },
  drop_off_page: { type: String },
  time_spent_sec: { type: Number, default: 0 },
  device_type: { type: String, enum: ['MOBILE', 'DESKTOP', 'TABLET'] },
  
  // Conversion
  did_sign_up: { type: Boolean, default: false },
  converted_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

// Optional: Auto-delete logs after 90 days (7776000 seconds)
VisitorLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

module.exports = mongoose.model('VisitorLog', VisitorLogSchema);