const Matrix = require("../models/Matrix");
const AttainmentSettings = require("../models/AttainmentSettings");
const Student = require("../models/Student");
const ESEMark = require("../models/ESEMark");
const CIAMark = require("../models/CIAMark");
const Attainment = require("../models/Attainment");
const { buildMatrixKey } = require("./matrixKey");

/**
 * Derives how far along one allocation (a staff's paper for one class/section)
 * is in the attainment workflow, purely from whichever records already exist.
 * Shared by:
 *   - the staff's own "My Classes" overview
 *   - the HOD's department-wide overview
 *   - the admin's college-wide attainment records
 * so all three always agree on what "Completed" / "Resume" / "Start" means.
 */
async function computeAllocationStatus(allocation) {
  const paperKey = buildMatrixKey(allocation);

  const [matrix, settings, studentCount, eseCount, ciaCount, attainment] = await Promise.all([
    Matrix.findOne({ paperKey }),
    AttainmentSettings.findOne({ allocation: allocation._id }),
    Student.countDocuments({ batch: allocation.batch?._id || allocation.batch, isActive: true }),
    ESEMark.countDocuments({ allocation: allocation._id }),
    CIAMark.countDocuments({ allocation: allocation._id }),
    Attainment.findOne({ allocation: allocation._id }),
  ]);

  const progress = {
    matrixLocked: !!matrix?.isLocked,
    settingsSet: !!settings?.configuredByAdmin,
    studentsUploaded: studentCount > 0,
    eseEntered: eseCount > 0,
    ciaEntered: ciaCount > 0,
    computed: !!attainment,
    completed: !!attainment?.isCompleted,
  };

  let resumeStep = 1;
  if (!progress.matrixLocked) resumeStep = 1;
  else if (!progress.settingsSet) resumeStep = 2;
  else if (!progress.studentsUploaded) resumeStep = 3;
  else if (!progress.eseEntered) resumeStep = 4;
  else if (!progress.ciaEntered) resumeStep = 5;
  else if (!progress.computed) resumeStep = 6;
  else resumeStep = 7;

  let status = "not_started";
  if (progress.completed) status = "completed";
  else if (progress.matrixLocked) status = "in_progress";

  return { paperKey, matrix, progress, status, resumeStep };
}

module.exports = { computeAllocationStatus };
