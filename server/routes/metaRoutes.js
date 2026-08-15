const express = require("express");
const mongoose = require("mongoose");
const AcademicYear = require("../models/AcademicYear");
const Batch = require("../models/Batch");
const Allocation = require("../models/Allocation");
const Staff = require("../models/Staff");
const CIAQuestionSet = require("../models/CIAQuestionSet");
const CIAActivitySet = require("../models/CIAActivitySet");
const { authRequired } = require("../middleware/auth");
const { fetchStaffFromERP } = require("../utils/externalApi");
const {
  deriveProgramme,
  deriveSemesterFromPaperCode,
  normaliseClassValue,
  inferAdmissionBatch,
} = require("../utils/erpHelpers");

const router = express.Router();
router.use(authRequired);

router.get("/academic-years", async (req, res) => {
  // Existing CIA imports may contain historical years that were imported before
  // the AcademicYear collection was updated. Surface those years automatically.
  const [questionYears, activityYears] = await Promise.all([
    CIAQuestionSet.distinct("academicYear", { academicYear: { $ne: "" } }),
    CIAActivitySet.distinct("academicYear", { academicYear: { $ne: "" } }),
  ]);
  const importedYears = [...new Set([...questionYears, ...activityYears])].filter((year) => /^20\d{2}-20\d{2}$/.test(String(year)));
  if (importedYears.length) {
    await AcademicYear.bulkWrite(
      importedYears.map((year) => ({
        updateOne: { filter: { year }, update: { $set: { isActive: true } }, upsert: true },
      })),
      { ordered: false }
    );
  }

  const years = await AcademicYear.find({ isActive: true }).sort({ year: -1 });
  res.json(years);
});

function paperIdentity(entry) {
  return [
    normaliseClassValue(entry.program_id),
    normaliseClassValue(entry.year),
    normaliseClassValue(entry.section_name),
    normaliseClassValue(entry.paper_code),
  ].join("::");
}

async function mergeDuplicateBatches({ staffId, academicYearId }) {
  const allocations = await Allocation.find({
    staff_id: staffId,
    academicYear: academicYearId,
  }).populate("batch");

  const canonicalByClass = new Map();
  let removedAllocations = 0;
  let removedBatches = 0;

  for (const allocation of allocations) {
    if (!allocation.batch) continue;
    const batch = allocation.batch;
    const classKey = [
      normaliseClassValue(batch.program_id || batch.course),
      normaliseClassValue(batch.year),
      normaliseClassValue(batch.section),
      String(academicYearId),
    ].join("::");

    if (!canonicalByClass.has(classKey)) {
      canonicalByClass.set(classKey, batch);
      continue;
    }

    const canonical = canonicalByClass.get(classKey);
    const existing = await Allocation.findOne({
      _id: { $ne: allocation._id },
      staff_id: allocation.staff_id,
      batch: canonical._id,
      academicYear: academicYearId,
      paperCode: allocation.paperCode,
      isActive: true,
    });

    if (existing) {
      await Allocation.deleteOne({ _id: allocation._id });
      removedAllocations++;
    } else {
      allocation.batch = canonical._id;
      await allocation.save();
    }
  }

  const candidateBatches = await Batch.find({ academicYear: academicYearId, source: "erp_sync" });
  for (const batch of candidateBatches) {
    const count = await Allocation.countDocuments({ batch: batch._id });
    if (count === 0) {
      await Batch.deleteOne({ _id: batch._id });
      removedBatches++;
    }
  }

  return { removedAllocations, removedBatches };
}

/**
 * Fetch the logged-in staff profile once and create one allocation for each
 * unique class + paper. Timetable day/hour repetitions are deliberately ignored.
 */
router.post("/sync-my-classes", async (req, res) => {
  try {
    const { academicYear } = req.body;
    if (!academicYear) {
      return res.status(400).json({ message: "academicYear is required" });
    }

    const academicYearDoc = await AcademicYear.findById(academicYear);
    if (!academicYearDoc) return res.status(404).json({ message: "Academic year not found" });

    const erpData = await fetchStaffFromERP(req.user.staff_id);
    if (!erpData) return res.status(502).json({ message: "Could not reach the college ERP staff API" });

    const rawClasses = Array.isArray(erpData.class_attend) ? erpData.class_attend : [];
    if (rawClasses.length === 0) {
      return res.status(404).json({ message: "No classes found in your ERP profile" });
    }

    // Remove day-order/hour duplicates from class_attend.
    const uniqueClasses = new Map();
    for (const entry of rawClasses) {
      if (!entry?.program_id || !entry?.year || !entry?.section_name || !entry?.paper_code) continue;
      const key = paperIdentity(entry);
      if (!uniqueClasses.has(key)) uniqueClasses.set(key, entry);
    }

    let batchesSynced = 0;
    let allocationsCreated = 0;
    let allocationsUpdated = 0;
    let skippedUnknownSemester = 0;

    for (const entry of uniqueClasses.values()) {
      const programme = deriveProgramme(entry.program_id);
      const inferred = inferAdmissionBatch({
        academicYearLabel: academicYearDoc.year,
        yearOfStudy: entry.year,
        programme,
        programId: entry.program_id,
      });

      // program_id is the canonical ERP class identity. Do not use department_name
      // as course identity because many programmes share the same department name.
      const batch = await Batch.findOneAndUpdate(
        {
          program_id: normaliseClassValue(entry.program_id),
          year: String(entry.year),
          section: normaliseClassValue(entry.section_name),
          academicYear: academicYearDoc._id,
        },
        {
          $set: {
            programme,
            course: entry.program_id,
            year: String(entry.year),
            section: normaliseClassValue(entry.section_name),
            academicYear: academicYearDoc._id,
            admissionYear: inferred.admissionYear,
            department_code: erpData.department_code,
            program_id: normaliseClassValue(entry.program_id),
            displayName: `${entry.year} ${entry.program_id.replace(/^(UG|PG)-/i, "").replace(/-/g, " ")} ${entry.section_name} · ${inferred.label || academicYearDoc.year}`
              .replace(/\s+/g, " ")
              .trim(),
            source: "erp_sync",
            isActive: true,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      batchesSynced++;

      const semester = deriveSemesterFromPaperCode(entry.paper_code);
      if (!semester) {
        skippedUnknownSemester++;
        continue;
      }

      const lockKey = `${entry.program_id}-${entry.year}-${entry.section_name}-SEM${semester}-${entry.paper_code}-${academicYearDoc._id}`
        .toUpperCase()
        .replace(/\s+/g, "_");

      const result = await Allocation.findOneAndUpdate(
        {
          staff_id: req.user.staff_id,
          batch: batch._id,
          academicYear: academicYearDoc._id,
          paperCode: normaliseClassValue(entry.paper_code),
        },
        {
          $set: {
            semester,
            paperName: entry.paper_title || entry.paper_code,
            paperType: entry.paper_type || "Theory",
            lockKey,
            source: "erp_sync",
            isActive: true,
          },
          $setOnInsert: {
            staff_id: req.user.staff_id,
            batch: batch._id,
            academicYear: academicYearDoc._id,
            paperCode: normaliseClassValue(entry.paper_code),
          },
        },
        { upsert: true, new: true, rawResult: true, setDefaultsOnInsert: true }
      );

      if (result.lastErrorObject?.updatedExisting) allocationsUpdated++;
      else allocationsCreated++;
    }

    const cleanup = await mergeDuplicateBatches({
      staffId: req.user.staff_id,
      academicYearId: academicYearDoc._id,
    });

    await Staff.findOneAndUpdate(
      { staff_id: erpData.staff_id },
      {
        name: erpData.name,
        salute: erpData.salute,
        designation: erpData.designation,
        department_code: erpData.department_code,
        department_name: erpData.department_name,
        raw: erpData,
      },
      { upsert: true, new: true }
    );

    res.json({
      message: "Your current ERP classes were synced without timetable duplicates",
      timetableRows: rawClasses.length,
      uniqueClassPapers: uniqueClasses.size,
      batchesSynced,
      allocationsCreated,
      allocationsUpdated,
      skippedUnknownSemester,
      duplicatesRemoved: cleanup.removedAllocations,
      emptyDuplicateBatchesRemoved: cleanup.removedBatches,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Sync failed", error: err.message });
  }
});

router.get("/my-batches", async (req, res) => {
  const { academicYear, programme } = req.query;
  if (!academicYear) return res.status(400).json({ message: "academicYear is required" });

  const allocations = await Allocation.find({
    staff_id: req.user.staff_id,
    academicYear,
    isActive: true,
  }).populate("batch");

  const seen = new Set();
  const batches = [];
  for (const allocation of allocations) {
    if (!allocation.batch || allocation.batch.isActive === false) continue;
    if (programme && allocation.batch.programme !== programme) continue;
    const key = [
      normaliseClassValue(allocation.batch.program_id || allocation.batch.course),
      normaliseClassValue(allocation.batch.year),
      normaliseClassValue(allocation.batch.section),
    ].join("::");
    if (seen.has(key)) continue;
    seen.add(key);
    batches.push(allocation.batch);
  }

  res.json(batches);
});

router.get("/my-papers", async (req, res) => {
  const { batch, academicYear } = req.query;
  if (!batch || !academicYear) return res.status(400).json({ message: "batch and academicYear are required" });

  const allocations = await Allocation.find({
    staff_id: req.user.staff_id,
    batch,
    academicYear,
    isActive: true,
  }).sort({ semester: 1, paperCode: 1 });

  const seen = new Set();
  const unique = allocations.filter((allocation) => {
    const key = normaliseClassValue(allocation.paperCode);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  res.json(unique);
});

module.exports = router;
