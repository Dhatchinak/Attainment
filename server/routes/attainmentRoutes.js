const express = require("express");
const Allocation = require("../models/Allocation");
const Matrix = require("../models/Matrix");
const CIAMark = require("../models/CIAMark");
const ESEMark = require("../models/ESEMark");
const AttainmentSettings = require("../models/AttainmentSettings");
const Attainment = require("../models/Attainment");
const Staff = require("../models/Staff");
const { authRequired } = require("../middleware/auth");
const { computeConsolidated, computePoPsoAttainment } = require("../utils/attainmentCalc");
const { buildMatrixKey } = require("../utils/matrixKey");
const { computeAllocationStatus } = require("../utils/attainmentStatus");
const { normaliseClassValue } = require("../utils/erpHelpers");

const router = express.Router();
router.use(authRequired);


function dedupeAllocations(allocations) {
  const bestByKey = new Map();
  for (const allocation of allocations) {
    const batch = allocation.batch;
    const key = [
      normaliseClassValue(allocation.staff_id),
      normaliseClassValue(batch?.program_id || batch?.course),
      normaliseClassValue(batch?.year),
      normaliseClassValue(batch?.section),
      normaliseClassValue(allocation.paperCode),
      String(allocation.academicYear?._id || allocation.academicYear || ""),
    ].join("::");

    const existing = bestByKey.get(key);
    if (!existing) {
      bestByKey.set(key, allocation);
      continue;
    }

    // Keep the record with the most recent update. Existing attainment records
    // are normally attached to this one after a resume/edit.
    if (new Date(allocation.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
      bestByKey.set(key, allocation);
    }
  }
  return [...bestByKey.values()];
}


function serializeItem(allocation, statusInfo) {
  return {
    allocation: {
      _id: allocation._id,
      paperCode: allocation.paperCode,
      paperName: allocation.paperName,
      paperType: allocation.paperType,
      semester: allocation.semester,
    },
    batch: allocation.batch
      ? { _id: allocation.batch._id, displayName: allocation.batch.displayName, programme: allocation.batch.programme }
      : null,
    academicYear: allocation.academicYear
      ? { _id: allocation.academicYear._id, year: allocation.academicYear.year }
      : null,
    progress: statusInfo.progress,
    status: statusInfo.status,
    resumeStep: statusInfo.resumeStep,
  };
}

/**
 * Landing-page data: EVERY allocation (paper) this staff has, each tagged with
 * a simple status so the UI can show "Completed" / "Resume" / "Start" without
 * the staff re-picking Academic Year -> Programme -> Semester -> Batch -> Paper
 * every time they log back in. Optionally scoped to one academic year.
 *
 * Must be declared before "/:allocationId" below, otherwise Express would try
 * to treat the literal word "overview" as an :allocationId.
 */
router.get("/overview", async (req, res) => {
  const filter = { staff_id: req.user.staff_id, isActive: true };
  if (req.query.academicYear) filter.academicYear = req.query.academicYear;

  const allocations = await Allocation.find(filter)
    .populate("batch")
    .populate("academicYear")
    .sort({ semester: 1, paperCode: 1 });

  const uniqueAllocations = dedupeAllocations(allocations);
  const items = await Promise.all(
    uniqueAllocations.map(async (allocation) => serializeItem(allocation, await computeAllocationStatus(allocation)))
  );

  res.json(items);
});

/**
 * HOD view: every paper allocated to ANY staff in the HOD's own department,
 * each tagged with the same Completed/Resume/Start status — so a HOD can see
 * at a glance which classes in their department have finished their
 * CO-PO-PSO attainment process and which are still pending, and who is
 * teaching/handling each one.
 */
router.get("/department-overview", async (req, res) => {
  if (!req.user.isHOD && !req.user.isAdmin) {
    return res.status(403).json({ message: "HOD or admin access only" });
  }

  let departmentCode = req.user.department_code;
  if (req.user.isAdmin && req.query.department_code) {
    departmentCode = req.query.department_code; // admin can preview any department
  }
  if (!departmentCode) {
    return res.status(400).json({ message: "No department on record for this account" });
  }

  const deptStaff = await Staff.find({ department_code: departmentCode });
  const staffIds = deptStaff.map((s) => s.staff_id);
  const staffNameById = new Map(
    deptStaff.map((s) => [s.staff_id, [s.salute, s.name].filter(Boolean).join(" ") || s.staff_id])
  );

  const filter = { staff_id: { $in: staffIds }, isActive: true };
  if (req.query.academicYear) filter.academicYear = req.query.academicYear;

  const allocations = await Allocation.find(filter)
    .populate("batch")
    .populate("academicYear")
    .sort({ semester: 1, paperCode: 1 });

  const uniqueAllocations = dedupeAllocations(allocations);
  const items = await Promise.all(
    uniqueAllocations.map(async (allocation) => ({
      ...serializeItem(allocation, await computeAllocationStatus(allocation)),
      staff: { staff_id: allocation.staff_id, name: staffNameById.get(allocation.staff_id) || allocation.staff_id },
    }))
  );

  res.json({
    department_code: departmentCode,
    department_name: deptStaff[0]?.department_name || departmentCode,
    items,
  });
});

async function assertOwnership(req, allocationId) {
  const allocation = await Allocation.findById(allocationId);
  if (!allocation) return { error: "Allocation not found", status: 404 };
  if (!req.user.isAdmin && allocation.staff_id !== req.user.staff_id) {
    return { error: "Not your allocation", status: 403 };
  }
  return { allocation };
}

// Compute (or recompute) consolidated CO + PO + PSO attainment for a paper
router.post("/:allocationId/compute", async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });

  const matrix = await Matrix.findOne({ paperKey: buildMatrixKey(allocation) });
  if (!matrix || matrix.rows.length === 0) {
    return res.status(400).json({ message: "CO-PO-PSO matrix must be submitted before computing attainment" });
  }

  const settings = await AttainmentSettings.findOne({ allocation: allocation._id });
  if (!settings) {
    return res.status(400).json({ message: "Set thresholds (Marks Threshold %, Target %, Internal/External weight) before computing" });
  }

  const eseMarks = await ESEMark.find({ allocation: allocation._id });
  const ciaMarks = await CIAMark.find({ allocation: allocation._id });
  if (eseMarks.length === 0) return res.status(400).json({ message: "No ESE marks entered yet" });
  if (ciaMarks.length === 0) return res.status(400).json({ message: "No CIA marks entered yet" });

  const coList = matrix.rows.map((r) => r.co);

  const { eseSummary, ciaComponentSummary, coAttainment, weightedAverage } = computeConsolidated({
    eseMarks,
    ciaMarks,
    ciaComponents: settings.ciaComponents,
    coList,
    settings: {
      thresholdMarksPercent: settings.thresholdMarksPercent,
      targetPercent: settings.targetPercent,
      internalWeight: settings.internalWeight,
      externalWeight: settings.externalWeight,
    },
  });

  const { poAttainment, psoAttainment } = computePoPsoAttainment({
    matrixRows: matrix.rows,
    weightedAverage,
    poCount: matrix.poCount,
    psoCount: matrix.psoCount,
  });

  // Settings are locked once attainment has been computed, so the numbers stay reproducible.
  if (!settings.isLocked) {
    settings.isLocked = true;
    await settings.save();
  }

  // Use $set (not a bare replacement object) so recomputing never wipes out
  // isCompleted/completedAt/completedBy if this paper was already marked done.
  const saved = await Attainment.findOneAndUpdate(
    { allocation: allocation._id },
    {
      $set: {
        allocation: allocation._id,
        lockKey: matrix.paperKey,
        thresholdMarksPercent: settings.thresholdMarksPercent,
        targetPercent: settings.targetPercent,
        internalWeight: settings.internalWeight,
        externalWeight: settings.externalWeight,
        eseSummary,
        ciaComponentSummary,
        coAttainment,
        weightedAverage,
        poAttainment,
        psoAttainment,
        computedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  res.json(saved);
});

// Fetch already-computed attainment report
router.get("/:allocationId", async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });

  const attainment = await Attainment.findOne({ allocation: allocation._id });
  if (!attainment) return res.status(404).json({ message: "Not computed yet" });
  res.json(attainment);
});

/**
 * How far along this paper is, derived live from whichever records already
 * exist — so re-logging-in and re-selecting the same paper resumes right
 * where it was left off, with every finished step showing as ticked.
 */
router.get("/:allocationId/progress", async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });

  const { progress } = await computeAllocationStatus(allocation);
  res.json(progress);
});

// Mark this paper's attainment workflow as fully done. Doesn't lock anything
// further — admin/staff can still come back and edit; it's a status flag,
// not a hard lock (the matrix/settings already have their own lock logic).
router.post("/:allocationId/complete", async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });

  const attainment = await Attainment.findOneAndUpdate(
    { allocation: allocation._id },
    { $set: { isCompleted: true, completedAt: new Date(), completedBy: req.user.staff_id } },
    { new: true }
  );
  if (!attainment) {
    return res.status(400).json({ message: "Compute attainment at least once before marking this paper complete" });
  }
  res.json(attainment);
});

module.exports = router;
