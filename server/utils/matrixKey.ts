export {};
/**
 * The CO-PO-PSO matrix belongs to a PAPER, not to any one class/section.
 * So its key is built ONLY from paperCode + academicYear — deliberately
 * leaving out course/batch/semester/section. That way:
 *   - Two sections of the same paper (e.g. II BCA "A" and "B") share ONE matrix.
 *   - Even two different courses/departments offering the same elective paper
 *     code in the same academic year share ONE matrix.
 *   - Whoever fills & submits it first locks it; everyone else who opens the
 *     same paper code (that academic year) gets a read-only view showing who
 *     locked it.
 * A new academic year always gets a fresh, empty matrix for that paper code.
 */
function buildMatrixKey(allocation) {
  const paperCode = String(allocation.paperCode || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

  const academicYearRaw =
    allocation.academicYear && allocation.academicYear._id ? allocation.academicYear._id : allocation.academicYear;
  const academicYear = String(academicYearRaw || "");

  return `${paperCode}__AY_${academicYear}`;
}

module.exports = { buildMatrixKey };
