export {};
const mongoose = require("mongoose");

/**
 * Consolidated, computed attainment for one allocation (paper).
 *
 * Question-wise CIA flow:
 *   T1/T2 question -> threshold attainment -> level / 3 -> average by mapped CO.
 *   Seminar/Assignment are regular CIA evidence mapped to configured CO ranges.
 *   Innovative is retained as a separate CIA contribution.
 *   ESE remains the existing read-only paper-total outcome level.
 *
 * Final CO follows the supplied reference weighting structure:
 *   Main CIA 22.5 + Innovative 2.5 + ESE 75 when CIA:ESE is 25:75.
 *   The 22.5/2.5 split scales automatically if the CIA weight changes.
 *
 * PO/PSO:
 *   Expected = average of non-zero CO correlation values.
 *   Observed = Expected * weightedAverage / 3.
 */
const AttainmentSchema = new mongoose.Schema(
  {
    allocation: { type: mongoose.Schema.Types.ObjectId, ref: "Allocation", required: true, unique: true },
    lockKey: String,
    workflowMode: { type: String, enum: ["question_wise", "legacy"] },
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
    // Question-wise CIA evidence retained in the computed record so the final
    // report is reproducible even if the source workbook is re-imported later.
    t1QuestionSummary: { type: mongoose.Schema.Types.Mixed, default: null },
    t2QuestionSummary: { type: mongoose.Schema.Types.Mixed, default: null },
    ciaActivitySummary: { type: mongoose.Schema.Types.Mixed, default: [] },
    formulaWeights: { type: mongoose.Schema.Types.Mixed, default: null },
    coAttainment: [
      {
        co: String,
        t1: Number,
        t2: Number,
        mainInternal: Number,
        innovative: Number,
        internal: Number,
        external: Number,
        weight: Number,
        mainEvidence: { type: mongoose.Schema.Types.Mixed, default: [] },
        innovativeEvidence: { type: mongoose.Schema.Types.Mixed, default: [] },
      },
    ],
    weightedAverage: Number,
    poAttainment: [{ po: String, value: Number, expected: Number }],
    psoAttainment: [{ pso: String, value: Number, expected: Number }],
    computedAt: Date,
    remarks: { type: String, default: "", maxlength: 2000 },
    outcomeRemarks: { type: mongoose.Schema.Types.Mixed, default: {} },
    remarksUpdatedAt: Date,
    remarksUpdatedBy: String,
    isCompleted: { type: Boolean, default: false },
    completedAt: Date,
    completedBy: String, // staff_id
  },
  { timestamps: true }
);

module.exports = mongoose.model("Attainment", AttainmentSchema);