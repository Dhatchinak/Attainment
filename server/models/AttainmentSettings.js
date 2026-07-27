const mongoose = require("mongoose");

/**
 * Threshold & weighting configuration for ONE paper (allocation), set by staff
 * right after the CO-PO-PSO matrix is locked and before any marks are entered.
 *
 * thresholdMarksPercent — a student "attains" a CO/component if they score
 *   at least this % of max marks in it.
 * targetPercent — the % of students the department targets crossing the
 *   threshold; outcome level = min(3, attainedPercent / targetPercent * 3).
 * internalWeight / externalWeight — how much CIA ("Internal") vs ESE
 *   ("External") count toward each CO's final combined attainment
 *   (must add up to 100).
 * ciaComponents — the CIA components staff will bulk-upload marks for
 *   (e.g. T1, T2, Seminar, Assignment, Innovative), each mapped to the
 *   range of COs it assesses.
 */
const CIAComponentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // column header used in the bulk upload sheet, e.g. "T1"
    label: { type: String, required: true }, // display label, e.g. "T1"
    coStart: { type: Number, required: true }, // e.g. 1 (covers CO1..CO3)
    coEnd: { type: Number, required: true }, // e.g. 3
    maxMarks: { type: Number, default: 100 },
  },
  { _id: false }
);

const AttainmentSettingsSchema = new mongoose.Schema(
  {
    allocation: { type: mongoose.Schema.Types.ObjectId, ref: "Allocation", required: true, unique: true },
    lockKey: String,
    thresholdMarksPercent: { type: Number, default: 50 },
    targetPercent: { type: Number, default: 70 },
    internalWeight: { type: Number, default: 25 }, // CIA weight %
    externalWeight: { type: Number, default: 75 }, // ESE weight %
    ciaComponents: {
      type: [CIAComponentSchema],
      default: () => [
        { key: "T1", label: "T1", coStart: 1, coEnd: 3, maxMarks: 20 },
        { key: "T2", label: "T2", coStart: 4, coEnd: 6, maxMarks: 20 },
        { key: "Seminar", label: "Seminar", coStart: 1, coEnd: 6, maxMarks: 10 },
        { key: "Assignment", label: "Assignment", coStart: 1, coEnd: 6, maxMarks: 10 },
        { key: "Innovative", label: "Innovative", coStart: 1, coEnd: 6, maxMarks: 10 },
      ],
    },
    configuredByAdmin: { type: Boolean, default: false },
    configuredBy: { type: String, default: "" },
    isLocked: { type: Boolean, default: false }, // locked once ESE/CIA entry has started, to keep the math consistent
  },
  { timestamps: true }
);

module.exports = mongoose.model("AttainmentSettings", AttainmentSettingsSchema);
