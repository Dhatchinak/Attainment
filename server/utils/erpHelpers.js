// Shared between adminRoutes (department-wide sync) and metaRoutes (staff self-service sync).
function deriveProgramme(programId = "") {
  const upper = String(programId).trim().toUpperCase();
  return upper.startsWith("PG") ? "PG" : "UG";
}

/**
 * Extract the curriculum semester from BHC paper codes.
 * Examples:
 *   P25CS307  -> 3
 *   P25CS3P5  -> 3
 *   U24CS506  -> 5
 *   U24CS5P6  -> 5
 *   U25TM3L3  -> 3
 *   I20BI916  -> 9
 *
 * The first digit immediately after the subject letters is the semester.
 */
function deriveSemesterFromPaperCode(paperCode = "") {
  const normalized = String(paperCode).trim().toUpperCase().replace(/\s+/g, "");
  const match = normalized.match(/^[A-Z]\d{2}[A-Z]+(\d)/);
  if (!match) return null;
  const semester = Number(match[1]);
  return Number.isInteger(semester) && semester >= 1 && semester <= 10 ? semester : null;
}

function normaliseClassValue(value = "") {
  return String(value).trim().replace(/\s+/g, " ").toUpperCase();
}

function buildClassKey({ program_id, year, section_name, academicYear }) {
  return [
    normaliseClassValue(program_id),
    normaliseClassValue(year),
    normaliseClassValue(section_name),
    String(academicYear || ""),
  ].join("::");
}

function buildAllocationKey({ staff_id, program_id, year, section_name, academicYear, paperCode }) {
  return [
    normaliseClassValue(staff_id),
    buildClassKey({ program_id, year, section_name, academicYear }),
    normaliseClassValue(paperCode),
  ].join("::");
}

function academicYearStart(yearLabel = "") {
  const match = String(yearLabel).match(/(20\d{2})/);
  return match ? Number(match[1]) : null;
}

function inferAdmissionBatch({ academicYearLabel, yearOfStudy, programme, programId = "" }) {
  const start = academicYearStart(academicYearLabel);
  const studyYear = Number(yearOfStudy);
  if (!start || !studyYear) return { admissionYear: undefined, label: null };

  const admissionYear = start - (studyYear - 1);
  const id = String(programId).toUpperCase();
  let duration = programme === "PG" ? 2 : 3;
  if (/BIO.?INFORMATICS|BINF|BIOT|INTEGRATED|MSC.?BI/.test(id)) duration = 5;

  return {
    admissionYear,
    duration,
    label: `${admissionYear}-${admissionYear + duration}`,
  };
}

module.exports = {
  deriveProgramme,
  deriveSemesterFromPaperCode,
  normaliseClassValue,
  buildClassKey,
  buildAllocationKey,
  inferAdmissionBatch,
};
