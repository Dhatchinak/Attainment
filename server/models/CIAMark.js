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
  },
  { timestamps: true }
);

CIAMarkSchema.index({ allocation: 1, student: 1 }, { unique: true });

module.exports = mongoose.model("CIAMark", CIAMarkSchema);

