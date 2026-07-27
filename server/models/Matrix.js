const mongoose = require("mongoose");

/**
 * CO-PO-PSO Mapping Matrix for one PAPER CODE (see utils/matrixKey.js).
 * paperKey = paperCode + academicYear ONLY — deliberately not tied to any one
 * course/batch/section, so every staff teaching the same paper code in the
 * same academic year (across sections, and even across departments if the
 * paper is shared) sees and locks the SAME matrix document.
 * Once submitted, isLocked=true and only the original submittedBy staff (or admin)
 * can see the edit form; everyone else who opens that paper code gets a read-only view.
 */
const MatrixRowSchema = new mongoose.Schema(
  {
    co: { type: String, required: true }, // "CO1", "CO2" ...
    description: { type: String, default: "" },
    po: { type: [Number], default: () => Array(12).fill(0) }, // PO1..PO12, values 0-3
    pso: { type: [Number], default: () => Array(2).fill(0) }, // PSO1..PSO2, values 0-3
  },
  { _id: false }
);

const MatrixSchema = new mongoose.Schema(
  {
    paperKey: { type: String, required: true, unique: true, index: true }, // e.g. "22UCS301__AY_<academicYearId>"
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear" },
    allocation: { type: mongoose.Schema.Types.ObjectId, ref: "Allocation", required: true }, // first allocation that created it (informational only)
    paperCode: String,
    paperName: String,
    rows: { type: [MatrixRowSchema], default: [] },
    poCount: { type: Number, default: 12 },
    psoCount: { type: Number, default: 2 },
    submittedBy: { type: String }, // staff_id
    isLocked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Matrix", MatrixSchema);
