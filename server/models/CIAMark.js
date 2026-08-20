const mongoose = require("mongoose");

/**
 * CIA (Continuous Internal Assessment) marks per student per allocation (paper).
 * ONE score per configured component (see AttainmentSettings.ciaComponents),
 * e.g. componentMarks = { T1: {obtained:18,max:20}, T2: {...}, Seminar: {...} }.
 * Each component maps to a CO-range (set in AttainmentSettings), which is how
 * a per-CO "Internal" attainment gets derived in attainmentCalc.js.
 */
const CIAMarkSchema = new mongoose.Schema(
  {
    allocation: { type: mongoose.Schema.Types.ObjectId, ref: "Allocation", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    // Shape: { "T1": {obtained: 18, max: 20}, "T2": {...}, "Seminar": {...}, ... }
    componentMarks: { type: mongoose.Schema.Types.Mixed, default: {} },
    total: { type: Number, default: 0 },
    // API components may not include their official maximum marks. Such rows
    // are preserved but excluded from attainment until Admin verifies maxima.
    calculationReady: { type: Boolean, default: true, index: true },
    source: { type: String, default: "manual" },
    sourcePayload: { type: mongoose.Schema.Types.Mixed, default: {} },
    lastSyncedAt: { type: Date, default: null },
    lastSyncJob: { type: mongoose.Schema.Types.ObjectId, ref: "ApiSyncJob", default: null },
  },
  { timestamps: true }
);

CIAMarkSchema.index({ allocation: 1, student: 1 }, { unique: true });

module.exports = mongoose.model("CIAMark", CIAMarkSchema);

