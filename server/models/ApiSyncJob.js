const mongoose = require("mongoose");

const ApiSyncJobSchema = new mongoose.Schema(
  {
    jobType: {
      type: String,
      enum: ["STAFF_LOGIN", "STAFF_CLASSES", "STUDENT_DIRECTORY", "STUDENT_REPORT", "CLASS_PREPARE", "ACADEMIC_DATA_MIGRATION"],
      required: true,
      index: true,
    },
    source: { type: String, default: "COLLEGE_API", index: true },
    status: { type: String, enum: ["RUNNING", "SUCCESS", "PARTIAL", "FAILED"], default: "RUNNING", index: true },
    requestedBy: { type: String, default: "", index: true },
    academicYear: { type: String, default: "", index: true },
    scope: { type: mongoose.Schema.Types.Mixed, default: {} },
    counts: {
      received: { type: Number, default: 0 },
      inserted: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    syncErrors: {
      type: [{ key: String, message: String, at: { type: Date, default: Date.now } }],
      default: [],
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ApiSyncJobSchema.index({ requestedBy: 1, createdAt: -1 });
module.exports = mongoose.model("ApiSyncJob", ApiSyncJobSchema);
