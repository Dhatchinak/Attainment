// Shared between adminRoutes (department-wide sync) and metaRoutes (staff self-service sync).
function deriveProgramme(program_id = "") {
  const upper = String(program_id).toUpperCase();
  if (upper.startsWith("PG")) return "PG";
  return "UG"; // ERP program_id is prefixed "UG-..." / "PG-..."
}

// Paper codes follow U<batchYear><SUBJ><SEM><LEVEL>, e.g. "U26TM1L1" -> sem 1, "U25TM3L3" -> sem 3.
// The digit right after the subject letters (before the final "L<n>") is the semester.
function deriveSemesterFromPaperCode(paperCode = "") {
  const m = String(paperCode).toUpperCase().match(/^U\d{2}[A-Z]+(\d)L\d+$/);
  return m ? Number(m[1]) : null;
}

module.exports = { deriveProgramme, deriveSemesterFromPaperCode };