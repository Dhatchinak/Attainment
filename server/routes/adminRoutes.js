const express = require("express");
const AcademicYear = require("../models/AcademicYear");
const Batch = require("../models/Batch");
const AdmissionBatch = require("../models/AdmissionBatch");
const Allocation = require("../models/Allocation");
const Attainment = require("../models/Attainment");
const Staff = require("../models/Staff");
const { authRequired, adminRequired } = require("../middleware/auth");
const { fetchStaffFromERP, fetchDepartmentsFromERP } = require("../utils/externalApi");
const { deriveProgramme } = require("../utils/erpHelpers");
const { computeAllocationStatus } = require("../utils/attainmentStatus");

const router = express.Router();
router.use(authRequired, adminRequired);

/* ---------------- Academic Years ---------------- */
router.get("/academic-years", async (req, res) => {
  res.json(await AcademicYear.find().sort({ year: -1 }));
});

router.post("/academic-years", async (req, res) => {
  const { year, isActive = true } = req.body;
  const doc = await AcademicYear.create({ year, isActive });
  res.status(201).json(doc);
});

router.patch("/academic-years/:id", async (req, res) => {
  const doc = await AcademicYear.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(doc);
});

router.delete("/academic-years/:id", async (req, res) => {
  await AcademicYear.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
});

/* ---------------- ERP Sync: batches + course allocation, fully automatic ---------------- */

// Raw browse: lets the admin UI pick department -> program -> year -> section before syncing.
router.get("/erp/departments", async (req, res) => {
  try {
    const departments = await fetchDepartmentsFromERP();
    if (!departments) return res.status(502).json({ message: "Could not reach the college ERP (departments API)" });
    res.json(departments);
  } catch (err) {
    res.status(502).json({ message: "ERP departments fetch failed", error: err.message });
  }
});

// Every paper taught in a section's live timetable, deduped by staff+paperCode
// (the same paper repeats across many hours/days — we only need it once per staff).
function collectUniquePapers(section) {
  const seen = new Map();
  (section.TimeTable || []).forEach((day) => {
    (day.hours || []).forEach((hour) => {
      (hour.papers || []).forEach((p) => {
        if (!p.staffid || !p.paperCode) return;
        const key = `${p.staffid}::${p.paperCode}`;
        if (!seen.has(key)) {
          seen.set(key, {
            staffid: p.staffid,
            staffName: p.staffName,
            paperCode: p.paperCode,
            paperTitle: p.paperTitle,
            paperType: p.paperType,
            room: p.room || "",
          });
        } else if (!seen.get(key).room && p.room) {
          seen.get(key).room = p.room; // fill in a room if an earlier hour had none
        }
      });
    });
  });
  return [...seen.values()];
}

// Sync ONE department/program/year/section from the ERP into a local Batch,
// plus a course Allocation for every unique staff+paper found in its timetable.
// `semester` is supplied by the admin because the ERP's live timetable doesn't
// itself label which semester it belongs to (it's just "this section's current schedule").
router.post("/erp/sync-batch", async (req, res) => {
  try {
    const { department_code, program_id, year, section_name, academicYear, semester } = req.body;
    if (!department_code || !program_id || !year || !section_name || !academicYear || !semester) {
      return res.status(400).json({
        message: "department_code, program_id, year, section_name, academicYear and semester are all required",
      });
    }

    const academicYearDoc = await AcademicYear.findById(academicYear);
    if (!academicYearDoc) return res.status(404).json({ message: "Academic year not found" });

    const departments = await fetchDepartmentsFromERP();
    if (!departments) return res.status(502).json({ message: "Could not reach the college ERP (departments API)" });

    const dept = departments.find((d) => d.department_code === department_code);
    if (!dept) return res.status(404).json({ message: `Department ${department_code} not found in ERP response` });

    const program = (dept.programs || []).find((p) => p.program_id === program_id);
    if (!program) return res.status(404).json({ message: `Program ${program_id} not found under ${department_code}` });

    const yearBlock = (program.years || []).find((y) => String(y.year) === String(year));
    if (!yearBlock) return res.status(404).json({ message: `Year ${year} not found under ${program_id}` });

    const section = (yearBlock.sections || []).find((s) => s.section_name === section_name);
    if (!section) return res.status(404).json({ message: `Section ${section_name} not found` });

    // Upsert the batch
    const programme = deriveProgramme(program_id);
    const displayName = `${year} ${program.program_name} ${section_name}`.replace(/\s+/g, " ").trim();

    const batch = await Batch.findOneAndUpdate(
      { course: program.program_name, year: String(year), section: section_name, academicYear: academicYearDoc._id },
      {
        programme,
        course: program.program_name,
        year: String(year),
        section: section_name,
        academicYear: academicYearDoc._id,
        department_code,
        program_id,
        displayName,
        source: "erp_sync",
        isActive: true,
      },
      { upsert: true, new: true }
    );

    // Every unique staff+paper in this section's timetable becomes one Allocation.
    const papers = collectUniquePapers(section);
    let created = 0, updated = 0, staffCached = 0;

    for (const p of papers) {
      const lockKey = `${batch.course}-${batch.year}-SEM${semester}-${p.paperCode}-${academicYearDoc._id}`
        .toUpperCase()
        .replace(/\s+/g, "_");

      const result = await Allocation.findOneAndUpdate(
        { staff_id: p.staffid, batch: batch._id, academicYear: academicYearDoc._id, semester, paperCode: p.paperCode },
        {
          staff_id: p.staffid,
          batch: batch._id,
          academicYear: academicYearDoc._id,
          semester,
          paperCode: p.paperCode,
          paperName: p.paperTitle,
          paperType: p.paperType || "Theory",
          lockKey,
          source: "erp_sync",
          isActive: true,
        },
        { upsert: true, new: true, rawResult: true }
      );
      if (result.lastErrorObject?.updatedExisting) updated++; else created++;

      // Best-effort local staff cache so the name shows up immediately in admin UI /
      // reports without waiting for that staff member to log in first. Failures here
      // (ERP down, staff not found) never block the sync itself.
      const exists = await Staff.findOne({ staff_id: p.staffid });
      if (!exists) {
        try {
          const erpData = await fetchStaffFromERP(p.staffid);
          if (erpData) {
            await Staff.create({
              staff_id: erpData.staff_id,
              name: erpData.name,
              designation: erpData.designation,
              department_code: erpData.department_code,
              department_name: erpData.department_name,
              college_email: erpData.college_email,
              email: erpData.email,
              phone: erpData.phone,
              raw: erpData,
            });
          } else {
            // ERP didn't have it (or was unreachable) — cache at least the timetable's name
            // so allocations aren't attached to a totally blank staff record.
            await Staff.create({ staff_id: p.staffid, name: p.staffName });
          }
          staffCached++;
        } catch {
          // ignore — non-fatal, staff record will be created/refreshed on their next login
        }
      }
    }

    res.json({
      message: "Synced from ERP",
      batch,
      papersFound: papers.length,
      allocationsCreated: created,
      allocationsUpdated: updated,
      staffCached,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "ERP sync failed", error: err.message });
  }
});

/* ---------------- Admission Batches ---------------- */
router.get("/admission-batches", async (req, res) => {
  const filter = {};
  if (req.query.degree) filter.degree = req.query.degree;
  res.json(await AdmissionBatch.find(filter).sort({ admissionYear: -1, degree: 1 }));
});

router.post("/admission-batches", async (req, res) => {
  try {
    const { degree, admissionYear, label, isActive = true } = req.body;
    if (!degree || !admissionYear) return res.status(400).json({ message: "Degree and admission year are required" });
    const year = Number(admissionYear);
    const doc = await AdmissionBatch.findOneAndUpdate(
      { degree, admissionYear: year },
      { $set: { degree, admissionYear: year, label: (label || `${year} Batch`).trim(), isActive, source: "admin" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch("/admission-batches/:id", async (req, res) => {
  const update = { ...req.body };
  if (update.admissionYear !== undefined) update.admissionYear = Number(update.admissionYear);
  const doc = await AdmissionBatch.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!doc) return res.status(404).json({ message: "Admission batch not found" });
  res.json(doc);
});

router.delete("/admission-batches/:id", async (req, res) => {
  await AdmissionBatch.findByIdAndDelete(req.params.id);
  res.json({ message: "Admission batch deleted" });
});

/* ---------------- Batches ---------------- */
router.get("/batches", async (req, res) => {
  const filter = {};
  if (req.query.academicYear) filter.academicYear = req.query.academicYear;
  res.json(await Batch.find(filter).populate("academicYear").sort({ createdAt: -1 }));
});

router.post("/batches", async (req, res) => {
  const { programme, course, year, section, academicYear, department_code, totalSemesters } = req.body;
  const displayName = `${year} ${course} ${section}`.replace(/\s+/g, " ").trim();
  const doc = await Batch.create({
    programme, course, year, section, academicYear, department_code, totalSemesters, displayName,
  });
  res.status(201).json(doc);
});

router.patch("/batches/:id", async (req, res) => {
  const doc = await Batch.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(doc);
});

router.delete("/batches/:id", async (req, res) => {
  await Batch.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
});

/* ---------------- Allocations (assign staff -> batch -> semester -> paper) ---------------- */
router.get("/allocations", async (req, res) => {
  const filter = {};
  if (req.query.batch) filter.batch = req.query.batch;
  if (req.query.academicYear) filter.academicYear = req.query.academicYear;
  res.json(await Allocation.find(filter).populate("batch").sort({ semester: 1, paperCode: 1 }));
});

router.post("/allocations", async (req, res) => {
  try {
    const { staff_id, batch, academicYear, semester, paperCode, paperName, paperType, credits } = req.body;

    // validate staff exists in ERP (and cache locally) before allocating
    let staff = await Staff.findOne({ staff_id });
    if (!staff) {
      const erpData = await fetchStaffFromERP(staff_id);
      if (!erpData) return res.status(404).json({ message: "Staff ID not found in ERP" });
      staff = await Staff.create({
        staff_id: erpData.staff_id,
        name: erpData.name,
        designation: erpData.designation,
        department_code: erpData.department_code,
        department_name: erpData.department_name,
        college_email: erpData.college_email,
        email: erpData.email,
        phone: erpData.phone,
        raw: erpData,
      });
    }

    const batchDoc = await Batch.findById(batch);
    if (!batchDoc) return res.status(404).json({ message: "Batch not found" });

    const lockKey = `${batchDoc.course}-${batchDoc.year}-SEM${semester}-${paperCode}-${academicYear}`
      .toUpperCase()
      .replace(/\s+/g, "_");

    const doc = await Allocation.create({
      staff_id, batch, academicYear, semester, paperCode, paperName, paperType, credits, lockKey,
    });

    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ message: "Failed to create allocation", error: err.message });
  }
});

router.patch("/allocations/:id", async (req, res) => {
  const doc = await Allocation.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(doc);
});

router.delete("/allocations/:id", async (req, res) => {
  await Allocation.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
});

/* ---------------- Staff lookup helper (for admin UI autocomplete) ---------------- */
router.get("/staff-lookup/:staffId", async (req, res) => {
  let staff = await Staff.findOne({ staff_id: req.params.staffId });
  if (!staff) {
    const erpData = await fetchStaffFromERP(req.params.staffId);
    if (!erpData) return res.status(404).json({ message: "Not found in ERP" });
    return res.json({ fromErp: true, ...erpData });
  }
  res.json({ fromErp: false, ...staff.toObject() });
});

/* ---------------- Set/update a staff member's Date of Birth (login credential) ---------------- */
router.patch("/staff/:staffId/dob", async (req, res) => {
  const { dob } = req.body;
  if (!dob) return res.status(400).json({ message: "dob is required" });

  const parsed = new Date(dob);
  if (isNaN(parsed.getTime())) return res.status(400).json({ message: "Invalid date" });

  let staff = await Staff.findOne({ staff_id: req.params.staffId });
  if (!staff) {
    const erpData = await fetchStaffFromERP(req.params.staffId);
    if (!erpData) return res.status(404).json({ message: "Staff ID not found in ERP" });
    staff = await Staff.create({
      staff_id: erpData.staff_id,
      name: erpData.name,
      designation: erpData.designation,
      department_code: erpData.department_code,
      department_name: erpData.department_name,
      college_email: erpData.college_email,
      email: erpData.email,
      phone: erpData.phone,
      raw: erpData,
    });
  }

  staff.dob = parsed;
  await staff.save();
  res.json({ message: "DOB updated", staff_id: staff.staff_id, dob: staff.dob });
});

/* ---------------- Attainment Records (college-wide, read-only overview) ---------------- */
// Every allocation across every department/staff, tagged with the same
// Completed/Resume/Start status used on the staff + HOD overview pages —
// so admin can see the full picture without opening each staff's dashboard.
router.get("/attainment-records", async (req, res) => {
  const filter = { isActive: true };
  if (req.query.academicYear) filter.academicYear = req.query.academicYear;
  if (req.query.department_code) {
    const staffInDept = await Staff.find({ department_code: req.query.department_code }).select("staff_id");
    filter.staff_id = { $in: staffInDept.map((s) => s.staff_id) };
  }

  const allocations = await Allocation.find(filter)
    .populate("batch")
    .populate("academicYear")
    .sort({ semester: 1, paperCode: 1 });

  const staffIds = [...new Set(allocations.map((a) => a.staff_id))];
  const staffDocs = await Staff.find({ staff_id: { $in: staffIds } });
  const staffById = new Map(staffDocs.map((s) => [s.staff_id, s]));

  const items = await Promise.all(
    allocations.map(async (allocation) => {
      const { progress, status, resumeStep } = await computeAllocationStatus(allocation);
      const staffDoc = staffById.get(allocation.staff_id);
      const attainmentDoc = status === "completed" ? await Attainment.findOne({ allocation: allocation._id }) : null;
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
        staff: {
          staff_id: allocation.staff_id,
          name: staffDoc ? [staffDoc.salute, staffDoc.name].filter(Boolean).join(" ") : allocation.staff_id,
          department_name: staffDoc?.department_name || "",
          department_code: staffDoc?.department_code || "",
        },
        poAttainment: attainmentDoc?.poAttainment || [],
        psoAttainment: attainmentDoc?.psoAttainment || [],
        weightedAverage: attainmentDoc?.weightedAverage ?? null,
        progress,
        status,
        resumeStep,
      };
    })
  );

  const summary = {
    total: items.length,
    completed: items.filter((i) => i.status === "completed").length,
    in_progress: items.filter((i) => i.status === "in_progress").length,
    not_started: items.filter((i) => i.status === "not_started").length,
  };

  res.json({ summary, items });
});

module.exports = router;
