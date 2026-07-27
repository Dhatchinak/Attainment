const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const CIAMark = require("../models/CIAMark");
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

// Grid: students + existing component marks + per-component live summary
router.get("/:allocationId", async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });

  const settings = await AttainmentSettings.findOne({ allocation: allocation._id });
  if (!settings) {
    return res.status(400).json({ message: "Set the CIA components and thresholds first" });
  }

  const students = await Student.find({ batch: allocation.batch, isActive: true }).sort({ regNo: 1 });
  const marks = await CIAMark.find({ allocation: allocation._id });

  const marksByStudent = {};
  marks.forEach((m) => (marksByStudent[String(m.student)] = m));

  const grid = students.map((s) => ({
    student: s,
    componentMarks: marksByStudent[String(s._id)]?.componentMarks || {},
  }));

  const componentSummary = settings.ciaComponents.map((comp) => {
    const scores = marks
      .map((m) => m.componentMarks?.[comp.key])
      .filter(Boolean)
      .map((v) => ({ obtained: Number(v.obtained) || 0, max: Number(v.max) || 0 }));
    const stats = computeExamStats(scores, settings.thresholdMarksPercent, settings.targetPercent);
    return { ...comp.toObject?.() ?? comp, ...stats };
  });

  res.json({ paperCode: allocation.paperCode, components: settings.ciaComponents, grid, componentSummary });
});

// Manual bulk save from the on-screen grid
// body: { entries: [{ studentId, componentMarks: {T1:{obtained,max}, ...} }] }
router.post("/:allocationId/bulk", async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });

  const { entries } = req.body;
  if (!Array.isArray(entries)) return res.status(400).json({ message: "entries array required" });

  // Safety net: never persist a mark with an obtained value but a missing/zero max —
  // that silently zeroes out attainment later. Backfill from the configured component's
  // maxMarks regardless of what the client sent.
  const settings = await AttainmentSettings.findOne({ allocation: allocation._id });
  const maxByKey = {};
  (settings?.ciaComponents || []).forEach((c) => (maxByKey[c.key] = c.maxMarks));

  const ops = entries.map((e) => {
    const fixed = {};
    Object.entries(e.componentMarks || {}).forEach(([key, mark]) => {
      if (mark == null || mark.obtained === undefined || mark.obtained === null || mark.obtained === "") return;
      fixed[key] = {
        obtained: Number(mark.obtained) || 0,
        max: Number(mark.max) || maxByKey[key] || 0,
      };
    });
    return {
      updateOne: {
        filter: { allocation: allocation._id, student: e.studentId },
        update: { $set: { componentMarks: fixed } },
        upsert: true,
      },
    };
  });

  if (ops.length) await CIAMark.bulkWrite(ops);
  res.json({ message: "CIA marks saved", count: ops.length });
});

// Bulk upload via Excel. Expected columns: Roll No (or regNo), Name, then one column
// per configured component key (e.g. T1, T2, Seminar, Assignment, Innovative).
router.post("/:allocationId/upload", upload.single("file"), async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });
  if (!req.file) return res.status(400).json({ message: "Excel file required" });

  const settings = await AttainmentSettings.findOne({ allocation: allocation._id });
  if (!settings) return res.status(400).json({ message: "Set the CIA components and thresholds first" });

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

    const componentMarks = {};
    settings.ciaComponents.forEach((comp) => {
      const obtained = Number(row[comp.key] ?? 0) || 0;
      const maxCol = row[`${comp.key}_max`];
      const max = maxCol !== undefined && maxCol !== "" ? Number(maxCol) || comp.maxMarks : comp.maxMarks;
      componentMarks[comp.key] = { obtained, max };
    });

    await CIAMark.findOneAndUpdate(
      { allocation: allocation._id, student: student._id },
      { $set: { componentMarks } },
      { upsert: true }
    );
    updated++;
  }

  res.json({ message: "CIA bulk upload complete", updated, skipped, total: rows.length });
});

module.exports = router;