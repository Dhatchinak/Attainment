const mongoose = require("mongoose");

const HistoricalOutcomeSchema = new mongoose.Schema(
  {
    outcome: { type: String, required: true },
    expected: { type: Number, default: null },
    observed: { type: Number, default: null },
  },
  { _id: false }
);

/**
 * Read-only archive for completed records migrated from the previous PHP/MySQL
 * attainment portal. Kept separate from live Attainment documents because the
 * legacy file has no Allocation/Student/CO evidence and uses PO1-PO9 + PSO1-PSO4.
 */
const HistoricalAttainmentRecordSchema = new mongoose.Schema(
  {
    sourceSystem: { type: String, default: "LEGACY_FINALBHC", index: true },
    legacyId: { type: String, required: true },
    recordKey: { type: String, required: true, index: true },
    version: { type: Number, default: 1 },
    isLatest: { type: Boolean, default: true, index: true },

    academicYear: { type: String, required: true, index: true },
    batch: { type: String, default: "", index: true },
    semester: { type: Number, required: true, index: true },
    studyLevel: { type: Number, default: null },
    department: { type: String, required: true, index: true },
    departmentCode: { type: String, default: "", index: true },
    assessmentType: { type: String, default: "ESE", index: true },
    section: { type: String, default: "NIL", index: true },
    courseTitle: { type: String, default: "" },
    courseCode: { type: String, required: true, index: true },
    courseType: { type: String, default: "" },
    professorName: { type: String, default: "", index: true },

    expectedValues: { type: mongoose.Schema.Types.Mixed, default: {} },
    observedValues: { type: mongoose.Schema.Types.Mixed, default: {} },
    outcomes: { type: [HistoricalOutcomeSchema], default: [] },
    poCount: { type: Number, default: 0 },
    psoCount: { type: Number, default: 0 },

    sourceCreatedAt: { type: Date, default: null },
    sourceFileName: { type: String, default: "" },
    sourceFileHash: { type: String, default: "" },
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },
    importedAt: { type: Date, default: Date.now },
    importedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

HistoricalAttainmentRecordSchema.index(
  { sourceSystem: 1, legacyId: 1 },
  { unique: true, name: "unique_legacy_attainment_id" }
);
HistoricalAttainmentRecordSchema.index({ academicYear: 1, department: 1, semester: 1, isLatest: 1 });

module.exports = mongoose.model("HistoricalAttainmentRecord", HistoricalAttainmentRecordSchema);
