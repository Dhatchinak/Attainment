export {};
const mongoose = require("mongoose");

/**
 * Student roster, bulk-uploaded by admin (Excel) per batch/section.
 */
const StudentSchema = new mongoose.Schema(
  {
    regNo: { type: String, required: true, index: true },
    name: { type: String, required: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: "Batch", required: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    email: String,
    phone: String,
    isActive: { type: Boolean, default: true },
    source: { type: String, default: "admin" },
    sourceRecordId: { type: String, default: "" },
    lastSyncedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

StudentSchema.index({ regNo: 1, batch: 1 }, { unique: true });

module.exports = mongoose.model("Student", StudentSchema);
