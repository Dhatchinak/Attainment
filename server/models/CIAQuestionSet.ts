export {};
const mongoose = require("mongoose");

const CIAQuestionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    co: { type: String, default: "" },
    kLevel: { type: String, default: "" },
    maxMarks: { type: Number, default: 0 },
    maxMarksInferred: { type: Boolean, default: true },
    observedMax: { type: Number, default: 0 },
    maxMarksInferenceSource: { type: String, default: "" },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const CIAQuestionStudentSchema = new mongoose.Schema(
  {
    regNo: { type: String, required: true },
    name: { type: String, default: "" },
    course: { type: String, default: "" },
    section: { type: String, default: "" },
    marks: { type: mongoose.Schema.Types.Mixed, default: {} },
    total: { type: Number, default: null },
    totalMismatch: { type: Boolean, default: false },
    duplicateCount: { type: Number, default: 0 },
    duplicateConflict: { type: Boolean, default: false },
    duplicateSourceRows: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { _id: false }
);

/**
 * Imported question-wise CIA source data for one paper + one test (T1/T2).
 * The source workbook has question -> CO and Bloom/K mappings in the
 * ciaobe_level_* sheets and student question marks in ciaobe_ques_test_*.
 *
 * We intentionally store this independently from Allocation/Student.  The
 * imported English-department workbook contains paper code + register number
 * but not the portal's Mongo object ids.  Runtime routes match the selected
 * allocation by paperCode/academicYear/ODD-EVEN and keep staff ownership on
 * the Allocation itself.
 */
const CIAQuestionSetSchema = new mongoose.Schema(
  {
    departmentName: { type: String, default: "" },
    departmentKey: { type: String, default: "", index: true },
    departmentImportVersion: { type: Number, default: 1 },
    departmentVerified: { type: Boolean, default: false },
    departmentVerifiedBy: { type: String, default: "" },
    departmentVerifiedAt: { type: Date, default: null },
    paperCode: { type: String, required: true },
    paperCodeKey: { type: String, required: true, index: true },
    exam: { type: String, enum: ["T1", "T2"], required: true, index: true },
    term: { type: String, enum: ["ODD", "EVEN"], required: true, index: true },
    academicYear: { type: String, default: "", index: true },
    academicYearSource: { type: String, default: "" },
    staffName: { type: String, default: "" },
    sourceFileName: { type: String, default: "" },
    sourceSheet: { type: String, default: "" },
    sourceSheets: { type: [String], default: [] },
    sourceRowCount: { type: Number, default: 0 },
    duplicateRowCount: { type: Number, default: 0 },
    totalMismatchCount: { type: Number, default: 0 },
    unresolvedStudentCount: { type: Number, default: 0 },
    mappingStatus: { type: String, enum: ["COMPLETE", "PARTIAL", "MISSING"], default: "MISSING", index: true },
    mappingSource: { type: String, default: "" },
    workbookImport: { type: mongoose.Schema.Types.ObjectId, ref: "CIAWorkbookImport", default: null, index: true },
    questions: { type: [CIAQuestionSchema], default: [] },
    students: { type: [CIAQuestionStudentSchema], default: [] },
    importedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

CIAQuestionSetSchema.index(
  { departmentKey: 1, paperCodeKey: 1, exam: 1, term: 1, academicYear: 1 },
  { unique: true, name: "cia_department_question_unique" }
);

module.exports = mongoose.model("CIAQuestionSet", CIAQuestionSetSchema);
