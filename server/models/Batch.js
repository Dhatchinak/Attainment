const mongoose = require("mongoose");

/**
 * A "Batch" represents one class-section, e.g. "I MSC CS A".
 * Created dynamically by the admin - nothing here is hardcoded.
 */
const BatchSchema = new mongoose.Schema(
  {
    programme: { type: String, enum: ["UG", "PG"], required: true },
    course: { type: String, required: true }, // e.g. "MSC CS", "BSC CS"
    year: { type: String, required: true }, // e.g. "I", "II", "III"
    section: { type: String, required: true }, // e.g. "A", "B", "C"
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    department_code: String,
    program_id: String, // ERP's program_id, e.g. "UG-BSC-AMS" — kept for precise re-sync matching
    displayName: { type: String, required: true }, // computed e.g. "I MSC CS A"
    totalSemesters: { type: Number, default: 2 },
    isActive: { type: Boolean, default: true },
    source: { type: String, enum: ["admin", "erp_sync"], default: "admin" },
  },
  { timestamps: true }
);

BatchSchema.index({ course: 1, year: 1, section: 1, academicYear: 1 }, { unique: true });

module.exports = mongoose.model("Batch", BatchSchema);
