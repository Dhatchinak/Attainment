/**
 * CO -> PO/PSO attainment computation.
 *
 * The formulas in this file intentionally mirror the department's reference
 * Excel workbook. The workbook has three important stages:
 *
 * 1) Component attainment level
 *      attainedPercent = attainedStudents / appearedStudents * 100
 *      level = IF(attainedPercent >= targetPercent, 3,
 *                 3 / targetPercent * attainedPercent)
 *
 * 2) Consolidated CO attainment
 *      CO = Internal * internalWeight% + External * externalWeight%
 *      weightedAverage = AVERAGE(all consolidated CO values)
 *
 * 3) PO / PSO report (reference workbook rows 51-52)
 *      Expected = AVERAGE(non-blank CO correlation values for that PO/PSO)
 *      Observed = Expected * weightedAverage / 3
 *
 * Correlation 0 in MongoDB represents a blank Excel matrix cell, so zeroes are
 * excluded from Expected. This also guarantees Observed cannot exceed Expected
 * while the attainment scale is capped at 3.
 */

function outcomeLevel(attainedPercent, targetPercent) {
  if (!targetPercent) return 0;
  return Math.min(3, Number(((attainedPercent / targetPercent) * 3).toFixed(4)));
}

function computeExamStats(scores, thresholdMarksPercent, targetPercent) {
  let appeared = 0;
  let attained = 0;
  scores.forEach(({ obtained = 0, max = 0 }) => {
    if (max <= 0) return;
    const mark = Number(obtained);
    if (!Number.isFinite(mark) || mark < 0 || mark > max) return;
    appeared += 1;
    const pct = (mark / max) * 100;
    if (pct >= thresholdMarksPercent) attained += 1;
  });
  const attainedPercent = appeared > 0 ? Number(((attained / appeared) * 100).toFixed(4)) : 0;
  return {
    appeared,
    attained,
    attainedPercent,
    outcomeLevel: outcomeLevel(attainedPercent, targetPercent),
  };
}

function computeConsolidated({ eseMarks, ciaMarks, ciaComponents, coList, settings }) {
  const { thresholdMarksPercent, targetPercent, internalWeight, externalWeight } = settings;

  const configuredEseMax = Number(settings.eseMaxMarks) > 0 ? Number(settings.eseMaxMarks) : 75;
  const eseSummary = computeExamStats(
    eseMarks.map((m) => ({ obtained: m.obtained, max: configuredEseMax })),
    thresholdMarksPercent,
    targetPercent
  );

  const ciaComponentSummary = ciaComponents.map((comp) => {
    const scores = ciaMarks
      .map((m) => m.componentMarks?.[comp.key])
      .filter(Boolean)
      .map((s) => ({ obtained: Number(s.obtained) || 0, max: Number(s.max) || 0 }));
    const stats = computeExamStats(scores, thresholdMarksPercent, targetPercent);
    return { key: comp.key, label: comp.label, coStart: comp.coStart, coEnd: comp.coEnd, ...stats };
  });

  const coAttainment = coList.map((co) => {
    const coNum = parseInt(String(co).replace(/\D/g, ""), 10);
    const covering = ciaComponentSummary.filter((c) => coNum >= c.coStart && coNum <= c.coEnd);
    const internal =
      covering.length > 0
        ? Number((covering.reduce((sum, c) => sum + c.outcomeLevel, 0) / covering.length).toFixed(4))
        : 0;
    const external = eseSummary.outcomeLevel;
    const weight = Number(
      (internal * (internalWeight / 100) + external * (externalWeight / 100)).toFixed(4)
    );
    return { co, internal, external, weight };
  });

  const weightedAverage =
    coAttainment.length > 0
      ? Number((coAttainment.reduce((s, c) => s + c.weight, 0) / coAttainment.length).toFixed(4))
      : 0;

  return { eseSummary, ciaComponentSummary, coAttainment, weightedAverage };
}

/**
 * Excel-equivalent PO/PSO computation.
 *
 * Example from the uploaded workbook:
 *   PO1 Expected = AVERAGE(2,2,3,3,3,3) = 2.6667
 *   Observed     = 2.6667 * 2.225446 / 3 = 1.9782
 *
 * This is deliberately NOT a correlation-weighted average of individual CO
 * attainments. The earlier implementation used that different formula and
 * could produce cases such as Expected 1.00 / Observed 2.15.
 */
function computePoPsoAttainment({ matrixRows, weightedAverage, poCount = 12, psoCount = 2 }) {
  function computeFor(count, field) {
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const correlations = matrixRows
        .map((row) => Number(row[field]?.[i]) || 0)
        .filter((value) => value > 0);

      const expected = correlations.length
        ? correlations.reduce((sum, value) => sum + value, 0) / correlations.length
        : 0;
      const observed = expected > 0
        ? expected * (Number(weightedAverage) || 0) / 3
        : 0;

      out.push({
        [field === "po" ? "po" : "pso"]: `${field.toUpperCase()}${i + 1}`,
        value: Number(observed.toFixed(4)),
        expected: Number(expected.toFixed(4)),
      });
    }
    return out;
  }

  return {
    poAttainment: computeFor(poCount, "po"),
    psoAttainment: computeFor(psoCount, "pso"),
  };
}

module.exports = { computeConsolidated, computePoPsoAttainment, outcomeLevel, computeExamStats };
