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

function getEseMax(settings) {
  const value = Number(settings?.eseMaxMarks);
  return Number.isFinite(value) && value > 0 ? value : 75;
}

// Grid: students + existing ESE marks + summary.
// IMPORTANT: the configured paper-level ESE maximum is the single source of truth.
router.get("/:allocationId", async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });

  const students = await Student.find({ batch: allocation.batch, isActive: true }).sort({ regNo: 1 });
  const marks = await ESEMark.find({ allocation: allocation._id });
  const settings = await AttainmentSettings.findOne({ allocation: allocation._id });

  // Legacy repair: the earlier build defaulted ESE to 50, but the reference
  // workbook's End Semester Examination is out of 75. If saved marks already
  // contain a value above 50 (and none above 75), 50 cannot be the true max.
  // Correct that old setting once so staff do not have to re-enter the paper.
  if (settings && Number(settings.eseMaxMarks) === 50) {
    const stored = marks.map((m) => Number(m.obtained)).filter(Number.isFinite);
    const highest = stored.length ? Math.max(...stored) : 0;
    if (highest > 50 && highest <= 75) {
      settings.eseMaxMarks = 75;
      await settings.save();
    }
  }

  const eseMaxMarks = getEseMax(settings);

  const marksByStudent = {};
  marks.forEach((m) => (marksByStudent[String(m.student)] = m));

  const grid = students.map((s) => ({
    student: s,
    obtained: marksByStudent[String(s._id)]?.obtained ?? "",
    max: eseMaxMarks,
  }));

  let summary = null;
  if (settings && marks.length > 0) {
    summary = computeExamStats(
      marks.map((m) => ({ obtained: m.obtained, max: eseMaxMarks })),
      settings.thresholdMarksPercent,
      settings.targetPercent
    );
  }

  const thresholdMarksPercent = Number(settings?.thresholdMarksPercent ?? 50);
  const targetPercent = Number(settings?.targetPercent ?? 70);
  const thresholdMark = Number(((eseMaxMarks * thresholdMarksPercent) / 100).toFixed(2));

  res.json({
    paperCode: allocation.paperCode,
    grid,
    summary,
    eseMaxMarks,
    thresholdMarksPercent,
    targetPercent,
    thresholdMark,
  });
});

// Manual bulk save from the on-screen grid.
router.post("/:allocationId/bulk", async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });

  const settings = await AttainmentSettings.findOne({ allocation: allocation._id });
  if (!settings) return res.status(400).json({ message: "Save threshold settings before entering ESE marks" });
  const eseMaxMarks = getEseMax(settings);

  const { entries } = req.body;
  if (!Array.isArray(entries)) return res.status(400).json({ message: "entries array required" });

  const invalid = entries.find((e) => {
    if (e.obtained === "" || e.obtained === null || e.obtained === undefined) return false;
    const mark = Number(e.obtained);
    return !Number.isFinite(mark) || mark < 0 || mark > eseMaxMarks;
  });
  if (invalid) {
    return res.status(400).json({ message: `ESE marks must be between 0 and ${eseMaxMarks}` });
  }

  const ops = entries
    .filter((e) => e.obtained !== "" && e.obtained !== null && e.obtained !== undefined)
    .map((e) => ({
      updateOne: {
        filter: { allocation: allocation._id, student: e.studentId },
        update: { $set: { obtained: Number(e.obtained), max: eseMaxMarks } },
        upsert: true,
      },
    }));

  if (ops.length) await ESEMark.bulkWrite(ops);

  const savedMarks = await ESEMark.find({ allocation: allocation._id });
  const summary = computeExamStats(
    savedMarks.map((m) => ({ obtained: m.obtained, max: eseMaxMarks })),
    settings.thresholdMarksPercent,
    settings.targetPercent
  );

  res.json({ message: "ESE marks saved", count: ops.length, eseMaxMarks, summary });
});

// Bulk upload via Excel. Expected columns: Roll No (or regNo), Name, ESE (or Marks).
// Optional Max is accepted only when it matches the configured ESE maximum.
router.post("/:allocationId/upload", upload.single("file"), async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });
  if (!req.file) return res.status(400).json({ message: "Excel file required" });

  const settings = await AttainmentSettings.findOne({ allocation: allocation._id });
  if (!settings) return res.status(400).json({ message: "Save threshold settings before uploading ESE marks" });
  const eseMaxMarks = getEseMax(settings);

  const wb = XLSX.read(req.file.buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const students = await Student.find({ batch: allocation.batch });
  const byReg = {};
  students.forEach((s) => (byReg[String(s.regNo).trim()] = s));

  let updated = 0, skipped = 0;
  const errors = [];

  for (const [index, row] of rows.entries()) {
    const regNo = String(row["Roll No"] || row.regNo || row.RegNo || row["Reg No"] || "").trim();
    const student = byReg[regNo];
    if (!student) { skipped++; continue; }

    const rawObtained = row.ESE ?? row.Marks ?? row.marks ?? row.ese;
    const obtained = Number(rawObtained);
    if (!Number.isFinite(obtained) || obtained < 0 || obtained > eseMaxMarks) {
      errors.push(`Row ${index + 2}: ${regNo || "unknown student"} mark must be 0-${eseMaxMarks}`);
      skipped++;
      continue;
    }

    const providedMax = row.Max ?? row.max ?? row.MaxMarks;
    if (providedMax !== undefined && providedMax !== "" && Number(providedMax) !== eseMaxMarks) {
      errors.push(`Row ${index + 2}: Max must be ${eseMaxMarks}`);
      skipped++;
      continue;
    }

    await ESEMark.findOneAndUpdate(
      { allocation: allocation._id, student: student._id },
      { $set: { obtained, max: eseMaxMarks } },
      { upsert: true }
    );
    updated++;
  }

  res.json({
    message: "ESE bulk upload complete",
    updated,
    skipped,
    total: rows.length,
    eseMaxMarks,
    errors: errors.slice(0, 10),
  });
});

module.exports = router;
