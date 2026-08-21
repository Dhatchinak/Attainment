export {};
const mongoose = require("mongoose");

const DepartmentAccountSchema = new mongoose.Schema(
  {
    departmentCode: { type: String, required: true, unique: true, index: true },
    departmentName: { type: String, required: true },
    erpDepartmentId: { type: String, default: "" },
    sourceDepartmentCode: { type: String, default: "", index: true },
    programmeIds: { type: [String], default: [] },
    programmeAliases: { type: [String], default: [] },
    passwordHash: { type: String, required: true, select: false },
    passwordEncrypted: { type: String, required: true, select: false },
    isActive: { type: Boolean, default: true, index: true },
    lastSyncedAt: { type: Date, default: Date.now },
    lastLoginAt: { type: Date, default: null },
    passwordUpdatedAt: { type: Date, default: Date.now },
    passwordUpdatedBy: { type: String, default: "SYSTEM" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DepartmentAccount", DepartmentAccountSchema);
