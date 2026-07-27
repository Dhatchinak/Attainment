const express = require("express");
const Allocation = require("../models/Allocation");
const Matrix = require("../models/Matrix");
const AttainmentSettings = require("../models/AttainmentSettings");
const { authRequired } = require("../middleware/auth");
const { buildMatrixKey } = require("../utils/matrixKey");

const router = express.Router();
router.use(authRequired);

async function assertOwnership(req, allocationId) {
  const allocation = await Allocation.findById(allocationId);
  if (!allocation) return { error: "Allocation not found", status: 404 };
  if (!req.user.isAdmin && allocation.staff_id !== req.user.staff_id) {
    return { error: "Not your allocation", status: 403 };
  }
  return { allocation };
}

// Get settings (creates sensible defaults on first visit, requires the CO-PO-PSO matrix to be locked first)
router.get("/:allocationId", async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });

  const matrix = await Matrix.findOne({ paperKey: buildMatrixKey(allocation) });
  if (!matrix || !matrix.isLocked) {
    return res.status(400).json({ message: "Submit and lock the CO-PO-PSO matrix before setting thresholds" });
  }

  const settings = await AttainmentSettings.findOne({ allocation: allocation._id });
  const defaults = new AttainmentSettings({ allocation: allocation._id, lockKey: allocation.lockKey });
  const payload = settings ? settings.toObject() : defaults.toObject();
  res.json({ ...payload, exists: !!settings, cos: matrix.rows.map((r) => r.co) });
});

// Save settings. Threshold configuration is controlled only by the administrator.
router.post("/:allocationId", async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });

  if (!req.user.isAdmin) {
    return res.status(403).json({ message: "Threshold settings are controlled by the administrator and are view-only for staff." });
  }

  const existing = await AttainmentSettings.findOne({ allocation: allocation._id });

  const { thresholdMarksPercent, targetPercent, internalWeight, externalWeight, ciaComponents } = req.body;

  if (Number(internalWeight) + Number(externalWeight) !== 100) {
    return res.status(400).json({ message: "Internal + External weight must add up to 100" });
  }
  if (!Array.isArray(ciaComponents) || ciaComponents.length === 0) {
    return res.status(400).json({ message: "At least one CIA component is required" });
  }

  const settings = await AttainmentSettings.findOneAndUpdate(
    { allocation: allocation._id },
    {
      allocation: allocation._id,
      lockKey: allocation.lockKey,
      thresholdMarksPercent,
      targetPercent,
      internalWeight,
      externalWeight,
      ciaComponents,
      configuredByAdmin: true,
      configuredBy: req.user.adminId || req.user.id || "admin",
    },
    { upsert: true, new: true }
  );

  res.json(settings);
});

// Admin-only: unlock settings if they need to be changed after marks were entered
router.post("/:allocationId/unlock", async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ message: "Admin only" });
  const settings = await AttainmentSettings.findOneAndUpdate(
    { allocation: req.params.allocationId },
    { isLocked: false },
    { new: true }
  );
  if (!settings) return res.status(404).json({ message: "Settings not found" });
  res.json(settings);
});

module.exports = router;
