const mongoose = require("mongoose");

/**
 * Durable copy of every student/paper report received from the attainment API.
 * Normalised ESE/CIA marks are also written to ESEMark/CIAMark. This collection
 * preserves the complete API response used for that normalisation and provides
 * an independent recovery/audit source if the upstream API later changes.
 */
const ERPStudentReportSchema = new mongoose.Schema(
  {
    rollno: { type: String, required: true, index: true },
    paperCode: { type: String, required: true, index: true },
    academicYear: { type: String, required: true, index: true },
    admissionYear: { type: Number, default: null, index: true },
    course: { type: String, default: "", index: true },
    studyYear: { type: Number, default: null, index: true },
    section: { type: String, default: "NIL", index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: "Batch", default: null, index: true },
    semester: { type: Number, default: null, index: true },
    paperTitle: { type: String, default: "" },
    paperType: { type: String, default: "Theory" },
    ese: { type: mongoose.Schema.Types.Mixed, default: null },
    cia: { type: mongoose.Schema.Types.Mixed, default: null },
    source: { type: String, default: "ATTAINMENT_API" },
    sourceEndpoint: { type: String, default: "student-report" },
    sourcePayload: { type: mongoose.Schema.Types.Mixed, default: {} },
    firstSyncedAt: { type: Date, default: Date.now },
    lastSyncedAt: { type: Date, default: Date.now, index: true },
    lastSyncJob: { type: mongoose.Schema.Types.ObjectId, ref: "ApiSyncJob", default: null },
  },
  { timestamps: true }
);

ERPStudentReportSchema.index(
  { rollno: 1, paperCode: 1, academicYear: 1 },
  { unique: true, name: "unique_student_paper_report_per_year" }
);
ERPStudentReportSchema.index({ academicYear: 1, admissionYear: 1, course: 1, studyYear: 1, section: 1, paperCode: 1 });

module.exports = mongoose.model("ERPStudentReport", ERPStudentReportSchema);
