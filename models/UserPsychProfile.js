const mongoose = require('mongoose');
const { Schema } = mongoose;

// --- ENUMS MAPPED DIRECTLY FROM HTML FORM VALUES ---
const CLASS_LEVELS = ['10', '12'];
const DOPAMINE_SCHEMAS = ['system_builder', 'emotional_coder', 'competitor', 'absurdist'];
const CORTISOL_RESPONSES = ['audio_kinesthetic', 'spatial_visual', 'chunking', 'algorithmic'];
const VON_RESTORFF_STYLES = ['unhinged', 'melodramatic', 'heroic', 'grounded'];
const MEMORY_DECAYS = ['serial_position', 'jumbled_mess', 'vocab_block', 'wall_of_text'];
const SOCIAL_EGOS = ['teacher', 'hacker', 'survivor'];

// System Statuses
const STATUSES = ['Active', 'Soft_Deleted', 'Archived'];

const UserPsychProfileSchema = new Schema({
  // 1. Core Linkage
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required'],
    unique: true,
    index: true
  },

  // 2. Neural Calibration Fields (From Onboarding Form)
  class_level: {
    type: String,
    enum: CLASS_LEVELS,
    required: true
  },
  dopamine_schema: {
    type: String,
    enum: DOPAMINE_SCHEMAS,
    required: true
  },
  cortisol_response: {
    type: String,
    enum: CORTISOL_RESPONSES,
    required: true
  },

  von_restorff: {
    type: String,
    enum: VON_RESTORFF_STYLES,
    required: true
  },
  memory_decay: {
    type: String,
    enum: MEMORY_DECAYS,
    required: true
  },
  social_ego: {
    type: String,
    enum: SOCIAL_EGOS,
    required: true
  },

  // 3. Iterative Learning & Tracking (Hidden System Fields)
  frustration_level: {
    type: Number,
    min: 0,
    max: 5,
    default: 0 // We can increase this if they fail 3 questions in a row
  },
  favorite_mnemonics: [{
    type: Schema.Types.ObjectId,
    ref: 'Master_Content_Library', // Linked to the newly defined content schema
    default: []
  }],

  // 4. State Management
  status: {
    type: String,
    enum: STATUSES,
    default: 'Active',
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// --- QUERY HELPERS & METHODS ---

UserPsychProfileSchema.query.active = function() {
  return this.where({ status: 'Active' });
};

UserPsychProfileSchema.methods.softDelete = function() {
  this.status = 'Soft_Deleted';
  this.deletedAt = new Date();
  return this.save();
};

UserPsychProfileSchema.methods.restore = function() {
  this.status = 'Active';
  this.deletedAt = null;
  return this.save();
};

// Compound index for fast lookup of active profiles
UserPsychProfileSchema.index({ user: 1, status: 1 });

const UserPsychProfile = mongoose.model('UserPsychProfile', UserPsychProfileSchema);
module.exports = UserPsychProfile;