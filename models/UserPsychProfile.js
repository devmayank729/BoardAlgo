const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS — values match the HTML form exactly.
// If you rename a form value, rename it here too.
// ─────────────────────────────────────────────────────────────────────────────

const CLASS_LEVELS = ['10', '12'];

// Step 2 — Language preference (NEW: was missing entirely before)
const LANGUAGES = ['english', 'hinglish', 'hindi'];

// Step 3 — What activates the student's focus
// System-prompt variable: DOPAMINE_SCHEMA
const DOPAMINE_SCHEMAS = [
  'curiosity_driven',   // "Most students get this wrong" → puzzle energy
  'reward_oriented',    // Clear marks value → works when ROI is visible
  'thrill_seeker',      // Last-night panic → pressure unlocks focus
  'social_proof',       // Group energy → needs peers to sustain attention
];

// Step 4 — How they recall under exam stress
// System-prompt variable: CORTISOL_RESPONSE
const CORTISOL_RESPONSES = [
  'audio_kinesthetic',  // Replays the teacher's voice / oral explanation
  'spatial_visual',     // Tries to picture the textbook page / handwriting
  'chunking',           // First-letter trigger → chain recall
  'algorithmic',        // Derives answer from formula / logic
];

// Step 5 — Mnemonic style that actually sticks for them
// System-prompt variable: VON_RESTORFF_STYLE
const VON_RESTORFF_STYLES = [
  'gen_z_meme_heavy',   // Completely unhinged / absurd → high bizarreness
  'desi_drama',         // Bollywood / Hinglish melodrama energy
  'cinematic',          // Epic one-liner, action-movie final-boss feel
  'grounded',           // Clean logic, everyday scene, zero chaos
];

// Step 6 — Where their memory breaks down
// System-prompt variable: MEMORY_DECAY_TYPE
const MEMORY_DECAYS = [
  'serial_position',    // Start + end survive; middle is a black hole
  'jumbled_mess',       // Points remembered but sequence scrambled
  'vocab_block',        // Concept understood; scientific keywords deleted
  'wall_of_text',       // Paragraph = brain rejection; needs structure
];

// Step 7 — What "winning" means to this student
// System-prompt variable: SOCIAL_EGO
const SOCIAL_EGOS = [
  'competitive',        // Rank matters; wants to outscore peers
  'collaborative',      // Wants to be the one who explains it to friends
  'self_improver',      // Personal proof of capability; no external audience needed
];

// Internal system statuses
const STATUSES = ['Active', 'Soft_Deleted', 'Archived'];


// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA
// ─────────────────────────────────────────────────────────────────────────────

const UserPsychProfileSchema = new Schema(
  {
    // ── 1. Core Linkage ─────────────────────────────────────────────────────
    user: {
      type:     Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'User reference is required'],
      index:    true,
    },

    // ── 2. Neural Calibration — populated by onboarding form ──────────────

    class_level: {
      type:     String,
      enum:     CLASS_LEVELS,
      required: [true, 'Class level is required'],
    },

    // NEW — language preference captured in Step 2
    language: {
      type:     String,
      enum:     LANGUAGES,
      required: [true, 'Language preference is required'],
      default:  'english',
    },

    dopamine_schema: {
      type:     String,
      enum:     DOPAMINE_SCHEMAS,
      required: [true, 'Dopamine schema is required'],
    },

    cortisol_response: {
      type:     String,
      enum:     CORTISOL_RESPONSES,
      required: [true, 'Cortisol response is required'],
    },

    von_restorff: {
      type:     String,
      enum:     VON_RESTORFF_STYLES,
      required: [true, 'Von Restorff style is required'],
    },

    memory_decay: {
      type:     String,
      enum:     MEMORY_DECAYS,
      required: [true, 'Memory decay type is required'],
    },

    social_ego: {
      type:     String,
      enum:     SOCIAL_EGOS,
      required: [true, 'Social ego is required'],
    },

    // ── 3. Iterative Learning — updated by the system over time ─────────────

    // Increases when the student fails the drag-and-drop test 3× in a row.
    // AI uses this to simplify mnemonic complexity on next generation.
    frustration_level: {
      type:    Number,
      min:     0,
      max:     5,
      default: 0,
    },

    // Mnemonics the student explicitly saved / bookmarked.
    favorite_mnemonics: [
      {
        type:    Schema.Types.ObjectId,
        ref:     'Master_Content_Library',
        default: [],
      },
    ],

    // ── 4. State Management ──────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    STATUSES,
      default: 'Active',
      index:   true,
    },

    deletedAt: {
      type:    Date,
      default: null,
    },
  },
  {
    timestamps:  true,
    toJSON:  { virtuals: true },
    toObject: { virtuals: true },
  }
);


// ─────────────────────────────────────────────────────────────────────────────
// INDEXES
// ─────────────────────────────────────────────────────────────────────────────

// Fast lookup for "give me this user's active profile"
UserPsychProfileSchema.index({ user: 1, status: 1 });


// ─────────────────────────────────────────────────────────────────────────────
// QUERY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

UserPsychProfileSchema.query.active = function () {
  return this.where({ status: 'Active' });
};


// ─────────────────────────────────────────────────────────────────────────────
// INSTANCE METHODS
// ─────────────────────────────────────────────────────────────────────────────

UserPsychProfileSchema.methods.softDelete = function () {
  this.status    = 'Soft_Deleted';
  this.deletedAt = new Date();
  return this.save();
};

UserPsychProfileSchema.methods.restore = function () {
  this.status    = 'Active';
  this.deletedAt = null;
  return this.save();
};

// Called when the student fails a test repeatedly.
// Caps at max value so callers don't need to guard.
UserPsychProfileSchema.methods.incrementFrustration = function () {
  if (this.frustration_level < 5) {
    this.frustration_level += 1;
  }
  return this.save();
};

// Called when a student passes a test — gradually resets frustration.
UserPsychProfileSchema.methods.decrementFrustration = function () {
  if (this.frustration_level > 0) {
    this.frustration_level -= 1;
  }
  return this.save();
};

// Returns the exact object the system-prompt template expects.
// Use this instead of spreading the raw document into the prompt.
UserPsychProfileSchema.methods.toPromptContext = function () {
  return {
    class_level:       this.class_level,
    language:          this.language,
    dopamine_schema:   this.dopamine_schema,
    cortisol_response: this.cortisol_response,
    von_restorff:      this.von_restorff,
    memory_decay:      this.memory_decay,
    social_ego:        this.social_ego,
    frustration_level: this.frustration_level,
  };
};


// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────

const UserPsychProfile = mongoose.model('UserPsychProfile', UserPsychProfileSchema);
module.exports = UserPsychProfile;