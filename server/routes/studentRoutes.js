const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const Student = require("../models/Student");
const Allocation = require("../models/Allocation");
const { authRequired, adminRequired } = require("../middleware/auth");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authRequired);

// Staff: get roster for the batch of a given allocation
router.get("/by-allocation/:allocationId", async (req, res) => {
  const allocation = await Allocation.findById(req.params.allocationId);
  if (!allocation) return res.status(404).json({ message: "Allocation not found" });
  if (!req.user.isAdmin && allocation.staff_id !== req.user.staff_id) {
    return res.status(403).json({ message: "Not your allocation" });
  }
  const students = await Student.find({ batch: allocation.batch, isActive: true }).sort({ regNo: 1 });
  res.json(students);
});

// Admin: add ONE student manually (upsert, same rules as bulk upload)
router.post("/single-add", adminRequired, async (req, res) => {
  try {
    const { regNo, name, batch, academicYear, email, phone } = req.body;
    if (!regNo || !name || !batch || !academicYear) {
      return res.status(400).json({ message: "regNo, name, batch and academicYear are required" });
    }
    const student = await Student.findOneAndUpdate(
      { regNo: String(regNo).trim(), batch },
      { regNo: String(regNo).trim(), name: String(name).trim(), batch, academicYear, email: email || "", phone: phone || "" },
      { upsert: true, new: true }
    );
    res.status(201).json(student);
  } catch (err) {
    res.status(500).json({ message: "Failed to add student", error: err.message });
  }
});

// Admin: bulk upload students via Excel (columns: regNo, name, email, phone)
router.post("/bulk-upload", adminRequired, upload.single("file"), async (req, res) => {
  try {
    const { batch, academicYear } = req.body;
    if (!batch || !academicYear) return res.status(400).json({ message: "batch and academicYear required" });
    if (!req.file) return res.status(400).json({ message: "Excel file required" });

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    let created = 0, updated = 0, skipped = 0;
    for (const row of rows) {
      const regNo = String(row.regNo || row.RegNo || row["Reg No"] || "").trim();
      const name = String(row.name || row.Name || "").trim();
      if (!regNo || !name) { skipped++; continue; }

      const result = await Student.findOneAndUpdate(
        { regNo, batch },
        {
          regNo,
          name,
          batch,
          academicYear,
          email: row.email || row.Email || "",
          phone: row.phone || row.Phone || "",
        },
        { upsert: true, new: true, rawResult: true }
      );
      if (result.lastErrorObject?.updatedExisting) updated++; else created++;
    }

    res.json({ message: "Upload complete", created, updated, skipped, total: rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Bulk upload failed", error: err.message });
  }
});

// Admin: list/manage students of a batch
router.get("/by-batch/:batchId", adminRequired, async (req, res) => {
  const students = await Student.find({ batch: req.params.batchId }).sort({ regNo: 1 });
  res.json(students);
});

module.exports = router;
