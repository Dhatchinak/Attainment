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

// Manual bulk save from the admin CIA editor. Staff can view CIA but cannot modify it.
// body: { entries: [{ studentId, componentMarks: {T1:{obtained,max}, ...} }] }
router.post("/:allocationId/bulk", async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });
  if (!req.user.isAdmin) {
    return res.status(403).json({ message: "CIA marks can be updated only by Admin" });
  }

  const { entries } = req.body;
  if (!Array.isArray(entries)) return res.status(400).json({ message: "entries array required" });

  const settings = await AttainmentSettings.findOne({ allocation: allocation._id });
  if (!settings) return res.status(400).json({ message: "Set CIA components and thresholds before entering CIA marks" });

  const maxByKey = {};
  (settings.ciaComponents || []).forEach((c) => (maxByKey[c.key] = Number(c.maxMarks) || 0));

  const ops = [];
  for (const entry of entries) {
    const fixed = {};
    for (const [key, mark] of Object.entries(entry.componentMarks || {})) {
      if (mark == null || mark.obtained === undefined || mark.obtained === null || mark.obtained === "") continue;
      const max = Number(mark.max) || maxByKey[key] || 0;
      const obtained = Number(mark.obtained);
      if (!Number.isFinite(obtained) || obtained < 0 || max <= 0 || obtained > max) {
        return res.status(400).json({ message: `${key} mark must be between 0 and ${max || "its configured maximum"}` });
      }
      fixed[key] = { obtained, max };
    }

    if (Object.keys(fixed).length > 0) {
      ops.push({
        updateOne: {
          filter: { allocation: allocation._id, student: entry.studentId },
          update: { $set: { componentMarks: fixed, calculationReady: true, source: "admin" } },
          upsert: true,
        },
      });
    } else {
      // Empty rows stay truly empty, so ciaEntered is not falsely marked complete.
      ops.push({ deleteOne: { filter: { allocation: allocation._id, student: entry.studentId } } });
    }
  }

  if (ops.length) await CIAMark.bulkWrite(ops, { ordered: false });
  const count = await CIAMark.countDocuments({ allocation: allocation._id, calculationReady: { $ne: false } });
  res.json({ message: "CIA marks saved", rowsWithMarks: count });
});

// Bulk upload via Excel. Expected columns: Roll No (or regNo), Name, then one column
// per configured component key (e.g. T1, T2, Seminar, Assignment, Innovative).
router.post("/:allocationId/upload", upload.single("file"), async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });
  if (!req.user.isAdmin) {
    return res.status(403).json({ message: "CIA marks can be updated only by Admin" });
  }
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
    for (const comp of settings.ciaComponents) {
      const raw = row[comp.key];
      if (raw === undefined || raw === null || raw === "") continue;
      const obtained = Number(raw);
      const maxCol = row[`${comp.key}_max`];
      const max = maxCol !== undefined && maxCol !== "" ? Number(maxCol) || comp.maxMarks : comp.maxMarks;
      if (!Number.isFinite(obtained) || obtained < 0 || obtained > max) {
        skipped++;
        continue;
      }
      componentMarks[comp.key] = { obtained, max };
    }

    if (Object.keys(componentMarks).length > 0) {
      await CIAMark.findOneAndUpdate(
        { allocation: allocation._id, student: student._id },
        { $set: { componentMarks, calculationReady: true, source: "admin" } },
        { upsert: true }
      );
      updated++;
    }
  }

  res.json({ message: "CIA bulk upload complete", updated, skipped, total: rows.length });
});

module.exports = router;
