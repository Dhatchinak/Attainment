const Matrix = require("../models/Matrix");
const AttainmentSettings = require("../models/AttainmentSettings");
const Student = require("../models/Student");
const ESEMark = require("../models/ESEMark");
const CIAMark = require("../models/CIAMark");
const Attainment = require("../models/Attainment");
const CIAVerification = require("../models/CIAVerification");
const { buildMatrixKey } = require("./matrixKey");
const { findQuestionSet, findActivitySet } = require("./ciaQuestionData");
const { isQuestionWiseAcademicYear, allocationAcademicYear } = require("./workflowMode");

function currentVerification(verification, source) {
  if (!verification || !source || !source.scope?.signature) return false;
  return String(verification.sourceId) === String(source._id) &&
    new Date(verification.sourceUpdatedAt).getTime() === new Date(source.updatedAt).getTime() &&
    verification.sourceScopeSignature === source.scope.signature;
}

function calculationIsCurrent(attainment, sources = []) {
  const sourceTimes = sources
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  const newestSourceTime = sourceTimes.length ? Math.max(...sourceTimes) : 0;
  const computedAt = attainment?.computedAt ? new Date(attainment.computedAt).getTime() : 0;
  return Boolean(attainment && computedAt >= newestSourceTime);
}

/**
 * Live workflow state for one paper.
 *
 * Question-wise CIA applies ONLY to AY 2025-2026 and 2026-2027.
 * Older academic years retain the earlier component-total CIA workflow.
 */
async function computeAllocationStatus(allocation) {
  const paperKey = buildMatrixKey(allocation);
  const academicYear = allocationAcademicYear(allocation);
  const questionWise = isQuestionWiseAcademicYear(academicYear);

  const [matrix, settings, studentCount, latestEse, attainment] = await Promise.all([
    Matrix.findOne({ paperKey }),
    AttainmentSettings.findOne({ allocation: allocation._id }),
    Student.countDocuments({ batch: allocation.batch?._id || allocation.batch, isActive: true }),
    ESEMark.findOne({ allocation: allocation._id }).sort({ updatedAt: -1 }),
    Attainment.findOne({ allocation: allocation._id }),
  ]);

  if (questionWise) {
    const [t1Set, t2Set, activitySet, verifications] = await Promise.all([
      findQuestionSet(allocation, "T1"),
      findQuestionSet(allocation, "T2"),
      findActivitySet(allocation),
      CIAVerification.find({ allocation: allocation._id }),
    ]);

    const verificationByStage = new Map(verifications.map((v) => [v.stage, v]));
    const t1Verification = verificationByStage.get("T1");
    const t2Verification = verificationByStage.get("T2");
    const activityVerification = verificationByStage.get("ACTIVITIES");
    const t1Verified = !!t1Set && currentVerification(t1Verification, t1Set);
    const t2Verified = !!t2Set && currentVerification(t2Verification, t2Set);
    const activitiesVerified = !!activitySet && currentVerification(activityVerification, activitySet);
    const calculationCurrent = t1Verified && t2Verified && activitiesVerified && calculationIsCurrent(attainment, [
      matrix?.updatedAt,
      settings?.updatedAt,
      latestEse?.updatedAt,
      t1Set?.updatedAt,
      t2Set?.updatedAt,
      activitySet?.updatedAt,
      t1Verification?.updatedAt,
      t2Verification?.updatedAt,
      activityVerification?.updatedAt,
    ]);

    const progress = {
      workflowMode: "question_wise",
      academicYear,
      matrixLocked: !!matrix?.isLocked,
      settingsSet: !!(settings?.configuredByStaff || settings?.configuredByAdmin),
      studentsUploaded: studentCount > 0,
      eseEntered: !!latestEse,
      t1Ready: !!t1Set && (t1Set.students?.length || 0) > 0,
      t1Verified,
      t2Ready: !!t2Set && (t2Set.students?.length || 0) > 0,
      t2Verified,
      activitiesReady: !!activitySet && (activitySet.students?.length || 0) > 0,
      activitiesVerified,
      computed: calculationCurrent,
      completed: Boolean(attainment?.isCompleted && calculationCurrent),
    };

    // 0 Select, 1 Matrix, 2 Settings, 3 ESE, 4 T1, 5 T2,
    // 6 CIA Activities, 7 CO Calculation, 8 Final Report.
    let resumeStep = 1;
    if (!progress.matrixLocked) resumeStep = 1;
    else if (!progress.settingsSet) resumeStep = 2;
    else if (!progress.eseEntered) resumeStep = 3;
    else if (!progress.t1Verified) resumeStep = 4;
    else if (!progress.t2Verified) resumeStep = 5;
    else if (!progress.activitiesVerified) resumeStep = 6;
    else if (!progress.computed) resumeStep = 7;
    else resumeStep = 8;

    let status = "not_started";
    if (progress.completed) status = "completed";
    else if (progress.matrixLocked || progress.settingsSet || progress.eseEntered || progress.t1Verified || progress.t2Verified || progress.activitiesVerified) {
      status = "in_progress";
    }

    return { paperKey, matrix, progress, status, resumeStep, workflowMode: "question_wise" };
  }

  const latestCia = await CIAMark.findOne({ allocation: allocation._id, calculationReady: { $ne: false } }).sort({ updatedAt: -1 });
  const calculationCurrent = calculationIsCurrent(attainment, [
    matrix?.updatedAt,
    settings?.updatedAt,
    latestEse?.updatedAt,
    latestCia?.updatedAt,
  ]);

  const progress = {
    workflowMode: "legacy",
    academicYear,
    matrixLocked: !!matrix?.isLocked,
    settingsSet: !!(settings?.configuredByStaff || settings?.configuredByAdmin),
    studentsUploaded: studentCount > 0,
    eseEntered: !!latestEse,
    ciaEntered: !!latestCia,
    computed: calculationCurrent,
    completed: Boolean(attainment?.isCompleted && calculationCurrent),
  };

  // Legacy wizard: 0 Select, 1 Matrix, 2 Settings, 3 ESE,
  // 4 CIA component totals, 5 Consolidated CO, 6 Final Report.
  let resumeStep = 1;
  if (!progress.matrixLocked) resumeStep = 1;
  else if (!progress.settingsSet) resumeStep = 2;
  else if (!progress.eseEntered) resumeStep = 3;
  else if (!progress.ciaEntered) resumeStep = 4;
  else if (!progress.computed) resumeStep = 5;
  else resumeStep = 6;

  let status = "not_started";
  if (progress.completed) status = "completed";
  else if (progress.matrixLocked || progress.settingsSet || progress.eseEntered || progress.ciaEntered) status = "in_progress";

  return { paperKey, matrix, progress, status, resumeStep, workflowMode: "legacy" };
}

module.exports = { computeAllocationStatus };
