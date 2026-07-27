/**
 * CO -> PO/PSO attainment computation.
 *
 * This mirrors Bishop Heber College's existing attainment tool exactly
 * (verified against its reference screenshots, formula reverse-engineered
 * to match its output to two decimal places):
 *
 *   attainedPercent   = (students scoring >= thresholdMarksPercent) / totalAppeared * 100
 *   outcomeLevel      = min(3, attainedPercent / targetPercent * 3)     <- per exam/component
 *
 *   Internal(CO)  = average of outcomeLevel across every CIA component
 *                   whose [coStart, coEnd] range includes that CO
 *   External(CO)  = the paper's single ESE outcomeLevel (same for every CO,
 *                   since the end-semester exam isn't broken down per CO)
 *   Weight(CO)    = Internal(CO) * (internalWeight/100) + External(CO) * (externalWeight/100)
 *
 *   weightedAverage = mean(Weight) across all COs
 *
 *   PO/PSO value  = weighted average of each CO's Weight, weighted by the
 *                   CO-PO/PSO correlation strength (1-3) from the matrix.
 */

function outcomeLevel(attainedPercent, targetPercent) {
  if (!targetPercent) return 0;
  return Math.min(3, Number(((attainedPercent / targetPercent) * 3).toFixed(2)));
}

/**
 * Generic "how many appeared / how many crossed the threshold" stat,
 * used identically for the ESE total score and for each CIA component.
 */
function computeExamStats(scores, thresholdMarksPercent, targetPercent) {
  // scores: array of {obtained, max}
  let appeared = 0;
  let attained = 0;
  scores.forEach(({ obtained = 0, max = 0 }) => {
    if (max <= 0) return;
    appeared += 1;
    const pct = (obtained / max) * 100;
    if (pct >= thresholdMarksPercent) attained += 1;
  });
  const attainedPercent = appeared > 0 ? Number(((attained / appeared) * 100).toFixed(2)) : 0;
  return {
    appeared,
    attained,
    attainedPercent,
    outcomeLevel: outcomeLevel(attainedPercent, targetPercent),
  };
}

/**
 * @param {Array} eseMarks - [{obtained, max}] one per student who has an ESE mark
 * @param {Array} ciaMarks - [{componentMarks: {T1:{obtained,max}, ...}}] one per student
 * @param {Array} ciaComponents - [{key, label, coStart, coEnd}] from AttainmentSettings
 * @param {Array} coList - ["CO1","CO2",...] from the locked matrix
 * @param {Object} settings - {thresholdMarksPercent, targetPercent, internalWeight, externalWeight}
 */
function computeConsolidated({ eseMarks, ciaMarks, ciaComponents, coList, settings }) {
  const { thresholdMarksPercent, targetPercent, internalWeight, externalWeight } = settings;

  // External: single ESE outcome level, applied to every CO
  const eseSummary = computeExamStats(
    eseMarks.map((m) => ({ obtained: m.obtained, max: m.max })),
    thresholdMarksPercent,
    targetPercent
  );

  // Internal: one outcome level per CIA component
  const ciaComponentSummary = ciaComponents.map((comp) => {
    const scores = ciaMarks
      .map((m) => m.componentMarks?.[comp.key])
      .filter(Boolean)
      .map((s) => ({ obtained: Number(s.obtained) || 0, max: Number(s.max) || 0 }));
    const stats = computeExamStats(scores, thresholdMarksPercent, targetPercent);
    return { key: comp.key, label: comp.label, coStart: comp.coStart, coEnd: comp.coEnd, ...stats };
  });

  // Per-CO Internal = average of every component's outcomeLevel whose range covers this CO
  const coAttainment = coList.map((co) => {
    const coNum = parseInt(String(co).replace(/\D/g, ""), 10);
    const covering = ciaComponentSummary.filter((c) => coNum >= c.coStart && coNum <= c.coEnd);
    const internal =
      covering.length > 0
        ? Number((covering.reduce((sum, c) => sum + c.outcomeLevel, 0) / covering.length).toFixed(2))
        : 0;
    const external = eseSummary.outcomeLevel;
    const weight = Number(
      (internal * (internalWeight / 100) + external * (externalWeight / 100)).toFixed(2)
    );
    return { co, internal, external, weight };
  });

  const weightedAverage =
    coAttainment.length > 0
      ? Number((coAttainment.reduce((s, c) => s + c.weight, 0) / coAttainment.length).toFixed(2))
      : 0;

  return { eseSummary, ciaComponentSummary, coAttainment, weightedAverage };
}

function computePoPsoAttainment({ coAttainmentList, matrixRows, poCount = 12, psoCount = 2 }) {
  const coWeightMap = {};
  coAttainmentList.forEach((c) => (coWeightMap[c.co] = c.weight));

  function computeFor(count, field) {
    const out = [];
    for (let i = 0; i < count; i++) {
      let weightedSum = 0;
      let weightTotal = 0;
      let expected = 0; // strongest correlation (1-3) any CO claims for this PO/PSO
      matrixRows.forEach((row) => {
        const corr = row[field]?.[i] || 0;
        if (corr > expected) expected = corr;
        const level = coWeightMap[row.co];
        if (corr > 0 && level !== undefined) {
          weightedSum += corr * level;
          weightTotal += corr;
        }
      });
      out.push({
        [field === "po" ? "po" : "pso"]: `${field.toUpperCase()}${i + 1}`,
        value: weightTotal > 0 ? Number((weightedSum / weightTotal).toFixed(2)) : 0,
        expected,
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