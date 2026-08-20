const express = require("express");
const Allocation = require("../models/Allocation");
const Matrix = require("../models/Matrix");
const ESEMark = require("../models/ESEMark");
const AttainmentSettings = require("../models/AttainmentSettings");
const Attainment = require("../models/Attainment");
const CIAMark = require("../models/CIAMark");
const Staff = require("../models/Staff");
const { authRequired } = require("../middleware/auth");
const { computeQuestionWiseConsolidated, computeConsolidated, computePoPsoAttainment } = require("../utils/attainmentCalc");
const { buildMatrixKey } = require("../utils/matrixKey");
const { computeAllocationStatus } = require("../utils/attainmentStatus");
const { normaliseClassValue } = require("../utils/erpHelpers");
const CIAVerification = require("../models/CIAVerification");
const { findQuestionSet, findActivitySet } = require("../utils/ciaQuestionData");
const { isQuestionWiseAcademicYear, allocationAcademicYear } = require("../utils/workflowMode");

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
      ? {
          _id: allocation.batch._id,
          displayName: allocation.batch.displayName,
          programme: allocation.batch.programme,
          course: allocation.batch.course,
          year: allocation.batch.year,
          section: allocation.batch.section,
          admissionYear: allocation.batch.admissionYear,
        }
      : null,
    academicYear: allocation.academicYear
      ? { _id: allocation.academicYear._id, year: allocation.academicYear.year }
      : null,
    progress: statusInfo.progress,
    status: statusInfo.status,
    resumeStep: statusInfo.resumeStep,
    workflowMode: statusInfo.workflowMode || statusInfo.progress?.workflowMode || "legacy",
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
  const academicYear = String(req.query.academicYear || "").trim();
  if (!academicYear) return res.status(400).json({ message: "academicYear is required" });
  if (!/^[a-f\d]{24}$/i.test(academicYear)) return res.status(400).json({ message: "Invalid academic year" });
  const filter = { staff_id: req.user.staff_id, isActive: true, academicYear };

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

  const academicYear = String(req.query.academicYear || "").trim();
  if (!academicYear) return res.status(400).json({ message: "academicYear is required" });
  if (!/^[a-f\d]{24}$/i.test(academicYear)) return res.status(400).json({ message: "Invalid academic year" });

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

  const filter = { staff_id: { $in: staffIds }, isActive: true, academicYear };

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
  const allocation = await Allocation.findById(allocationId).populate("academicYear").populate("batch");
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

  const academicYear = allocationAcademicYear(allocation);
  const questionWise = isQuestionWiseAcademicYear(academicYear);
  const eseMarks = await ESEMark.find({ allocation: allocation._id });
  if (eseMarks.length === 0) return res.status(400).json({ message: "No ESE marks entered yet" });

  const coList = matrix.rows.map((r) => r.co);
  let calculation;

  if (questionWise) {
    const [t1Set, t2Set, activitySet, verifications] = await Promise.all([
      findQuestionSet(allocation, "T1"),
      findQuestionSet(allocation, "T2"),
      findActivitySet(allocation),
      CIAVerification.find({ allocation: allocation._id }),
    ]);

    if (!t1Set || !t1Set.students?.length) {
      return res.status(400).json({ message: `No T1 CIA rows match the selected class/section for ${allocation.paperCode}` });
    }
    if (!t2Set || !t2Set.students?.length) {
      return res.status(400).json({ message: `No T2 CIA rows match the selected class/section for ${allocation.paperCode}` });
    }
    if (!activitySet || !activitySet.students?.length) {
      return res.status(400).json({ message: `No CIA activity rows match the selected class/section for ${allocation.paperCode}` });
    }

    const verificationByStage = new Map(verifications.map((v) => [v.stage, v]));
    const verified = (stage, source) => {
      const v = verificationByStage.get(stage);
      return v && source?.scope?.signature &&
        String(v.sourceId) === String(source._id) &&
        new Date(v.sourceUpdatedAt).getTime() === new Date(source.updatedAt).getTime() &&
        v.sourceScopeSignature === source.scope.signature;
    };
    if (!verified("T1", t1Set)) return res.status(400).json({ message: "Verify T1 question-wise attainment before calculation" });
    if (!verified("T2", t2Set)) return res.status(400).json({ message: "Verify T2 question-wise attainment before calculation" });
    if (!verified("ACTIVITIES", activitySet)) return res.status(400).json({ message: "Verify CIA activities before calculation" });

    calculation = computeQuestionWiseConsolidated({
      eseMarks,
      t1Set,
      t2Set,
      activitySet,
      ciaComponents: settings.ciaComponents,
      coList,
      settings: {
        thresholdMarksPercent: settings.thresholdMarksPercent,
        targetPercent: settings.targetPercent,
        internalWeight: settings.internalWeight,
        externalWeight: settings.externalWeight,
        eseMaxMarks: settings.eseMaxMarks,
      },
    });
  } else {
    const ciaMarks = await CIAMark.find({ allocation: allocation._id, calculationReady: { $ne: false } });
    if (!ciaMarks.length) {
      return res.status(400).json({
        message: "CIA component marks are not available yet. Older academic years use the legacy component-total CIA method; ask Admin to update CIA marks.",
      });
    }

    calculation = computeConsolidated({
      eseMarks,
      ciaMarks,
      ciaComponents: settings.ciaComponents,
      coList,
      settings: {
        thresholdMarksPercent: settings.thresholdMarksPercent,
        targetPercent: settings.targetPercent,
        internalWeight: settings.internalWeight,
        externalWeight: settings.externalWeight,
        eseMaxMarks: settings.eseMaxMarks,
      },
    });
  }

  const { poAttainment, psoAttainment } = computePoPsoAttainment({
    matrixRows: matrix.rows,
    weightedAverage: calculation.weightedAverage,
    poCount: matrix.poCount,
    psoCount: matrix.psoCount,
  });

  if (!settings.isLocked) {
    settings.isLocked = true;
    await settings.save();
  }

  const common = {
    allocation: allocation._id,
    lockKey: matrix.paperKey,
    workflowMode: questionWise ? "question_wise" : "legacy",
    thresholdMarksPercent: settings.thresholdMarksPercent,
    targetPercent: settings.targetPercent,
    internalWeight: settings.internalWeight,
    externalWeight: settings.externalWeight,
    eseSummary: calculation.eseSummary,
    coAttainment: calculation.coAttainment,
    weightedAverage: calculation.weightedAverage,
    poAttainment,
    psoAttainment,
    computedAt: new Date(),
    isCompleted: false,
  };

  if (questionWise) {
    Object.assign(common, {
      ciaComponentSummary: calculation.activitySummary,
      t1QuestionSummary: calculation.t1Summary,
      t2QuestionSummary: calculation.t2Summary,
      ciaActivitySummary: calculation.activitySummary,
      formulaWeights: calculation.formulaWeights,
    });
  } else {
    Object.assign(common, {
      ciaComponentSummary: calculation.ciaComponentSummary,
      t1QuestionSummary: null,
      t2QuestionSummary: null,
      ciaActivitySummary: [],
      formulaWeights: {
        mode: "legacy",
        internalWeight: settings.internalWeight,
        externalWeight: settings.externalWeight,
      },
    });
  }

  const saved = await Attainment.findOneAndUpdate(
    { allocation: allocation._id },
    {
      $set: common,
      $unset: { completedAt: 1, completedBy: 1 },
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

  const batch = allocation.batch || null;
  const section = String(batch?.section || "").trim();
  const sectionLabel = section.toUpperCase() === "NIL"
    ? "Aided (NIL)"
    : section ? `Section ${section}` : "Section not available";
  const classParts = [
    batch?.year ? `Year ${batch.year}` : "",
    batch?.course || "",
    sectionLabel,
  ].filter(Boolean);

  res.json({
    ...attainment.toObject(),
    reportContext: {
      classLabel: classParts.join(" · ") || batch?.displayName || "Class not available",
      programme: batch?.programme || "",
      course: batch?.course || "",
      studyYear: batch?.year || "",
      section,
      sectionLabel,
      admissionYear: batch?.admissionYear || null,
      academicYear: allocation.academicYear?.year || "",
      semester: allocation.semester,
      paperCode: allocation.paperCode,
      paperName: allocation.paperName,
      paperType: allocation.paperType || "",
    },
  });
});

/**
 * How far along this paper is, derived live from whichever records already
 * exist — so re-logging-in and re-selecting the same paper resumes right
 * where it was left off, with every finished step showing as ticked.
 */
router.get("/:allocationId/progress", async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });

  const { progress, resumeStep, workflowMode } = await computeAllocationStatus(allocation);
  res.json({ ...progress, resumeStep, workflowMode });
});

// Save course-teacher remarks that appear on the final printable report.
router.patch("/:allocationId/remarks", async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });

  const remarks = String(req.body?.remarks ?? "").trim();
  if (remarks.length > 2000) {
    return res.status(400).json({ message: "Remarks cannot exceed 2000 characters" });
  }

  const outcomeRemarks = {};
  for (const [key, value] of Object.entries(req.body?.outcomeRemarks || {})) {
    const outcome = String(key || "").trim().toUpperCase();
    if (!/^(PO|PSO)\d+$/.test(outcome)) continue;
    const text = String(value ?? "").trim();
    if (text.length > 500) {
      return res.status(400).json({ message: `${outcome} remark cannot exceed 500 characters` });
    }
    outcomeRemarks[outcome] = text;
  }

  const attainment = await Attainment.findOneAndUpdate(
    { allocation: allocation._id },
    {
      $set: {
        remarks,
        outcomeRemarks,
        remarksUpdatedAt: new Date(),
        remarksUpdatedBy: req.user.staff_id || (req.user.isAdmin ? "ADMIN" : ""),
      },
    },
    { new: true }
  );

  if (!attainment) {
    return res.status(400).json({ message: "Compute attainment before saving remarks" });
  }
  res.json(attainment);
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
