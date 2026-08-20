const mongoose = require("mongoose");

/**
 * Local cache of a staff member.
 * The source of truth for personal/professional data is the college's
 * external ERP API (apierp.bhc.edu.in). We cache the essentials here so we
 * can attach app-specific data (role, login state) without mutating the ERP.
 */
const StaffSchema = new mongoose.Schema(
  {
    staff_id: { type: String, required: true, unique: true, index: true },
    name: String,
    salute: String,
    designation: String,
    department_code: String,
    department_name: String,
    college_email: String,
    email: String,
    phone: String,
    profile_pic: String,
    role: { type: [String], default: ["staff"] }, // "staff" | "admin" (admin flag can be added manually in DB)
    isAdmin: { type: Boolean, default: false },
    raw: { type: mongoose.Schema.Types.Mixed }, // full ERP payload cache
    source: { type: String, default: "COLLEGE_ERP" },
    firstSyncedAt: { type: Date, default: Date.now },
    lastSyncedAt: { type: Date, default: null },
    lastSyncJob: { type: mongoose.Schema.Types.ObjectId, ref: "ApiSyncJob", default: null },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Staff", StaffSchema);
