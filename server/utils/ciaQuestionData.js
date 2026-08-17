const CIAQuestionSet = require("../models/CIAQuestionSet");
const CIAActivitySet = require("../models/CIAActivitySet");
const Student = require("../models/Student");
const Batch = require("../models/Batch");
const Staff = require("../models/Staff");
const crypto = require("crypto");

function clean(value) {
  return String(value ?? "").trim();
}

function paperCodeKey(value) {
  return clean(value).toUpperCase().replace(/\s+/g, "");
}

function termFromSemester(semester) {
  const n = Number(semester);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n % 2 === 0 ? "EVEN" : "ODD";
}

function academicYearValue(allocation) {
  const raw = allocation?.academicYear?.year || allocation?.academicYearLabel || "";
  const match = clean(raw).match(/20\d{2}\s*-\s*20\d{2}/);
  return match ? match[0].replace(/\s+/g, "") : clean(raw);
}

function normaliseRegNo(value) {
  return clean(value).toUpperCase().replace(/\s+/g, "");
}

function normaliseSection(value) {
  const section = clean(value).toUpperCase().replace(/^SECTION\s+/i, "");
  if (!section || ["NIL", "NULL", "NONE", "N/A", "NA", "-", "AIDED"].includes(section)) return "NIL";
  return section;
}

function normaliseCourse(value) {
  return clean(value)
    .toUpperCase()
    .replace(/^(UG|PG)[-\s]+/, "")
    .replace(/[^A-Z0-9]+/g, "");
}


function normaliseDepartmentKey(value) {
  return clean(value)
    .replace(/^department\s+of\s+/i, "")
    .replace(/\b(?:dept|department)\.?$/i, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

async function allocationDepartmentKey(allocation) {
  const staffId = clean(allocation?.staff_id);
  if (!staffId) return "";
  const staff = await Staff.findOne({ staff_id: staffId }).select("department_name department_code").lean();
  return normaliseDepartmentKey(staff?.department_name || staff?.department_code || "");
}

function buildScopeSignature(students, batch, section, course) {
  const regs = (students || []).map((student) => normaliseRegNo(student.regNo)).filter(Boolean).sort();
  const seed = [
    String(batch?._id || batch || ""),
    normaliseSection(section),
    normaliseCourse(course),
    ...regs,
  ].join("|");
  return crypto.createHash("sha256").update(seed).digest("hex");
}

async function allocationBatch(allocation) {
  if (allocation?.batch && typeof allocation.batch === "object" && allocation.batch._id) {
    return allocation.batch;
  }
  const batchId = allocation?.batch?._id || allocation?.batch;
  return batchId ? Batch.findById(batchId).lean() : null;
}

/**
 * Question-wise CIA workbooks often contain both NIL/Aided and named sections
 * for the same paper code in one dataset.  The selected portal allocation is a
 * single class-section, so we must scope imported rows before calculating T1/T2.
 *
 * Strongest match: intersect imported register numbers with the local Student
 * roster for the selected Batch.  This is exact and avoids relying on slightly
 * different course/section labels between ERP and the English workbook.
 *
 * Fallback: when a local roster is not yet available, use section first and
 * course identity second. NIL/blank/AIDED are treated as the same section.
 */
async function scopeStudentsToAllocation(source, allocation, { hasSection = true } = {}) {
  if (!source) return null;
  const sourceStudents = Array.isArray(source.students) ? source.students : [];
  const batch = await allocationBatch(allocation);
  const batchId = batch?._id || allocation?.batch?._id || allocation?.batch;

  if (!sourceStudents.length) {
    return {
      ...source,
      students: [],
      scope: {
        method: "empty-source",
        section: normaliseSection(batch?.section),
        course: batch?.course || batch?.program_id || "",
        sourceStudentCount: 0,
        matchedStudentCount: 0,
        rosterCount: 0,
        signature: buildScopeSignature([], batchId, batch?.section, batch?.course || batch?.program_id),
      },
    };
  }

  if (batchId) {
    const roster = await Student.find({ batch: batchId, isActive: true }).select("regNo -_id").lean();
    if (roster.length) {
      const allowed = new Set(roster.map((student) => normaliseRegNo(student.regNo)).filter(Boolean));
      const matched = sourceStudents.filter((student) => allowed.has(normaliseRegNo(student.regNo)));
      return {
        ...source,
        students: matched,
        scope: {
          method: "batch-roster",
          section: normaliseSection(batch?.section),
          course: batch?.course || batch?.program_id || "",
          sourceStudentCount: sourceStudents.length,
          matchedStudentCount: matched.length,
          rosterCount: roster.length,
          signature: buildScopeSignature(matched, batchId, batch?.section, batch?.course || batch?.program_id),
        },
      };
    }
  }

  let candidates = sourceStudents;
  const targetSection = normaliseSection(batch?.section);
  if (hasSection && targetSection) {
    const sectionValues = new Set(
      sourceStudents.map((student) => normaliseSection(student.section)).filter(Boolean)
    );
    if (sectionValues.size) {
      candidates = sourceStudents.filter((student) => normaliseSection(student.section) === targetSection);
    }
  }

  const targetCourse = normaliseCourse(batch?.program_id || batch?.course);
  if (targetCourse && candidates.length) {
    const courseMatches = candidates.filter((student) => {
      const sourceCourse = normaliseCourse(student.course);
      if (!sourceCourse) return false;
      return sourceCourse === targetCourse || sourceCourse.includes(targetCourse) || targetCourse.includes(sourceCourse);
    });
    if (courseMatches.length) candidates = courseMatches;
  }

  return {
    ...source,
    students: candidates,
    scope: {
      method: "section-course-fallback",
      section: targetSection,
      course: batch?.course || batch?.program_id || "",
      sourceStudentCount: sourceStudents.length,
      matchedStudentCount: candidates.length,
      rosterCount: 0,
      signature: buildScopeSignature(candidates, batchId, batch?.section, batch?.course || batch?.program_id),
    },
  };
}

async function findQuestionSet(allocation, exam) {
  const key = paperCodeKey(allocation.paperCode);
  const term = termFromSemester(allocation.semester);
  const academicYear = academicYearValue(allocation);

  const departmentKey = await allocationDepartmentKey(allocation);
  let source = null;
  if (departmentKey) {
    source = await CIAQuestionSet.findOne({ departmentKey, paperCodeKey: key, exam, term, academicYear }).lean();
  }
  if (!source) source = await CIAQuestionSet.findOne({ paperCodeKey: key, exam, term, academicYear }).sort({ importedAt: -1 }).lean();
  if (!source) {
    // Fallback only for legacy imports where the academic year was genuinely
    // unavailable. Never silently borrow another academic year's CIA marks.
    const legacyQuery = { paperCodeKey: key, exam, term, academicYear: "" };
    if (departmentKey) legacyQuery.departmentKey = { $in: [departmentKey, ""] };
    source = await CIAQuestionSet.findOne(legacyQuery).sort({ importedAt: -1 }).lean();
  }
  return scopeStudentsToAllocation(source, allocation, { hasSection: true });
}

async function findActivitySet(allocation) {
  const key = paperCodeKey(allocation.paperCode);
  const term = termFromSemester(allocation.semester);
  const academicYear = academicYearValue(allocation);

  const departmentKey = await allocationDepartmentKey(allocation);
  let source = null;
  if (departmentKey) {
    source = await CIAActivitySet.findOne({ departmentKey, paperCodeKey: key, term, academicYear }).lean();
  }
  if (!source) source = await CIAActivitySet.findOne({ paperCodeKey: key, term, academicYear }).sort({ importedAt: -1 }).lean();
  if (!source) {
    const legacyQuery = { paperCodeKey: key, term, academicYear: "" };
    if (departmentKey) legacyQuery.departmentKey = { $in: [departmentKey, ""] };
    source = await CIAActivitySet.findOne(legacyQuery).sort({ importedAt: -1 }).lean();
  }
  // MAJOR/PARTII activity sheets do not consistently carry section, so use
  // the selected Batch roster whenever available and course as fallback.
  return scopeStudentsToAllocation(source, allocation, { hasSection: false });
}

module.exports = {
  clean,
  paperCodeKey,
  termFromSemester,
  academicYearValue,
  normaliseSection,
  normaliseDepartmentKey,
  findQuestionSet,
  findActivitySet,
};
