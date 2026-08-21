export {};
const mongoose = require("mongoose");

const CIAImportIssueSchema = new mongoose.Schema(
  {
    severity: { type: String, enum: ["critical", "warning"], required: true },
    code: { type: String, default: "" },
    message: { type: String, required: true },
    paperCode: { type: String, default: "" },
    exam: { type: String, default: "" },
    term: { type: String, default: "" },
  },
  { _id: false }
);

const CIAVerificationHistorySchema = new mongoose.Schema(
  {
    action: { type: String, enum: ["verified", "reimported"], required: true },
    by: { type: String, default: "" },
    at: { type: Date, default: Date.now },
    version: { type: Number, default: 1 },
    note: { type: String, default: "" },
  },
  { _id: false }
);

/**
 * One admin-facing CIA import summary per department + academic year.
 *
 * The raw question/activity documents remain the calculation source. This model
 * is the verification/audit layer that lets Admin review an entire department
 * once and then approve every imported T1/T2/activity dataset with one click.
 */
const CIADepartmentImportSchema = new mongoose.Schema(
  {
    departmentName: { type: String, required: true },
    departmentKey: { type: String, required: true, index: true },
    academicYear: { type: String, required: true, index: true },
    sourceFileName: { type: String, default: "" },
    sourceFileHash: { type: String, default: "" },
    workbookImport: { type: mongoose.Schema.Types.ObjectId, ref: "CIAWorkbookImport", default: null, index: true },
    dataScope: { type: String, enum: ["DEPARTMENT", "COLLEGE_MASTER"], default: "DEPARTMENT" },
    terms: { type: [String], default: [] },

    version: { type: Number, default: 1 },
    paperCount: { type: Number, default: 0 },
    classCount: { type: Number, default: 0 },
    studentCount: { type: Number, default: 0 },
    questionSetCount: { type: Number, default: 0 },
    activitySetCount: { type: Number, default: 0 },
    questionRows: { type: Number, default: 0 },
    activityRows: { type: Number, default: 0 },
    inferredQuestionMaxCount: { type: Number, default: 0 },
    inferredActivityMaxCount: { type: Number, default: 0 },
    duplicateRowCount: { type: Number, default: 0 },
    totalMismatchCount: { type: Number, default: 0 },
    unresolvedRowCount: { type: Number, default: 0 },
    mappingMissingCount: { type: Number, default: 0 },

    criticalCount: { type: Number, default: 0 },
    warningCount: { type: Number, default: 0 },
    issues: { type: [CIAImportIssueSchema], default: [] },

    status: {
      type: String,
      enum: ["READY", "BLOCKED", "VERIFIED", "VERIFIED_WITH_ISSUES"],
      default: "READY",
      index: true,
    },
    verifiedBy: { type: String, default: "" },
    verifiedAt: { type: Date, default: null },
    importedAt: { type: Date, default: Date.now },
    history: { type: [CIAVerificationHistorySchema], default: [] },
  },
  { timestamps: true }
);

CIADepartmentImportSchema.index(
  { departmentKey: 1, academicYear: 1 },
  { unique: true }
);

module.exports = mongoose.model("CIADepartmentImport", CIADepartmentImportSchema);
