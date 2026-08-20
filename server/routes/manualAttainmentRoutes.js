const express = require("express");
const AcademicYear = require("../models/AcademicYear");
const AdmissionBatch = require("../models/AdmissionBatch");
const Batch = require("../models/Batch");
const Allocation = require("../models/Allocation");
const Student = require("../models/Student");
const ESEMark = require("../models/ESEMark");
const CIAMark = require("../models/CIAMark");
const ERPStudentCache = require("../models/ERPStudentCache");
const ERPStudentReport = require("../models/ERPStudentReport");
const { authRequired, adminRequired } = require("../middleware/auth");
const { deriveSemesterFromPaperCode } = require("../utils/erpHelpers");
const {
  currentAcademicYear,
  inferDegree,
  admissionYearFromRoll,
  rollMatchesBatch,
  fetchAllStudents,
  fetchStudentReport,
} = require("../utils/attainmentApi");
const { startSyncJob, finishSyncJob } = require("../utils/syncJobs");

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

async function syncStudentCache(force = false, requestedBy = "SYSTEM") {
  const count = await ERPStudentCache.countDocuments();
  const newest = await ERPStudentCache.findOne().sort({ syncedAt: -1 }).lean();
  const stale = !newest || Date.now() - new Date(newest.syncedAt).getTime() > 12 * 60 * 60 * 1000;
  if (!force && count && !stale) return { count, refreshed: false };

  const job = await startSyncJob("STUDENT_DIRECTORY", requestedBy, { force });
  let rows;
  try {
    rows = await fetchAllStudents();
  } catch (error) {
    await finishSyncJob(job, "FAILED", { failed: 1 }, [{ key: "directory", message: error.message }]);
    throw error;
  }
  const syncTime = new Date();
  const ops = rows.map((s) => ({
    updateOne: {
      filter: { rollno: s.rollno },
      update: {
        $set: { ...s, degree: inferDegree(s.course), source: "ATTAINMENT_API", sourcePayload: s.rawPayload || s, syncedAt: syncTime, lastSyncJob: job._id },
        $setOnInsert: { firstSyncedAt: syncTime },
      },
      upsert: true,
    },
  }));
  if (ops.length) await ERPStudentCache.bulkWrite(ops, { ordered: false });
  await finishSyncJob(job, "SUCCESS", { received: rows.length, updated: rows.length });
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
    const cache = { count: await ERPStudentCache.countDocuments(), refreshed: false, source: "MONGODB" };
    res.json({ academicYear, cache });
  } catch (err) {
    res.status(500).json({ message: "Unable to load migrated student data", error: err.message });
  }
});

router.get("/admission-batches", async (req, res) => {
  const { degree } = req.query;
  if (!degree) return res.status(400).json({ message: "degree is required" });
  const rows = await AdmissionBatch.find({ degree, isActive: true }).sort({ admissionYear: -1 }).lean();
  res.json(rows);
});

router.get("/programmes", async (req, res) => {
  const { degree, admissionYear } = req.query;
  if (!degree || !admissionYear) return res.status(400).json({ message: "degree and batch are required" });
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

    const reports = await ERPStudentReport.find({
      rollno: { $in: selectedBatch.map((student) => student.rollno) },
      admissionYear: Number(admissionYear), course,
    }).select("semester paperCode").lean();
    const found = new Set();

    reports.forEach((report) => {
      [report].forEach((paper) => {
        const direct = Number(paper.semester || 0);
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
    const selected = batchStudentFilter(rows, admissionYear);
    const reports = await ERPStudentReport.find({
      rollno: { $in: selected.map((student) => student.rollno) },
      admissionYear: Number(admissionYear), course, section,
      semester: Number(semester),
    }).select("paperCode paperTitle paperType semester").lean();
    const papers = new Map();

    reports.forEach((report) => {
      [report].forEach((paper) => {
        const paperSemester = Number(paper.semester || 0) || deriveSemesterFromPaperCode(paper.paperCode);
        if (Number(paperSemester) !== Number(semester)) return;
        if (!papers.has(paper.paperCode)) {
          papers.set(paper.paperCode, {
            paperCode: paper.paperCode,
            paperName: paper.paperTitle,
            paperType: paper.paperType,
            semester: Number(semester),
          });
        }
      });
    });

    res.json([...papers.values()].sort((a, b) => a.paperCode.localeCompare(b.paperCode)));
  } catch (err) {
    res.status(500).json({ message: "Unable to load migrated papers for the selected semester", error: err.message });
  }
});

router.post("/prepare", async (req, res) => {
  let syncJob = null;
  try {
    const { degree, admissionBatchId, admissionYear, course, year, section = "NIL", semester, paperCode, paperName, paperType } = req.body;
    if (!degree || !admissionYear || !course || !year || !semester || !paperCode) return res.status(400).json({ message: "Complete all manual selections" });

    // Academic year follows the admission batch + semester, not the current
    // calendar year. Example: 2025 batch Sem 1/2 -> 2025-2026, Sem 3/4 -> 2026-2027.
    const academicYearLabel = academicYearForBatchSemester(admissionYear, semester);
    syncJob = await startSyncJob(
      "CLASS_PREPARE",
      req.user.staff_id,
      { degree, admissionYear, course, year, section, semester, paperCode },
      academicYearLabel
    );
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
        update: { $set: { regNo: s.rollno, name: s.name, batch: batch._id, academicYear: academicYearDoc._id, isActive: true, source: "ATTAINMENT_API", sourceRecordId: s.rollno, lastSyncedAt: new Date() } },
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
    const ciaOps = [];
    const reportOps = [];
    const syncErrors = [];

    for (const sourceStudent of selectedRoster) {
      const student = byReg.get(sourceStudent.rollno);
      if (!student) continue;
      const savedReport = await ERPStudentReport.findOne({
        rollno: sourceStudent.rollno, paperCode, academicYear: academicYearLabel,
        admissionYear: Number(admissionYear), course, section,
      }).lean();
      if (!savedReport) {
        syncErrors.push({ key: sourceStudent.rollno, message: "Not migrated by Admin" });
        continue;
      }
      reportOps.push(savedReport);
      const ese = savedReport.ese;
      if (ese) {
        eseOps.push({
          updateOne: {
            filter: { allocation: allocation._id, student: student._id },
            update: { $set: { obtained: Number(ese.obtained) || 0, max: 100, source: "ATTAINMENT_API", sourcePayload: ese, lastSyncedAt: new Date(), lastSyncJob: syncJob._id } },
            upsert: true,
          },
        });
      }
      const cia = savedReport.cia;
      if (cia) {
        const componentMarks = {};
        Object.entries(cia.componentMarks || {}).forEach(([key, obtained]) => {
          componentMarks[key] = { obtained: Number(obtained) || 0, max: 0 };
        });
        ciaOps.push({
          updateOne: {
            filter: { allocation: allocation._id, student: student._id },
            update: { $set: { componentMarks, total: Number(cia.total) || 0, calculationReady: false, source: "ATTAINMENT_API", sourcePayload: cia, lastSyncedAt: new Date(), lastSyncJob: syncJob._id } },
            upsert: true,
          },
        });
      }
    }
    if (eseOps.length) await ESEMark.bulkWrite(eseOps, { ordered: false });
    if (ciaOps.length) await CIAMark.bulkWrite(ciaOps, { ordered: false });

    const status = syncErrors.length ? (reportOps.length ? "PARTIAL" : "FAILED") : "SUCCESS";
    await finishSyncJob(syncJob, status, {
      received: selectedRoster.length,
      updated: reportOps.length + eseOps.length + ciaOps.length,
      failed: syncErrors.length,
    }, syncErrors);

    res.json({
      academicYear: academicYearDoc,
      admissionBatch,
      batch,
      allocation,
      imported: { students: localStudents.length, ese: eseOps.length, cia: ciaOps.length, reportSnapshots: reportOps.length, source: "MONGODB_ONLY" },
      sync: { jobId: syncJob._id, status, failedStudents: syncErrors.length },
    });
  } catch (err) {
    console.error(err);
    if (syncJob && syncJob.status === "RUNNING") {
      await finishSyncJob(syncJob, "FAILED", { failed: 1 }, [{ key: "prepare", message: err.message }]).catch(() => {});
    }
    res.status(500).json({ message: "Failed to prepare attainment from migrated MongoDB data", error: err.message });
  }
});

/* Admin-only one-time API migration. Staff routes above never call the marks API. */
router.get("/admin/migration-options", adminRequired, async (req, res) => {
  try {
    if (req.query.refresh === "1" || !(await ERPStudentCache.countDocuments())) {
      await syncStudentCache(true, req.user.staff_id);
      await syncDetectedAdmissionBatches();
    }
    const rows = await ERPStudentCache.find().sort({ course: 1, year: 1, section: 1, rollno: 1 }).lean();
    const groups = new Map();
    rows.forEach((student) => {
      const admissionYear = admissionYearFromRoll(student.rollno);
      if (!admissionYear) return;
      const key = [admissionYear, student.degree, student.course, student.year, student.section || "NIL"].join("::");
      if (!groups.has(key)) groups.set(key, { admissionYear, degree: student.degree, course: student.course, year: student.year, section: student.section || "NIL", studentCount: 0 });
      groups.get(key).studentCount += 1;
    });
    const batches = [...groups.values()].sort((a, b) => b.admissionYear - a.admissionYear || a.course.localeCompare(b.course));
    const jobs = await require("../models/ApiSyncJob").find({ jobType: "ACADEMIC_DATA_MIGRATION" }).sort({ createdAt: -1 }).limit(50).lean();
    const configuredYears = await AcademicYear.find().select("year").sort({ year: -1 }).lean();
    const yearSet = new Set(configuredYears.map((item) => item.year));
    jobs.forEach((job) => { if (job.academicYear) yearSet.add(job.academicYear); });
    batches.forEach((batch) => {
      const duration = batch.degree === "PG" ? 2 : 3;
      for (let index = 0; index < duration; index += 1) {
        const start = Number(batch.admissionYear) + index;
        yearSet.add(`${start}-${start + 1}`);
      }
    });
    const academicYears = [...yearSet].filter(Boolean).sort().reverse();
    res.json({ batches, academicYears, jobs });
  } catch (error) {
    res.status(502).json({ message: "Could not load migration options", error: error.message });
  }
});

router.post("/admin/migrate", adminRequired, async (req, res) => {
  let job = null;
  try {
    const { academicYear, admissionYear, degree, course, year, section = "NIL", dataTypes = ["CIA", "ESE"] } = req.body;
    const wanted = [...new Set((dataTypes || []).map((value) => String(value).toUpperCase()))].filter((value) => ["CIA", "ESE"].includes(value));
    if (!academicYear || !admissionYear || !degree || !course || !year || !wanted.length) return res.status(400).json({ message: "Academic year, batch and CIA/ESE selection are required" });
    job = await startSyncJob("ACADEMIC_DATA_MIGRATION", req.user.staff_id, { admissionYear, degree, course, year, section, dataTypes: wanted }, academicYear);
    const yearDoc = await ensureAcademicYear(academicYear);
    const roster = batchStudentFilter(await ERPStudentCache.find({ degree, course, year: Number(year), section }).lean(), admissionYear);
    if (!roster.length) throw new Error("No students found for the selected exact batch and section");

    const batch = await Batch.findOneAndUpdate(
      { course, year: String(year), section, academicYear: yearDoc._id },
      { $set: { programme: degree, course, year: String(year), section, academicYear: yearDoc._id, admissionYear: Number(admissionYear), displayName: `${admissionYear} Batch · ${year} Year ${course}${section !== "NIL" ? ` - ${section}` : ""}`, source: "attainment_api", isActive: true, lastSyncedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (roster.length) await Student.bulkWrite(roster.map((student) => ({ updateOne: { filter: { regNo: student.rollno, batch: batch._id }, update: { $set: { regNo: student.rollno, name: student.name, batch: batch._id, academicYear: yearDoc._id, isActive: true, source: "ATTAINMENT_API", sourceRecordId: student.rollno, lastSyncedAt: new Date() } }, upsert: true } })), { ordered: false });

    const reportOps = [];
    const errors = [];
    let ciaCount = 0, eseCount = 0;
    for (const student of roster) {
      try {
        const report = await fetchStudentReport(student.rollno);
        const papers = new Map();
        report.ese.forEach((item) => papers.set(item.paperCode, { ...(papers.get(item.paperCode) || {}), ese: item }));
        report.cia.forEach((item) => papers.set(item.paperCode, { ...(papers.get(item.paperCode) || {}), cia: item }));
        for (const [paperCode, values] of papers) {
          const semester = Number(values.ese?.semester || values.cia?.semesterLabel || 0) || deriveSemesterFromPaperCode(paperCode);
          if (academicYearForBatchSemester(admissionYear, semester) !== academicYear) continue;
          const set = {
            admissionYear: Number(admissionYear), course, studyYear: Number(year), section, batch: batch._id,
            semester: semester || null, paperTitle: values.ese?.title || values.cia?.title || "", paperType: values.ese?.paperType || values.cia?.paperType || "Theory",
            source: "ATTAINMENT_API", sourceEndpoint: "admin-batch-migration", sourcePayload: report.rawPayload || values, lastSyncedAt: new Date(), lastSyncJob: job._id,
          };
          if (wanted.includes("CIA")) { set.cia = values.cia || null; if (values.cia) ciaCount += 1; }
          if (wanted.includes("ESE")) { set.ese = values.ese || null; if (values.ese) eseCount += 1; }
          reportOps.push({ updateOne: { filter: { rollno: student.rollno, paperCode, academicYear }, update: { $set: set, $setOnInsert: { firstSyncedAt: new Date() } }, upsert: true } });
        }
      } catch (error) { errors.push({ key: student.rollno, message: error.message }); }
    }
    if (reportOps.length) await ERPStudentReport.bulkWrite(reportOps, { ordered: false });
    const status = errors.length ? (reportOps.length ? "PARTIAL" : "FAILED") : "SUCCESS";
    await finishSyncJob(job, status, { received: roster.length, updated: reportOps.length, failed: errors.length }, errors);
    res.json({ message: "Selected academic data is now stored in MongoDB", status, batch, migrated: { students: roster.length, reports: reportOps.length, cia: ciaCount, ese: eseCount }, failedStudents: errors.length });
  } catch (error) {
    if (job) await finishSyncJob(job, "FAILED", { failed: 1 }, [{ key: "migration", message: error.message }]).catch(() => {});
    res.status(502).json({ message: "Academic data migration failed", error: error.message });
  }
});

module.exports = router;
