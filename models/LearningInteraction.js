const mongoose = require('mongoose');
const { Schema } = mongoose;

const LearningInteractionSchema = new Schema({
  // Identity (Denormalized for faster parent dashboard queries)
  user_id: { type: Schema.Types.ObjectId, ref: 'User' }, // The Actor
  child_id: { type: Schema.Types.ObjectId, ref: 'User' }, // Explicit Student ID
  parent_id: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // Explicit Parent ID

  // Conversation Tracking
  conversation_id: { type: String, index: true }, // ADDED

  feature_type: { 
    type: String, 
    enum: ['DOUBT_SOLVER', 'CONCEPT_PREDICTOR', 'BOARD_EVALUATOR' , 'MNEMONIC_GENERATOR' , 'SUB_QUESTION'], 
    required: true 
  },

  // The Interaction (Request Payload)
  user_query_text: { type: String }, // Maps to 'question'
  user_upload_url: { type: String }, // Maps to 'image' (stores URL or Base64)
  generation_mode: { type: String, enum: ['lore', 'hack'] }, // ADDED: Maps to 'mode'
  deep_scan_enabled: { type: Boolean, default: false }, // ADDED: Maps to 'deepScan'
  
  // AI Responses
  initial_ai_response: { type: Schema.Types.Mixed }, // UPDATED: Changed to Mixed to support nested JSON (mnemonics, formulas)
  improved_ai_response: { type: String }, // Post-Topper analysis
  
  // Link to Truth Source
  reference_concept_id: { type: Schema.Types.ObjectId, ref: 'MasterContent' },

  // Evaluation Metrics & Performance
  marks_awarded: { type: Number, min: 0, max: 5 },
  marking_scheme_gap: { type: String }, // Feedback text
  time_taken_ms: { type: Number }, // ADDED: Response generation time
  
  is_bookmarked: { type: Boolean, default: false },
  dmp: { type: Date, default: Date.now, index: true }, // Indexed for timeline views

  // ════════════ NEWLY INTEGRATED FIELDS ════════════
  
  subject: {
    type: String,
    enum: [
      'Physics', 'Chemistry', 'Mathematics', 'Biology', 
      'English', 'History', 'Geography', 'Economics', 
      'Computer Science', 'Accountancy', 'Business Studies'
    ]
  },
  total_marks: {
    type: Number,
    min: 1,
    max: 100
  },
  student_class: { 
    type: String,
    enum: ['9', '10', '11', '12']
  },
  exam_year: {
    type: Number,
    min: 2015,
    max: 2025
  },
  answer_images: [{
    type: String // To support multiple file uploads alongside user_upload_url
  }],

  // Metadata 
  screen_width: { type: Number },
  screen_height: { type: Number },
  device_pixel_ratio: { type: Number },
  device_type: { type: String, trim: true },
  viewport_width: { type: Number },
  viewport_height: { type: Number },
  user_agent: { type: String, trim: true },
  image_metadata_json: { type: Schema.Types.Mixed },
  timestamp_submit: { type: Date }

} , { timestamps: true } );

module.exports = mongoose.model('LearningInteraction', LearningInteractionSchema);