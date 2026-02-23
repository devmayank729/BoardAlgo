const mongoose = require('mongoose');
const { Schema } = mongoose;

const AdminAuditSchema = new Schema({
  admin_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  
  action_type: { 
    type: String, 
    required: true,
    enum: ['UPDATE_PROBABILITY', 'REFUND_USER', 'BAN_USER', 'EDIT_CONTENT'] 
  },
  
  target_id: { type: Schema.Types.ObjectId, required: true }, // ID of User or Content
  
  // Snapshots (Using Mixed type to store objects or strings)
  old_value: { type: Schema.Types.Mixed },
  new_value: { type: Schema.Types.Mixed },
  
  timestamp: { type: Date, default: Date.now, immutable: true }
});

module.exports = mongoose.model('AdminAudit', AdminAuditSchema);