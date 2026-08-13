const mongoose = require("mongoose");

/**
 * Consolidated, computed attainment for one allocation (paper).
 *
 * coAttainment: per-CO breakdown —
 *   internal = average outcome-level of every CIA component whose CO-range covers this CO
 *   external = the paper's single ESE outcome-level (same value for every CO)
 *   weight   = internal*internalWeight% + external*externalWeight%  (the CO's final combined level)
 *
 * weightedAverage: simple mean of `weight` across all COs — the paper's single headline number.
 *
 * poAttainment / psoAttainment: mirrors the reference Excel workbook:
 *   Expected = average of non-zero CO correlation values for that PO/PSO
 *   Observed = Expected * weightedAverage / 3.
 */
const AttainmentSchema = new mongoose.Schema(
  {
    allocation: { type: mongoose.Schema.Types.ObjectId, ref: "Allocation", required: true, unique: true },
    lockKey: String,
    thresholdMarksPercent: { type: Number, default: 50 },
    targetPercent: { type: Number, default: 70 },
    internalWeight: { type: Number, default: 25 },
    externalWeight: { type: Number, default: 75 },
    eseSummary: {
      appeared: Number,
      attained: Number,
      attainedPercent: Number,
      outcomeLevel: Number,
    },
    ciaComponentSummary: [
      {
        key: String,
        label: String,
        coStart: Number,
        coEnd: Number,
        appeared: Number,
        attained: Number,
        attainedPercent: Number,
        outcomeLevel: Number,
      },
    ],
    coAttainment: [
      {
        co: String,
        internal: Number,
        external: Number,
        weight: Number,
      },
    ],
    weightedAverage: Number,
    poAttainment: [{ po: String, value: Number, expected: Number }],
    psoAttainment: [{ pso: String, value: Number, expected: Number }],
    computedAt: Date,
    isCompleted: { type: Boolean, default: false },
    completedAt: Date,
    completedBy: String, // staff_id
  },
  { timestamps: true }
);

module.exports = mongoose.model("Attainment", AttainmentSchema);