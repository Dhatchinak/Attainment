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
    dob: Date, // used as the login credential instead of OTP; set from ERP if available, else by admin
    role: { type: [String], default: ["staff"] }, // "staff" | "admin" (admin flag can be added manually in DB)
    isAdmin: { type: Boolean, default: false },
    raw: { type: mongoose.Schema.Types.Mixed }, // full ERP payload cache
    lastLoginAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Staff", StaffSchema);
