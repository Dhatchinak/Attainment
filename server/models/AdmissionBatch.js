const mongoose = require("mongoose");

const AdmissionBatchSchema = new mongoose.Schema(
  {
    degree: { type: String, enum: ["UG", "PG"], required: true },
    admissionYear: { type: Number, required: true },
    label: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    source: { type: String, enum: ["admin", "attainment_api"], default: "admin" },
  },
  { timestamps: true }
);

AdmissionBatchSchema.index({ degree: 1, admissionYear: 1 }, { unique: true });

module.exports = mongoose.model("AdmissionBatch", AdmissionBatchSchema);
