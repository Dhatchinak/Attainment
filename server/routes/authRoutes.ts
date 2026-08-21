export {};
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Staff = require("../models/Staff");
const Admin = require("../models/Admin");
const DepartmentAccount = require("../models/DepartmentAccount");
const { fetchStaffFromERP } = require("../utils/externalApi");
const { startSyncJob, finishSyncJob } = require("../utils/syncJobs");
const { normalizeDepartmentCode } = require("../utils/departmentCredentials");

const router = express.Router();

router.get("/departments", async (req, res) => {
  const departments = await DepartmentAccount.find({ isActive: true })
    .select("departmentCode departmentName")
    .sort({ departmentName: 1 })
    .lean();
  res.json(departments);
});

router.post("/department-login", async (req, res) => {
  try {
    const departmentCode = normalizeDepartmentCode(req.body.departmentCode);
    const password = String(req.body.password || "").trim().toUpperCase();
    if (!departmentCode || !password) return res.status(400).json({ message: "Department and password are required" });

    const account = await DepartmentAccount.findOne({ departmentCode, isActive: true }).select("+passwordHash");
    if (!account) return res.status(404).json({ message: "Department login is not available" });
    if (!(await bcrypt.compare(password, account.passwordHash))) {
      return res.status(401).json({ message: "Incorrect department password" });
    }
    await DepartmentAccount.updateOne({ _id: account._id }, { $set: { lastLoginAt: new Date() } });

    const token = jwt.sign(
      { isDepartment: true, department_code: account.departmentCode, role: "department" },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );
    res.json({
      token,
      department: {
        departmentCode: account.departmentCode,
        departmentName: account.departmentName,
        programmeAliases: account.programmeAliases,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Department login failed", error: error.message });
  }
});

// Best-effort HOD detection from the ERP designation text (e.g. "HOD", "Head of Department",
// "Head of the Department - Computer Science"). There's no separate role table to check against,
// so this is the same signal the college's own paperwork uses.
function isHodDesignation(designation) {
  if (!designation) return false;
  return /\bhod\b|head\s*of\s*(the\s*)?department/i.test(designation);
}

function normalizeStaffIdInput(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (/^\d{1,3}$/.test(raw)) return `BHC-STE-00${raw.padStart(3, "0")}`;
  const full = raw.match(/^BHC-STE-(\d{1,5})$/);
  if (full) return `BHC-STE-${full[1].padStart(5, "0")}`;
  return raw;
}

// STAFF LOGIN: Staff ID only. The ID must resolve to an active college ERP record.
router.post("/login", async (req, res) => {
  let syncJob = null;
  try {
    const { staff_id } = req.body;
    if (!staff_id) {
      return res.status(400).json({ message: "Staff ID is required" });
    }
    const normalizedStaffId = normalizeStaffIdInput(staff_id);

    const erpData = await fetchStaffFromERP(normalizedStaffId);
    if (!erpData) {
      return res.status(404).json({ message: "Staff ID not found in ERP" });
    }
    if (erpData.isActive === false) {
      return res.status(403).json({ message: "This staff account is inactive" });
    }

    syncJob = await startSyncJob("STAFF_LOGIN", normalizedStaffId, { staff_id: normalizedStaffId });

    // Cache/update the verified ERP staff profile before issuing the portal session.
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
        source: "COLLEGE_ERP",
        lastSyncedAt: new Date(),
        lastSyncJob: syncJob._id,
      },
      { upsert: true, new: true }
    );
    await finishSyncJob(syncJob, "SUCCESS", { received: 1, updated: 1 });

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
    if (syncJob && syncJob.status === "RUNNING") {
      await finishSyncJob(syncJob, "FAILED", { failed: 1 }, [{ key: "staff", message: err.message }]).catch(() => {});
    }
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
