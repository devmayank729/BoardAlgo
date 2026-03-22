const mongoose = require('mongoose');
const { Schema } = mongoose;

const MasterContentSchema = new Schema({
  // Hierarchya
  subject: { type: String, required: true, index: true }, // e.g., Physics
  chapter: { type: String, required: true, index: true }, // e.g., Optics
  concept_topic: { type: String, required: true, index: true }, // e.g., TIR

  // Content Resources
  youtube_video_url: { type: String, required: true },
  youtube_start_time: { type: Number, default: 0 }, // In seconds
  topper_answer_img: { type: String, required: true }, // S3 URL
  mnemonic_story: { type: String }, // Optional memory aid

  // AI & Analytics Data
  exam_probability: { type: Number, min: 0, max: 1, default: 0.5 }, // 0.0 to 1.0
  is_active: { type: Boolean, default: false }, // Draft mode by default

  // Audit
  last_updated_by: { type: Schema.Types.ObjectId, ref: 'User' },
  last_updated_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MasterContent', MasterContentSchema);