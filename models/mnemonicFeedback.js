const mongoose = require('mongoose');
const { Schema } = mongoose;

const MnemonicFeedbackSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  interaction_id: { type: Schema.Types.ObjectId, ref: 'interaction', required: true },
  
  // NEW: Track exactly what this specific log represents
  action_type: { 
    type: String, 
    enum: ['LIKE', 'DISLIKE', 'RATING', 'COMMENT_SUBMIT', 'UPDATE'], 
    required: true 
  },

  rating: { type: Number, min: 1, max: 5, default: null },
  disliked: { type: Boolean, default: false },
  comment: { type: String, maxlength: 500, default: '' },
  question: { type: String },
  mode: { type: String },
  reviewed: { type: Boolean, default: false },
  rewarded: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MnemonicFeedback', MnemonicFeedbackSchema);