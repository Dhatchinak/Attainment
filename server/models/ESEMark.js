const mongoose = require("mongoose");

/**
 * ESE (End Semester Exam) marks — ONE total score per student per paper.
 * Unlike CIA, the external exam paper isn't broken down per-CO, so its
 * single computed outcome level is applied uniformly to every CO when
 * building the consolidated attainment table (see attainmentCalc.js).
 */
const ESEMarkSchema = new mongoose.Schema(
  {
    allocation: { type: mongoose.Schema.Types.ObjectId, ref: "Allocation", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    obtained: { type: Number, default: 0 },
    max: { type: Number, default: 100 },
  },
  { timestamps: true }
);

ESEMarkSchema.index({ allocation: 1, student: 1 }, { unique: true });

module.exports = mongoose.model("ESEMark", ESEMarkSchema);
