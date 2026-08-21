export {};
const express = require("express");
const Allocation = require("../models/Allocation");
const Matrix = require("../models/Matrix");
const AttainmentSettings = require("../models/AttainmentSettings");
const { authRequired } = require("../middleware/auth");
const { buildMatrixKey } = require("../utils/matrixKey");

const router = express.Router();
router.use(authRequired);

async function assertStaffOwnership(req, allocationId) {
  const allocation = await Allocation.findById(allocationId);
  if (!allocation) return { error: "Allocation not found", status: 404 };
  if (req.user.isAdmin) {
    return { allocation };
  }
  if (allocation.staff_id !== req.user.staff_id) {
    return { error: "Not your allocation", status: 403 };
  }
  return { allocation };
}

router.get("/:allocationId", async (req, res) => {
  const { allocation, error, status } = await assertStaffOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });

  const matrix = await Matrix.findOne({ paperKey: buildMatrixKey(allocation) });
  if (!matrix || !matrix.isLocked) {
    return res.status(400).json({ message: "Submit and lock the CO-PO-PSO matrix before setting thresholds" });
  }

  const settings = await AttainmentSettings.findOne({ allocation: allocation._id });
  const defaults = new AttainmentSettings({ allocation: allocation._id, lockKey: allocation.lockKey });
  const payload = settings ? settings.toObject() : defaults.toObject();

  res.json({
    ...payload,
    configuredByStaff: Boolean(payload.configuredByStaff || payload.configuredByAdmin),
    exists: Boolean(settings),
    cos: matrix.rows.map((row) => row.co),
  });
});

router.post("/:allocationId", async (req, res) => {
  const { allocation, error, status } = await assertStaffOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });

  const matrix = await Matrix.findOne({ paperKey: buildMatrixKey(allocation) });
  if (!matrix || !matrix.isLocked) {
    return res.status(400).json({ message: "Submit and lock the CO-PO-PSO matrix before setting thresholds" });
  }

  const existing = await AttainmentSettings.findOne({ allocation: allocation._id });
  if (existing?.isLocked) {
    return res.status(409).json({ message: "Threshold settings are locked because marks entry has already started." });
  }

  const { thresholdMarksPercent, internalWeight, externalWeight, eseMaxMarks, ciaComponents } = req.body;
  const threshold = Number(thresholdMarksPercent);
  const internal = Number(internalWeight);
  const external = Number(externalWeight);
  const eseMax = Number(eseMaxMarks);

  if (![threshold, internal, external, eseMax].every(Number.isFinite)) {
    return res.status(400).json({ message: "Enter valid numeric threshold and weight values" });
  }
  if (threshold < 0 || threshold > 100) {
    return res.status(400).json({ message: "Marks Threshold must be between 0 and 100" });
  }
  if (internal < 0 || external < 0 || internal + external !== 100) {
    return res.status(400).json({ message: "CIA and ESE weights must be non-negative and add up to 100" });
  }
  if (eseMax <= 0) {
    return res.status(400).json({ message: "ESE Maximum Mark must be greater than 0" });
  }
  if (!Array.isArray(ciaComponents) || ciaComponents.length === 0) {
    return res.status(400).json({ message: "At least one CIA component is required" });
  }

  const normalisedComponents = ciaComponents.map((component) => ({
    key: String(component.key || "").trim(),
    label: String(component.label || "").trim(),
    coStart: Number(component.coStart),
    coEnd: Number(component.coEnd),
    maxMarks: Number(component.maxMarks),
  }));

  const invalidComponent = normalisedComponents.some((component) =>
    !component.key || !component.label ||
    !Number.isInteger(component.coStart) || !Number.isInteger(component.coEnd) ||
    component.coStart < 1 || component.coEnd < component.coStart ||
    !Number.isFinite(component.maxMarks) || component.maxMarks <= 0
  );
  if (invalidComponent) {
    return res.status(400).json({ message: "Check the CIA component key, CO range and maximum marks" });
  }

  const settings = await AttainmentSettings.findOneAndUpdate(
    { allocation: allocation._id },
    {
      allocation: allocation._id,
      lockKey: allocation.lockKey,
      thresholdMarksPercent: threshold,
      // Retained only for backward schema compatibility. Calculation now uses
      // attained class percentage directly; there is no separate student target.
      targetPercent: 100,
      internalWeight: internal,
      externalWeight: external,
      eseMaxMarks: eseMax,
      ciaComponents: normalisedComponents,
      configuredByStaff: true,
      configuredByAdmin: false,
      configuredBy: req.user.staff_id,
    },
    { upsert: true, new: true, runValidators: true }
  );

  res.json(settings);
});

module.exports = router;
