const express = require("express");
const AcademicYear = require("../models/AcademicYear");
const Batch = require("../models/Batch");
const Allocation = require("../models/Allocation");
const Staff = require("../models/Staff");
const { authRequired } = require("../middleware/auth");
const { fetchStaffFromERP } = require("../utils/externalApi");
const { deriveProgramme, deriveSemesterFromPaperCode } = require("../utils/erpHelpers");

const router = express.Router();
router.use(authRequired);

// Academic years (active only, for staff dropdown)
router.get("/academic-years", async (req, res) => {
  const years = await AcademicYear.find({ isActive: true }).sort({ year: -1 });
  res.json(years);
});

/**
 * Pulls the LOGGED-IN staff's own "class_attend" list straight from their ERP
 * profile (https://apierp.bhc.edu.in/api/staff/{staffid}) and turns it into
 * local Batch + Allocation records — so a staff member sees their real classes
 * in the dropdowns without waiting on an admin to sync anything.
 *
 * class_attend entries don't carry a semester number (same gap as the admin
 * department sync), so — exactly like the college's original tool, which also
 * has staff pick Semester explicitly on its form — the staff picks ONE
 * semester to tag this sync batch with.
 */
router.post("/sync-my-classes", async (req, res) => {
  try {
    const { academicYear, semester } = req.body;
    if (!academicYear || !semester) {
      return res.status(400).json({ message: "academicYear and semester are required" });
    }

    const academicYearDoc = await AcademicYear.findById(academicYear);
    if (!academicYearDoc) return res.status(404).json({ message: "Academic year not found" });

    const erpData = await fetchStaffFromERP(req.user.staff_id);
    if (!erpData) return res.status(502).json({ message: "Could not reach the college ERP (staff API)" });

    const classAttend = Array.isArray(erpData.class_attend) ? erpData.class_attend : [];
    if (classAttend.length === 0) {
      return res.status(404).json({ message: "No classes found in your ERP profile (class_attend is empty)" });
    }

    // Group by (program_id, year, section_name) -> one Batch each
    const batchGroups = new Map();
    classAttend.forEach((c) => {
      const key = `${c.program_id}::${c.year}::${c.section_name}`;
      if (!batchGroups.has(key)) batchGroups.set(key, { ...c, papers: new Map() });
      const group = batchGroups.get(key);
      if (c.paper_code && !group.papers.has(c.paper_code)) {
        group.papers.set(c.paper_code, { paperCode: c.paper_code, paperName: c.paper_title, paperType: c.paper_type });
      }
    });

    let batchesSynced = 0, allocationsCreated = 0, allocationsUpdated = 0;

    for (const group of batchGroups.values()) {
      const programme = deriveProgramme(group.program_id);
      const displayName = `${group.year} ${group.department_name} ${group.section_name}`.replace(/\s+/g, " ").trim();

      const batch = await Batch.findOneAndUpdate(
        { course: group.department_name, year: String(group.year), section: group.section_name, academicYear: academicYearDoc._id },
        {
          programme,
          course: group.department_name,
          year: String(group.year),
          section: group.section_name,
          academicYear: academicYearDoc._id,
          program_id: group.program_id,
          displayName,
          source: "erp_sync",
          isActive: true,
        },
        { upsert: true, new: true }
      );
      batchesSynced++;

      for (const paper of group.papers.values()) {
        // Prefer the semester encoded in the paper code itself (real, per-paper truth)
        // over the semester this sweep call happens to be tagging — otherwise the same
        // paper gets re-created under every semester 1-8 the frontend sweeps through.
        const paperSemester = deriveSemesterFromPaperCode(paper.paperCode) || semester;
        if (paperSemester !== semester) continue; // only persist under its real semester

        const lockKey = `${batch.course}-${batch.year}-SEM${paperSemester}-${paper.paperCode}-${academicYearDoc._id}`
          .toUpperCase()
          .replace(/\s+/g, "_");

        const result = await Allocation.findOneAndUpdate(
          { staff_id: req.user.staff_id, batch: batch._id, academicYear: academicYearDoc._id, semester: paperSemester, paperCode: paper.paperCode },
          {
            staff_id: req.user.staff_id,
            batch: batch._id,
            academicYear: academicYearDoc._id,
            semester: paperSemester,
            paperCode: paper.paperCode,
            paperName: paper.paperName,
            paperType: paper.paperType || "Theory",
            lockKey,
            source: "erp_sync",
            isActive: true,
          },
          { upsert: true, new: true, rawResult: true }
        );
        if (result.lastErrorObject?.updatedExisting) allocationsUpdated++; else allocationsCreated++;
      }
    }

    // refresh the local staff cache too, while we have fresh ERP data in hand
    await Staff.findOneAndUpdate({ staff_id: erpData.staff_id }, { name: erpData.name, salute: erpData.salute, designation: erpData.designation, department_code: erpData.department_code, department_name: erpData.department_name, raw: erpData }, { upsert: true });

    res.json({ message: "Synced your classes from ERP", batchesSynced, allocationsCreated, allocationsUpdated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Sync failed", error: err.message });
  }
});

// Batches that the LOGGED-IN staff actually teaches in a given academic year + programme.
// Fully dynamic: derived from Allocation records (admin-managed / erp-synced), never hardcoded.
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
  allocations.forEach((a) => {
    if (!a.batch) return;
    if (programme && a.batch.programme !== programme) return;
    const key = String(a.batch._id);
    if (!seen.has(key)) {
      seen.add(key);
      batches.push(a.batch);
    }
  });

  res.json(batches);
});

// Semesters + papers that this staff teaches, for a specific batch + academic year.
router.get("/my-papers", async (req, res) => {
  const { batch, academicYear } = req.query;
  if (!batch || !academicYear) return res.status(400).json({ message: "batch and academicYear are required" });

  const allocations = await Allocation.find({
    staff_id: req.user.staff_id,
    batch,
    academicYear,
    isActive: true,
  }).sort({ semester: 1, paperCode: 1 });

  res.json(allocations);
});

module.exports = router;