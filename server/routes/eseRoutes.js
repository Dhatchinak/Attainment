const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const ESEMark = require("../models/ESEMark");
const Student = require("../models/Student");
const Allocation = require("../models/Allocation");
const AttainmentSettings = require("../models/AttainmentSettings");
const { authRequired } = require("../middleware/auth");
const { computeExamStats } = require("../utils/attainmentCalc");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
router.use(authRequired);

async function assertOwnership(req, allocationId) {
  const allocation = await Allocation.findById(allocationId);
  if (!allocation) return { error: "Allocation not found", status: 404 };
  if (!req.user.isAdmin && allocation.staff_id !== req.user.staff_id) {
    return { error: "Not your allocation", status: 403 };
  }
  return { allocation };
}

// Grid: students + existing ESE marks + live summary (appeared / above-threshold / % / outcome level)
router.get("/:allocationId", async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });

  const students = await Student.find({ batch: allocation.batch, isActive: true }).sort({ regNo: 1 });
  const marks = await ESEMark.find({ allocation: allocation._id });
  const settings = await AttainmentSettings.findOne({ allocation: allocation._id });

  const marksByStudent = {};
  marks.forEach((m) => (marksByStudent[String(m.student)] = m));

  const grid = students.map((s) => ({
    student: s,
    obtained: marksByStudent[String(s._id)]?.obtained ?? "",
    max: marksByStudent[String(s._id)]?.max ?? "",
  }));

  let summary = null;
  if (settings && marks.length > 0) {
    summary = computeExamStats(
      marks.map((m) => ({ obtained: m.obtained, max: m.max })),
      settings.thresholdMarksPercent,
      settings.targetPercent
    );
  }

  res.json({ paperCode: allocation.paperCode, grid, summary });
});

// Manual bulk save from the on-screen grid
router.post("/:allocationId/bulk", async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });

  const { entries } = req.body; // [{ studentId, obtained, max }]
  if (!Array.isArray(entries)) return res.status(400).json({ message: "entries array required" });

  const ops = entries
    .filter((e) => e.obtained !== "" && e.obtained !== null && e.obtained !== undefined)
    .map((e) => ({
      updateOne: {
        filter: { allocation: allocation._id, student: e.studentId },
        update: { $set: { obtained: Number(e.obtained) || 0, max: Number(e.max) || 100 } },
        upsert: true,
      },
    }));

  if (ops.length) await ESEMark.bulkWrite(ops);
  res.json({ message: "ESE marks saved", count: ops.length });
});

// Bulk upload via Excel. Expected columns: Roll No (or regNo), Name, ESE (or Marks) [, Max]
router.post("/:allocationId/upload", upload.single("file"), async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });
  if (!req.file) return res.status(400).json({ message: "Excel file required" });

  const wb = XLSX.read(req.file.buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const students = await Student.find({ batch: allocation.batch });
  const byReg = {};
  students.forEach((s) => (byReg[String(s.regNo).trim()] = s));

  let updated = 0, skipped = 0;
  for (const row of rows) {
    const regNo = String(row["Roll No"] || row.regNo || row.RegNo || row["Reg No"] || "").trim();
    const student = byReg[regNo];
    if (!student) { skipped++; continue; }

    const obtained = Number(row.ESE ?? row.Marks ?? row.marks ?? row.ese ?? 0) || 0;
    const max = Number(row.Max ?? row.max ?? row.MaxMarks ?? 100) || 100;

    await ESEMark.findOneAndUpdate(
      { allocation: allocation._id, student: student._id },
      { $set: { obtained, max } },
      { upsert: true }
    );
    updated++;
  }

  res.json({ message: "ESE bulk upload complete", updated, skipped, total: rows.length });
});

module.exports = router;
