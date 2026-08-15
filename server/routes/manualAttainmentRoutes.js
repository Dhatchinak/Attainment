const express = require("express");
const AcademicYear = require("../models/AcademicYear");
const AdmissionBatch = require("../models/AdmissionBatch");
const Batch = require("../models/Batch");
const Allocation = require("../models/Allocation");
const Student = require("../models/Student");
const ESEMark = require("../models/ESEMark");
const ERPStudentCache = require("../models/ERPStudentCache");
const { authRequired } = require("../middleware/auth");
const { deriveSemesterFromPaperCode } = require("../utils/erpHelpers");
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

async function ensureAcademicYear(year = currentAcademicYear()) {
  // Historical academic years must remain available because staff can prepare
  // attainment for previous batches. Never deactivate older years here.
  return AcademicYear.findOneAndUpdate(
    { year },
    { $set: { isActive: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

function academicYearForBatchSemester(admissionYear, semester) {
  const batchStart = Number(admissionYear);
  const sem = Number(semester);
  if (!Number.isFinite(batchStart) || !Number.isFinite(sem) || sem < 1) return currentAcademicYear();
  const start = batchStart + Math.floor((sem - 1) / 2);
  return `${start}-${start + 1}`;
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
    const academicYear = await ensureAcademicYear();
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

router.get("/semesters", async (req, res) => {
  try {
    const { degree, course, admissionYear } = req.query;
    if (!degree || !course || !admissionYear) {
      return res.status(400).json({ message: "degree, batch and programme are required" });
    }

    const rows = await ERPStudentCache.find({ degree, course }).sort({ rollno: 1 }).lean();
    const selectedBatch = batchStudentFilter(rows, admissionYear);
    if (!selectedBatch.length) return res.json([]);

    // A few students are enough to discover the paper catalogue for a batch.
    // Use multiple students so electives / missing marks on one record do not hide a semester.
    const sample = selectedBatch.slice(0, 6);
    const reports = await Promise.all(sample.map((student) => fetchStudentReport(student.rollno)));
    const found = new Set();

    reports.forEach((report) => {
      [...report.ese, ...report.cia].forEach((paper) => {
        const direct = Number(paper.semester || paper.semesterLabel || 0);
        const derived = deriveSemesterFromPaperCode(paper.paperCode);
        const semester = direct || derived;
        if (semester >= 1 && semester <= 10) found.add(semester);
      });
    });

    // Show the complete semester sequence, not only semesters that happened to
    // appear in the sampled ERP rows. For normal UG/PG this gives 1–6 / 1–4;
    // if ERP reveals a longer integrated programme (for example semester 9),
    // expand automatically up to that semester.
    const defaultMax = degree === "PG" ? 4 : 6;
    const detectedMax = found.size ? Math.max(...found) : 0;
    const maxSemester = Math.max(defaultMax, detectedMax);
    const allSemesters = Array.from({ length: maxSemester }, (_, index) => index + 1);

    res.json(allSemesters);
  } catch (err) {
    res.status(502).json({ message: "Unable to discover semesters for this batch", error: err.message });
  }
});

router.get("/classes", async (req, res) => {
  const { degree, course, admissionYear } = req.query;
  if (!degree || !course || !admissionYear) {
    return res.status(400).json({ message: "degree, batch and programme are required" });
  }

  const rows = await ERPStudentCache.find({ degree, course }).sort({ rollno: 1 }).lean();
  const selectedBatch = batchStudentFilter(rows, admissionYear);
  const groups = new Map();

  selectedBatch.forEach((student) => {
    const section = student.section || "NIL";
    const studyYear = Number(student.year) || 0;
    const key = `${studyYear}::${section}`;
    if (!groups.has(key)) groups.set(key, { section, studyYear, students: [] });
    groups.get(key).students.push(student);
  });

  res.json([...groups.values()].map(({ section, studyYear, students }) => ({
    key: `${admissionYear}::${course}::${studyYear}::${section}`,
    section,
    studyYear,
    displayName: `${studyYear ? `Year ${studyYear}` : "Class"}${section !== "NIL" ? ` · Section ${section}` : ""}`,
    studentCount: students.length,
    sampleRollno: students[0]?.rollno,
  })));
});

router.get("/papers", async (req, res) => {
  try {
    const { degree, course, section = "NIL", admissionYear, semester } = req.query;
    if (!degree || !course || !admissionYear || !semester) {
      return res.status(400).json({ message: "batch, programme, semester and class are required" });
    }

    const rows = await ERPStudentCache.find({ degree, course, section }).sort({ rollno: 1 }).lean();
    const selected = batchStudentFilter(rows, admissionYear).slice(0, 8);
    const reports = await Promise.all(selected.map((student) => fetchStudentReport(student.rollno)));
    const papers = new Map();

    reports.forEach((report) => {
      [...report.ese, ...report.cia].forEach((paper) => {
        const paperSemester = Number(paper.semester || paper.semesterLabel || 0) || deriveSemesterFromPaperCode(paper.paperCode);
        if (Number(paperSemester) !== Number(semester)) return;
        if (!papers.has(paper.paperCode)) {
          papers.set(paper.paperCode, {
            paperCode: paper.paperCode,
            paperName: paper.title,
            paperType: paper.paperType,
            semester: Number(semester),
          });
        }
      });
    });

    res.json([...papers.values()].sort((a, b) => a.paperCode.localeCompare(b.paperCode)));
  } catch (err) {
    res.status(502).json({ message: "Unable to fetch papers for the selected semester", error: err.message });
  }
});

router.post("/prepare", async (req, res) => {
  try {
    const { degree, admissionBatchId, admissionYear, course, year, section = "NIL", semester, paperCode, paperName, paperType } = req.body;
    if (!degree || !admissionYear || !course || !year || !semester || !paperCode) return res.status(400).json({ message: "Complete all manual selections" });

    // Academic year follows the admission batch + semester, not the current
    // calendar year. Example: 2025 batch Sem 1/2 -> 2025-2026, Sem 3/4 -> 2026-2027.
    const academicYearLabel = academicYearForBatchSemester(admissionYear, semester);
    const academicYearDoc = await ensureAcademicYear(academicYearLabel);
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
      { $set: { staff_id: req.user.staff_id, batch: batch._id, academicYear: academicYearDoc._id, semester: Number(semester), paperCode, paperName: paperName || paperCode, paperType: paperType || "Theory", lockKey, source: "attainment_api", isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const localStudents = await Student.find({ batch: batch._id, isActive: true });
    const byReg = new Map(localStudents.map((s) => [s.regNo, s]));
    const eseOps = [];

    for (const sourceStudent of selectedRoster) {
      const student = byReg.get(sourceStudent.rollno);
      if (!student) continue;
      const report = await fetchStudentReport(sourceStudent.rollno);
      const ese = report.ese.find((p) => p.paperCode === paperCode);
      if (ese) {
        eseOps.push({
          updateOne: {
            filter: { allocation: allocation._id, student: student._id },
            update: { $set: { obtained: Number(ese.obtained) || 0, max: 100 } },
            upsert: true,
          },
        });
      }
      // CIA is intentionally NOT imported from ERP here. Question-wise T1/T2
      // and activity marks are matched from the Admin-imported CIA workbook
      // stored in MongoDB by paper code + academic year + ODD/EVEN term.
    }
    if (eseOps.length) await ESEMark.bulkWrite(eseOps, { ordered: false });

    res.json({
      academicYear: academicYearDoc,
      admissionBatch,
      batch,
      allocation,
      imported: { students: localStudents.length, ese: eseOps.length, cia: 0 },
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ message: "Failed to prepare attainment from ERP data", error: err.message });
  }
});

module.exports = router;
