export {};
const mongoose = require("mongoose");

const CIAWorkbookIssueSchema = new mongoose.Schema(
  {
    severity: { type: String, enum: ["critical", "warning", "info"], default: "warning" },
    code: { type: String, default: "" },
    message: { type: String, default: "" },
    sheet: { type: String, default: "" },
    count: { type: Number, default: 0 },
  },
  { _id: false }
);

const CIAWorkbookImportSchema = new mongoose.Schema(
  {
    academicYear: { type: String, required: true, index: true },
    sourceFileName: { type: String, required: true },
    sourceFileHash: { type: String, required: true, index: true },
    sourceFileBytes: { type: Number, default: 0 },
    importedBy: { type: String, default: "" },
    status: { type: String, enum: ["PROCESSING", "SUCCESS", "PARTIAL", "FAILED"], default: "PROCESSING", index: true },
    terms: { type: [String], default: [] },
    sheets: { type: [String], default: [] },
    counts: {
      departments: { type: Number, default: 0 },
      papers: { type: Number, default: 0 },
      students: { type: Number, default: 0 },
      questionSets: { type: Number, default: 0 },
      questionRows: { type: Number, default: 0 },
      activitySets: { type: Number, default: 0 },
      activityRows: { type: Number, default: 0 },
      duplicates: { type: Number, default: 0 },
      totalMismatches: { type: Number, default: 0 },
      unresolvedRows: { type: Number, default: 0 },
      mappingMissing: { type: Number, default: 0 },
    },
    progress: {
      stage: { type: String, default: "Queued" },
      processed: { type: Number, default: 0 },
      total: { type: Number, default: 16 },
      percent: { type: Number, default: 0 },
      currentSheet: { type: String, default: "" },
    },
    issues: { type: [CIAWorkbookIssueSchema], default: [] },
    departmentImports: [{ type: mongoose.Schema.Types.ObjectId, ref: "CIADepartmentImport" }],
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

CIAWorkbookImportSchema.index({ academicYear: 1, sourceFileHash: 1 }, { unique: true });

module.exports = mongoose.model("CIAWorkbookImport", CIAWorkbookImportSchema);
