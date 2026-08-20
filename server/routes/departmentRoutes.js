const express = require("express");
const AcademicYear = require("../models/AcademicYear");
const Allocation = require("../models/Allocation");
const Attainment = require("../models/Attainment");
const Staff = require("../models/Staff");
const DepartmentAccount = require("../models/DepartmentAccount");
const HistoricalAttainmentRecord = require("../models/HistoricalAttainmentRecord");
const { authRequired, departmentRequired } = require("../middleware/auth");
const { computeAllocationStatus } = require("../utils/attainmentStatus");

const router = express.Router();
router.use(authRequired, departmentRequired);

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function accountFor(req) {
  return DepartmentAccount.findOne({ departmentCode: req.user.department_code, isActive: true }).lean();
}

function historicalDepartmentFilter(account) {
  const aliases = account?.programmeAliases || [];
  const patterns = aliases.map((alias) => new RegExp(`^${escapeRegex(alias)}$`, "i"));
  return {
    $or: [
      { departmentCode: account.departmentCode },
      ...(patterns.length ? [{ department: { $in: patterns } }] : []),
    ],
  };
}

router.get("/profile", async (req, res) => {
  const account = await accountFor(req);
  if (!account) return res.status(404).json({ message: "Department account is unavailable" });
  res.json({ departmentCode: account.departmentCode, departmentName: account.departmentName, programmeAliases: account.programmeAliases });
});

router.get("/academic-years", async (req, res) => {
  const account = await accountFor(req);
  if (!account) return res.status(404).json({ message: "Department account is unavailable" });
  const staffIds = await Staff.distinct("staff_id", { department_code: account.departmentCode });
  const liveYearIds = await Allocation.distinct("academicYear", { staff_id: { $in: staffIds }, isActive: true });
  const [liveYears, historicalYears] = await Promise.all([
    AcademicYear.find({ _id: { $in: liveYearIds } }).select("year").lean(),
    HistoricalAttainmentRecord.distinct("academicYear", { isLatest: true, ...historicalDepartmentFilter(account) }),
  ]);
  const years = [...new Set([...liveYears.map((item) => item.year), ...historicalYears])].filter(Boolean).sort().reverse();
  res.json(years);
});

router.get("/records", async (req, res) => {
  const academicYear = String(req.query.academicYear || "").trim();
  if (!academicYear) return res.status(400).json({ message: "academicYear is required" });
  const account = await accountFor(req);
  if (!account) return res.status(404).json({ message: "Department account is unavailable" });

  const staffDocs = await Staff.find({ department_code: account.departmentCode }).select("staff_id name salute").lean();
  const staffIds = staffDocs.map((item) => item.staff_id);
  const staffNames = new Map(staffDocs.map((item) => [item.staff_id, [item.salute, item.name].filter(Boolean).join(" ") || item.staff_id]));
  const yearDoc = await AcademicYear.findOne({ year: academicYear }).lean();

  const allocations = yearDoc ? await Allocation.find({
    staff_id: { $in: staffIds }, academicYear: yearDoc._id, isActive: true,
  }).populate("batch").populate("academicYear").sort({ semester: 1, paperCode: 1 }) : [];

  const live = await Promise.all(allocations.map(async (allocation) => {
    const statusInfo = await computeAllocationStatus(allocation);
    const result = await Attainment.findOne({ allocation: allocation._id }).select("weightedAverage poAttainment psoAttainment computedAt isCompleted").lean();
    return {
      allocation: {
        _id: allocation._id,
        paperCode: allocation.paperCode,
        paperName: allocation.paperName,
        semester: allocation.semester,
        paperType: allocation.paperType,
      },
      batch: allocation.batch,
      academicYear: allocation.academicYear?.year || academicYear,
      staff: { staff_id: allocation.staff_id, name: staffNames.get(allocation.staff_id) || allocation.staff_id },
      status: statusInfo.status,
      progress: statusInfo.progress,
      weightedAverage: result?.weightedAverage ?? null,
      poAttainment: result?.poAttainment || [],
      psoAttainment: result?.psoAttainment || [],
    };
  }));

  const historical = await HistoricalAttainmentRecord.find({
    academicYear,
    isLatest: true,
    ...historicalDepartmentFilter(account),
  }).sort({ semester: 1, courseCode: 1 }).lean();

  const completed = live.filter((item) => item.status === "completed").length;
  const inProgress = live.filter((item) => item.status === "in_progress").length;
  const notStarted = live.filter((item) => item.status === "not_started").length;
  res.json({
    department: { departmentCode: account.departmentCode, departmentName: account.departmentName },
    academicYear,
    summary: {
      liveTotal: live.length,
      completed,
      inProgress,
      notStarted,
      historicalTotal: historical.length,
      totalVisible: live.length + historical.length,
    },
    live,
    historical,
  });
});

module.exports = router;
