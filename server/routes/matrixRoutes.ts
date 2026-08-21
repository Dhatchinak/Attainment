export {};
const express = require("express");
const Allocation = require("../models/Allocation");
const Matrix = require("../models/Matrix");
const Staff = require("../models/Staff");
const { authRequired } = require("../middleware/auth");
const { buildMatrixKey } = require("../utils/matrixKey");

// Resolve a staff_id to a friendly display name (falls back to the raw id
// if we don't have that staff cached locally).
async function resolveStaffName(staffId) {
  if (!staffId) return staffId;
  const staff = await Staff.findOne({ staff_id: staffId });
  if (!staff) return staffId;
  return [staff.salute, staff.name].filter(Boolean).join(" ") || staffId;
}

const router = express.Router();
router.use(authRequired);

// Get the matrix for an allocation's PAPER CODE (creates an empty shell view if none exists yet).
// IMPORTANT: the matrix is looked up by paperCode + academicYear (see utils/matrixKey.js),
// not by this allocation's own section/batch — so every section teaching the same paper
// code shares and sees the exact same matrix.
router.get("/:allocationId", async (req, res) => {
  const allocation = await Allocation.findById(req.params.allocationId);
  if (!allocation) return res.status(404).json({ message: "Allocation not found" });

  // ownership check: only the assigned staff (or admin) may view/edit this allocation
  if (!req.user.isAdmin && allocation.staff_id !== req.user.staff_id) {
    return res.status(403).json({ message: "Not your allocation" });
  }

  const paperKey = buildMatrixKey(allocation);
  let matrix = await Matrix.findOne({ paperKey });
  if (!matrix) {
    return res.json({
      exists: false,
      paperKey,
      paperCode: allocation.paperCode,
      paperName: allocation.paperName,
      rows: [],
      isLocked: false,
    });
  }

  res.json({
    exists: true,
    ...matrix.toObject(),
    submittedByName: await resolveStaffName(matrix.submittedBy),
    isEditableByMe: matrix.submittedBy === req.user.staff_id || req.user.isAdmin,
  });
});

// Submit matrix (only if not already locked by another staff for this same PAPER CODE,
// regardless of which section/batch/course they're teaching it under).
router.post("/:allocationId", async (req, res) => {
  const allocation = await Allocation.findById(req.params.allocationId);
  if (!allocation) return res.status(404).json({ message: "Allocation not found" });

  if (!req.user.isAdmin && allocation.staff_id !== req.user.staff_id) {
    return res.status(403).json({ message: "Not your allocation" });
  }

  const { rows, poCount, psoCount } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: "At least one CO row is required" });
  }

  const paperKey = buildMatrixKey(allocation);
  let matrix = await Matrix.findOne({ paperKey });

  if (matrix && matrix.isLocked && matrix.submittedBy !== req.user.staff_id && !req.user.isAdmin) {
    const lockedByName = await resolveStaffName(matrix.submittedBy);
    return res.status(423).json({
      message: `This paper code's CO-PO-PSO matrix was already submitted and locked by ${lockedByName}. It is locked for everyone else teaching this paper code.`,
      submittedBy: matrix.submittedBy,
      submittedByName: lockedByName,
    });
  }

  if (matrix) {
    matrix.rows = rows;
    matrix.poCount = poCount || matrix.poCount;
    matrix.psoCount = psoCount || matrix.psoCount;
    matrix.isLocked = true;
    matrix.submittedBy = matrix.submittedBy || req.user.staff_id;
    await matrix.save();
  } else {
    matrix = await Matrix.create({
      paperKey,
      academicYear: allocation.academicYear,
      allocation: allocation._id,
      paperCode: allocation.paperCode,
      paperName: allocation.paperName,
      rows,
      poCount: poCount || 12,
      psoCount: psoCount || 2,
      submittedBy: req.user.staff_id,
      isLocked: true,
    });
  }

  res.json({
    message: "CO-PO-PSO matrix saved and locked",
    matrix,
    submittedByName: await resolveStaffName(matrix.submittedBy),
  });
});

module.exports = router;
