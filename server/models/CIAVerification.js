const mongoose = require("mongoose");

/** Staff acknowledgement that a CIA stage has been checked before calculation. */
const CIAVerificationSchema = new mongoose.Schema(
  {
    allocation: { type: mongoose.Schema.Types.ObjectId, ref: "Allocation", required: true, index: true },
    stage: { type: String, enum: ["T1", "T2", "ACTIVITIES"], required: true },
    verifiedBy: { type: String, required: true },
    verifiedAt: { type: Date, default: Date.now },
    sourceUpdatedAt: { type: Date, required: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sourceScopeSignature: { type: String, required: true },
  },
  { timestamps: true }
);

CIAVerificationSchema.index({ allocation: 1, stage: 1 }, { unique: true });

module.exports = mongoose.model("CIAVerification", CIAVerificationSchema);
