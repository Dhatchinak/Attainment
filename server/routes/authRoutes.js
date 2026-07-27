const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Staff = require("../models/Staff");
const Admin = require("../models/Admin");
const { fetchStaffFromERP } = require("../utils/externalApi");

const router = express.Router();

// Best-effort HOD detection from the ERP designation text (e.g. "HOD", "Head of Department",
// "Head of the Department - Computer Science"). There's no separate role table to check against,
// so this is the same signal the college's own paperwork uses.
function isHodDesignation(designation) {
  if (!designation) return false;
  return /\bhod\b|head\s*of\s*(the\s*)?department/i.test(designation);
}
function extractErpDob(erpData) {
  const candidates = ["dob", "DOB", "date_of_birth", "dateOfBirth", "DateOfBirth", "birth_date", "birthDate"];
  for (const key of candidates) {
    if (erpData && erpData[key]) return erpData[key];
  }
  return null;
}

// Normalize any date-ish value (Date, "yyyy-mm-dd", "dd-mm-yyyy", "dd/mm/yyyy") to "yyyy-mm-dd".
function normalizeDob(value) {
  if (!value) return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  const str = String(value).trim();

  // dd-mm-yyyy or dd/mm/yyyy
  const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // yyyy-mm-dd or yyyy/mm/dd
  const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return null;
}

// STAFF LOGIN: Staff ID + Date of Birth (no OTP)
router.post("/login", async (req, res) => {
  try {
    const { staff_id, dob } = req.body;
    if (!staff_id || !dob) {
      return res.status(400).json({ message: "Staff ID and Date of Birth are required" });
    }

    const enteredDob = normalizeDob(dob);
    if (!enteredDob) {
      return res.status(400).json({ message: "Invalid Date of Birth format" });
    }

    const erpData = await fetchStaffFromERP(staff_id.trim());
    if (!erpData) {
      return res.status(404).json({ message: "Staff ID not found in ERP" });
    }
    if (erpData.isActive === false) {
      return res.status(403).json({ message: "This staff account is inactive" });
    }

    // cache/update staff locally (keep any dob we already stored, in case ERP has none)
    const existing = await Staff.findOne({ staff_id: erpData.staff_id });
    const staff = await Staff.findOneAndUpdate(
      { staff_id: erpData.staff_id },
      {
        staff_id: erpData.staff_id,
        name: erpData.name,
        salute: erpData.salute,
        designation: erpData.designation,
        department_code: erpData.department_code,
        department_name: erpData.department_name,
        college_email: erpData.college_email,
        email: erpData.email,
        phone: erpData.phone,
        profile_pic: erpData.profile_pic,
        raw: erpData,
      },
      { upsert: true, new: true }
    );

    const erpDob = normalizeDob(extractErpDob(erpData));
    const storedDob = normalizeDob(existing?.dob);
    const recordDob = erpDob || storedDob;

    if (!recordDob) {
      return res.status(400).json({
        message: "Date of Birth not on record for this Staff ID. Please contact admin.",
      });
    }

    if (recordDob !== enteredDob) {
      return res.status(401).json({ message: "Incorrect Date of Birth" });
    }

    staff.lastLoginAt = new Date();
    await staff.save();

    const isHOD = isHodDesignation(staff.designation);

    const token = jwt.sign(
      { staff_id: staff.staff_id, isAdmin: false, isHOD, department_code: staff.department_code },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    res.json({
      token,
      staff: {
        staff_id: staff.staff_id,
        name: staff.name,
        salute: staff.salute,
        designation: staff.designation,
        department_name: staff.department_name,
        department_code: staff.department_code,
        profile_pic: staff.profile_pic,
        isHOD,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login failed", error: err.message });
  }
});

// ADMIN LOGIN (separate, id + password)
router.post("/admin-login", async (req, res) => {
  try {
    const { adminId, password } = req.body;
    const admin = await Admin.findOne({ adminId });
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    const match = await bcrypt.compare(password, admin.passwordHash);
    if (!match) return res.status(400).json({ message: "Incorrect password" });

    const token = jwt.sign(
      { staff_id: admin.adminId, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    res.json({ token, admin: { adminId: admin.adminId, name: admin.name } });
  } catch (err) {
    res.status(500).json({ message: "Admin login failed", error: err.message });
  }
});

module.exports = router;
