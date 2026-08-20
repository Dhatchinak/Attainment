const mongoose = require("mongoose");

/**
 * CourseAllocation = "this staff teaches this paper, in this batch/section, this semester".
 * Created by admin (or synced from the ERP's class_attend field when available).
 * The staff dashboard ONLY ever shows allocations that belong to the logged-in staff_id.
 *
 * lockKey groups sections of the SAME course+semester+papercode+academicYear together
 * (regardless of section, e.g. A/B/C) so that once ONE staff submits the CO-PO-PSO
 * matrix for that paper, the matrix becomes read-only for the other section-staff.
 */
const AllocationSchema = new mongoose.Schema(
  {
    staff_id: { type: String, required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: "Batch", required: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    semester: { type: Number, required: true },
    paperCode: { type: String, required: true },
    paperName: { type: String, required: true },
    paperType: {
      type: String, // free text from ERP (e.g. "Core V", "Allied IV", "Elective I", "Tamil III") — not a fixed enum, real paper types vary too much
      default: "Theory",
    },
    credits: { type: Number, default: 0 },
    lockKey: { type: String, required: true, index: true }, // e.g. "<batchCourseYear>-SEM2-PAPERCODE-AY2025"
    source: { type: String, enum: ["admin", "erp_sync", "attainment_api"], default: "admin" },
    sourcePayload: { type: mongoose.Schema.Types.Mixed, default: {} },
    lastSyncedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

AllocationSchema.index({ staff_id: 1, batch: 1, academicYear: 1, paperCode: 1 }, { unique: true });

module.exports = mongoose.model("Allocation", AllocationSchema);
