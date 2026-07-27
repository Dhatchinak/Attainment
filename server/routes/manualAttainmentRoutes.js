const express = require("express");
const AcademicYear = require("../models/AcademicYear");
const AdmissionBatch = require("../models/AdmissionBatch");
const Batch = require("../models/Batch");
const Allocation = require("../models/Allocation");
const Student = require("../models/Student");
const ESEMark = require("../models/ESEMark");
const CIAMark = require("../models/CIAMark");
const ERPStudentCache = require("../models/ERPStudentCache");
const { authRequired } = require("../middleware/auth");
const {
  currentAcademicYear,
  inferDegree,
  admissionYearFromRoll,
  rollMatchesBatch,
  fetchAllStudents,
  fetchStudentReport,
} = require("../utils/attainmentApi");

const router = express.Router();
router.use(authRequired);

async function ensureCurrentAcademicYear() {
  const year = currentAcademicYear();
  await AcademicYear.updateMany({ year: { $ne: year } }, { $set: { isActive: false } });
  return AcademicYear.findOneAndUpdate(
    { year },
    { $set: { isActive: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function syncStudentCache(force = false) {
  const count = await ERPStudentCache.countDocuments();
  const newest = await ERPStudentCache.findOne().sort({ syncedAt: -1 }).lean();
  const stale = !newest || Date.now() - new Date(newest.syncedAt).getTime() > 12 * 60 * 60 * 1000;
  if (!force && count && !stale) return { count, refreshed: false };

  const rows = await fetchAllStudents();
  const ops = rows.map((s) => ({
    updateOne: {
      filter: { rollno: s.rollno },
      update: { $set: { ...s, degree: inferDegree(s.course), syncedAt: new Date() } },
      upsert: true,
    },
  }));
  if (ops.length) await ERPStudentCache.bulkWrite(ops, { ordered: false });
  return { count: rows.length, refreshed: true };
}

async function syncDetectedAdmissionBatches() {
  const currentStart = Number(currentAcademicYear().slice(0, 4));
  const rows = await ERPStudentCache.find({}, { rollno: 1, degree: 1, course: 1 }).lean();
  const detected = new Map();

  rows.forEach((student) => {
    const degree = student.degree || inferDegree(student.course);
    const admissionYear = admissionYearFromRoll(student.rollno, currentStart + 1);
    if (!admissionYear || admissionYear < currentStart - 6 || admissionYear > currentStart + 1) return;
    detected.set(`${degree}:${admissionYear}`, { degree, admissionYear });
  });

  const ops = [...detected.values()].map(({ degree, admissionYear }) => ({
    updateOne: {
      filter: { degree, admissionYear },
      update: {
        $setOnInsert: {
          degree,
          admissionYear,
          label: `${admissionYear} Batch`,
          source: "attainment_api",
          isActive: true,
        },
      },
      upsert: true,
    },
  }));
  if (ops.length) await AdmissionBatch.bulkWrite(ops, { ordered: false });
}

function batchStudentFilter(rows, admissionYear) {
  return rows.filter((student) => rollMatchesBatch(student.rollno, Number(admissionYear)));
}

router.get("/bootstrap", async (req, res) => {
  try {
    const academicYear = await ensureCurrentAcademicYear();
    const cache = await syncStudentCache(req.query.refresh === "1");
    await syncDetectedAdmissionBatches();
    res.json({ academicYear, cache });
  } catch (err) {
    res.status(502).json({ message: "Unable to load current ERP student data", error: err.message });
  }
});

router.get("/admission-batches", async (req, res) => {
  const { degree } = req.query;
  if (!degree) return res.status(400).json({ message: "degree is required" });
  await syncStudentCache(false);
  await syncDetectedAdmissionBatches();
  const rows = await AdmissionBatch.find({ degree, isActive: true }).sort({ admissionYear: -1 }).lean();
  res.json(rows);
});

router.get("/programmes", async (req, res) => {
  const { degree, admissionYear } = req.query;
  if (!degree || !admissionYear) return res.status(400).json({ message: "degree and batch are required" });
  await syncStudentCache(false);
  const rows = await ERPStudentCache.find({ degree }).lean();
  const programmes = [...new Set(batchStudentFilter(rows, admissionYear).map((s) => s.course).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  res.json(programmes);
});

router.get("/years", async (req, res) => {
  const { degree, course, admissionYear } = req.query;
  if (!degree || !course || !admissionYear) return res.status(400).json({ message: "degree, batch and programme are required" });
  const rows = await ERPStudentCache.find({ degree, course }).lean();
  const years = [...new Set(batchStudentFilter(rows, admissionYear).map((s) => Number(s.year)).filter(Boolean))]
    .sort((a, b) => a - b);
  res.json(years);
});

router.get("/classes", async (req, res) => {
  const { degree, course, year, admissionYear } = req.query;
  if (!degree || !course || !year || !admissionYear) return res.status(400).json({ message: "degree, batch, programme and year are required" });
  const rows = await ERPStudentCache.find({ degree, course, year: Number(year) }).sort({ rollno: 1 }).lean();
  const selectedBatch = batchStudentFilter(rows, admissionYear);
  const groups = new Map();
  selectedBatch.forEach((s) => {
    const section = s.section || "NIL";
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(s);
  });
  res.json([...groups.entries()].map(([section, students]) => ({
    key: `${admissionYear}::${course}::${year}::${section}`,
    section,
    displayName: `${year} Year ${course}${section !== "NIL" ? ` - ${section}` : ""}`,
    studentCount: students.length,
    sampleRollno: students[0]?.rollno,
  })));
});

router.get("/papers", async (req, res) => {
  try {
    const { course, year, section = "NIL", admissionYear } = req.query;
    if (!course || !year || !admissionYear) return res.status(400).json({ message: "batch, programme and year are required" });
    const students = await ERPStudentCache.find({ course, year: Number(year), section }).sort({ rollno: 1 }).lean();
    const selected = batchStudentFilter(students, admissionYear).slice(0, 8);
    const papers = new Map();
    for (const student of selected) {
      const report = await fetchStudentReport(student.rollno);
      [...report.ese, ...report.cia].forEach((p) => {
        if (!papers.has(p.paperCode)) papers.set(p.paperCode, { paperCode: p.paperCode, paperName: p.title, paperType: p.paperType });
      });
    }
    res.json([...papers.values()].sort((a, b) => a.paperCode.localeCompare(b.paperCode)));
  } catch (err) {
    res.status(502).json({ message: "Unable to fetch paper codes for this class", error: err.message });
  }
});

router.post("/prepare", async (req, res) => {
  try {
    const { degree, admissionBatchId, admissionYear, course, year, section = "NIL", paperCode, paperName, paperType } = req.body;
    if (!degree || !admissionYear || !course || !year || !paperCode) return res.status(400).json({ message: "Complete all manual selections" });

    const academicYearDoc = await ensureCurrentAcademicYear();
    const admissionBatch = admissionBatchId ? await AdmissionBatch.findById(admissionBatchId) : null;
    if (admissionBatchId && (!admissionBatch || !admissionBatch.isActive)) return res.status(400).json({ message: "Selected admission batch is unavailable" });

    const roster = await ERPStudentCache.find({ degree, course, year: Number(year), section }).sort({ rollno: 1 }).lean();
    const selectedRoster = batchStudentFilter(roster, admissionYear);
    if (!selectedRoster.length) return res.status(404).json({ message: "No students found for the selected batch and class" });

    const batchLabel = admissionBatch?.label || `${admissionYear} Batch`;
    const displayName = `${batchLabel} · ${year} Year ${course}${section !== "NIL" ? ` - ${section}` : ""}`;
    const batch = await Batch.findOneAndUpdate(
      { course, year: String(year), section, academicYear: academicYearDoc._id },
      { $set: { programme: degree, course, year: String(year), section, academicYear: academicYearDoc._id, admissionYear: Number(admissionYear), admissionBatch: admissionBatch?._id, displayName, source: "attainment_api", isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const studentOps = selectedRoster.map((s) => ({
      updateOne: {
        filter: { regNo: s.rollno, batch: batch._id },
        update: { $set: { regNo: s.rollno, name: s.name, batch: batch._id, academicYear: academicYearDoc._id, isActive: true } },
        upsert: true,
      },
    }));
    if (studentOps.length) await Student.bulkWrite(studentOps, { ordered: false });

    const lockKey = `${admissionYear}-${course}-${year}-${section}-${paperCode}-${academicYearDoc.year}`.toUpperCase().replace(/\s+/g, "_");
    const allocation = await Allocation.findOneAndUpdate(
      { staff_id: req.user.staff_id, batch: batch._id, academicYear: academicYearDoc._id, paperCode },
      { $set: { staff_id: req.user.staff_id, batch: batch._id, academicYear: academicYearDoc._id, semester: Number(req.body.semester || 1), paperCode, paperName: paperName || paperCode, paperType: paperType || "Theory", lockKey, source: "attainment_api", isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const localStudents = await Student.find({ batch: batch._id, isActive: true });
    const byReg = new Map(localStudents.map((s) => [s.regNo, s]));
    const eseOps = [];
    const ciaOps = [];
    const componentMax = { T1: 30, T2: 30, AR: 20, AT: 10, SE: 20, IT: 10, MCQ: 10, LIB: 10 };

    for (const sourceStudent of selectedRoster) {
      const student = byReg.get(sourceStudent.rollno);
      if (!student) continue;
      const report = await fetchStudentReport(sourceStudent.rollno);
      const ese = report.ese.find((p) => p.paperCode === paperCode);
      const cia = report.cia.find((p) => p.paperCode === paperCode);
      if (ese) eseOps.push({ updateOne: { filter: { allocation: allocation._id, student: student._id }, update: { $set: { obtained: Number(ese.obtained) || 0, max: 100 } }, upsert: true } });
      if (cia) {
        const componentMarks = {};
        Object.entries(cia.componentMarks || {}).forEach(([key, obtained]) => {
          componentMarks[key] = { obtained: Number(obtained) || 0, max: componentMax[key] || 100 };
        });
        ciaOps.push({ updateOne: { filter: { allocation: allocation._id, student: student._id }, update: { $set: { componentMarks } }, upsert: true } });
      }
    }
    if (eseOps.length) await ESEMark.bulkWrite(eseOps, { ordered: false });
    if (ciaOps.length) await CIAMark.bulkWrite(ciaOps, { ordered: false });

    res.json({ academicYear: academicYearDoc, admissionBatch, batch, allocation, imported: { students: localStudents.length, ese: eseOps.length, cia: ciaOps.length } });
  } catch (err) {
    console.error(err);
    res.status(502).json({ message: "Failed to prepare attainment from ERP data", error: err.message });
  }
});

module.exports = router;
