export const QUESTION_WISE_ACADEMIC_YEARS = new Set(["2025-2026", "2026-2027"]);

export function normaliseAcademicYear(value = "") {
  const raw = String(value?.year || value || "").trim();
  const match = raw.match(/20\d{2}\s*-\s*20\d{2}/);
  return match ? match[0].replace(/\s+/g, "") : raw;
}

export function isQuestionWiseAcademicYear(value) {
  return QUESTION_WISE_ACADEMIC_YEARS.has(normaliseAcademicYear(value));
}
