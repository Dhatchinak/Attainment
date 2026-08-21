export {};
/**
 * CO -> PO/PSO attainment computation.
 *
 * The portal supports both the legacy component-total CIA flow and the newer
 * question-wise CIA flow.  The question-wise flow is based on the uploaded
 * department workbooks:
 *   - every T1/T2 question is mapped to one CO (and a Bloom/K level)
 *   - each question gets its own student-attainment percentage and level / 3
 *   - a test's CO value is the simple average of its mapped question levels
 *   - Seminar / Assignment / Innovative are calculated separately
 *   - the reference workbook's 25:75 CIA:ESE split is retained. Within CIA,
 *     Innovative uses 10% of the CIA share (2.5 when CIA=25) and the remaining
 *     CIA evidence uses 90% (22.5 when CIA=25).
 */

function outcomeLevel(attainedPercent) {
  return Math.min(3, Number(((Math.max(0, Number(attainedPercent) || 0) / 100) * 3).toFixed(4)));
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
    outcomeLevel: outcomeLevel(attainedPercent),
  };
}

function computeQuestionWiseSet(questionSet, thresholdMarksPercent, targetPercent) {
  if (!questionSet) return { questions: [], coSummary: [], invalidCount: 0, studentCount: 0 };

  let invalidCount = 0;
  const questionStats = (questionSet.questions || []).map((question) => {
    const max = Number(question.maxMarks) || 0;
    const scores = [];

    (questionSet.students || []).forEach((student) => {
      const raw = student.marks?.[question.key];
      if (raw === "" || raw === null || raw === undefined) return;
      const obtained = Number(raw);
      if (!Number.isFinite(obtained) || obtained < 0 || max <= 0 || obtained > max) {
        invalidCount += 1;
        return;
      }
      scores.push({ obtained, max });
    });

    const stats = computeExamStats(scores, thresholdMarksPercent, targetPercent);
    return {
      key: question.key,
      co: question.co || "",
      kLevel: question.kLevel || "",
      maxMarks: max,
      maxMarksInferred: Boolean(question.maxMarksInferred),
      observedMax: Number(question.observedMax) || 0,
      thresholdMark: max > 0 ? Number(((max * thresholdMarksPercent) / 100).toFixed(2)) : 0,
      ...stats,
    };
  });

  const byCo = new Map();
  questionStats.forEach((question) => {
    const co = String(question.co || "").trim().toUpperCase();
    if (!/^CO\d+$/.test(co) || question.appeared <= 0) return;
    if (!byCo.has(co)) byCo.set(co, []);
    byCo.get(co).push(question);
  });

  const coSummary = [...byCo.entries()]
    .map(([co, questions]) => ({
      co,
      questionCount: questions.length,
      questionKeys: questions.map((q) => q.key),
      outcomeLevel: Number((questions.reduce((sum, q) => sum + q.outcomeLevel, 0) / questions.length).toFixed(4)),
      averageAttainedPercent: Number((questions.reduce((sum, q) => sum + q.attainedPercent, 0) / questions.length).toFixed(4)),
    }))
    .sort((a, b) => Number(a.co.replace(/\D/g, "")) - Number(b.co.replace(/\D/g, "")));

  return {
    questions: questionStats,
    coSummary,
    invalidCount,
    studentCount: (questionSet.students || []).length,
  };
}

const ACTIVITY_ALIASES = {
  SEMINAR: "SE",
  SE: "SE",
  ASSIGNMENT: "AR",
  AR: "AR",
  INNOVATIVE: "IT",
  INNOVATION: "IT",
  IT: "IT",
  MCQ: "MCQ",
  LIBRARY: "LIB",
  LIB: "LIB",
  COMP: "COMP",
  COMPONENT: "COMP",
  ATTENDANCE: "AT",
  AT: "AT",
};

function sourceKeyForComponent(component, sourceComponents) {
  const available = new Set((sourceComponents || []).map((c) => String(c.key || "").toUpperCase()));
  const candidates = [component.key, component.label]
    .map((value) => String(value || "").trim().toUpperCase())
    .filter(Boolean);

  for (const candidate of candidates) {
    if (available.has(candidate)) return candidate;
    const alias = ACTIVITY_ALIASES[candidate];
    if (alias && available.has(alias)) return alias;
  }
  return "";
}

function computeActivitySummary(activitySet, ciaComponents, thresholdMarksPercent, targetPercent) {
  if (!activitySet) return [];
  const sourceComponents = activitySet.components || [];
  const activityComponents = (ciaComponents || []).filter((c) => !["T1", "T2"].includes(String(c.key || "").toUpperCase()));

  return activityComponents.map((component) => {
    const sourceKey = sourceKeyForComponent(component, sourceComponents);
    const sourceMeta = sourceComponents.find((c) => String(c.key || "").toUpperCase() === sourceKey);
    const sourceMax = Number(sourceMeta?.maxMarks) || Number(sourceMeta?.inferredMax) || 0;
    const configuredMax = Number(component.maxMarks) || 0;
    // Imported departments can use different activity maxima (for example
    // Assignment /5, /10 or /20). The source dataset therefore owns the mark
    // maximum; the settings component only owns the CO coverage.
    const max = sourceMax > 0 ? sourceMax : configuredMax;
    const scores = [];

    if (sourceKey) {
      (activitySet.students || []).forEach((student) => {
        const raw = student.marks?.[sourceKey];
        if (raw === "" || raw === null || raw === undefined) return;
        scores.push({ obtained: Number(raw), max });
      });
    }

    const stats = computeExamStats(scores, thresholdMarksPercent, targetPercent);
    const coStart = Number(component.coStart) || 1;
    const coEnd = Number(component.coEnd) || coStart;
    const coList = [];
    for (let n = coStart; n <= coEnd; n += 1) coList.push(`CO${n}`);

    return {
      key: component.key,
      label: component.label,
      sourceKey,
      coStart,
      coEnd,
      coList,
      maxMarks: max,
      sourceObservedMax: Number(sourceMeta?.observedMax) || 0,
      sourceInferredMax: Number(sourceMeta?.inferredMax) || 0,
      maxMarksInferred: sourceMeta ? sourceMeta.maxMarksInferred !== false : false,
      ...stats,
    };
  });
}

function computeQuestionWiseConsolidated({
  eseMarks,
  t1Set,
  t2Set,
  activitySet,
  ciaComponents,
  coList,
  settings,
}) {
  const { thresholdMarksPercent, targetPercent, internalWeight, externalWeight } = settings;
  const configuredEseMax = Number(settings.eseMaxMarks) > 0 ? Number(settings.eseMaxMarks) : 75;

  // ESE logic is intentionally unchanged: one read-only total mark per student.
  const eseSummary = computeExamStats(
    eseMarks.map((m) => ({ obtained: m.obtained, max: configuredEseMax })),
    thresholdMarksPercent,
    targetPercent
  );

  const t1Summary = computeQuestionWiseSet(t1Set, thresholdMarksPercent, targetPercent);
  const t2Summary = computeQuestionWiseSet(t2Set, thresholdMarksPercent, targetPercent);
  const activitySummary = computeActivitySummary(activitySet, ciaComponents, thresholdMarksPercent, targetPercent);

  const t1ByCo = new Map(t1Summary.coSummary.map((c) => [c.co, c]));
  const t2ByCo = new Map(t2Summary.coSummary.map((c) => [c.co, c]));

  const innovativeComponents = activitySummary.filter((c) => /INNOV|^IT$/i.test(`${c.key} ${c.label} ${c.sourceKey}`));
  const regularActivities = activitySummary.filter((c) => !innovativeComponents.includes(c));

  // Reference workbook: CIA=25 is split 22.5 (main internal evidence) + 2.5 (innovative).
  // Expressed as 90% / 10% of whatever CIA weight the staff configures.
  const innovativeShareOfCIA = 0.10;
  const innovativeWeight = Number((internalWeight * innovativeShareOfCIA).toFixed(4));
  const mainInternalWeight = Number((internalWeight - innovativeWeight).toFixed(4));

  const coAttainment = coList.map((rawCo) => {
    const co = String(rawCo || "").trim().toUpperCase();
    const mainEvidence = [];

    const t1 = t1ByCo.get(co);
    if (t1) mainEvidence.push({ source: "T1", level: t1.outcomeLevel });
    const t2 = t2ByCo.get(co);
    if (t2) mainEvidence.push({ source: "T2", level: t2.outcomeLevel });

    regularActivities.forEach((activity) => {
      if (activity.coList.includes(co) && activity.appeared > 0) {
        mainEvidence.push({ source: activity.label, level: activity.outcomeLevel });
      }
    });

    const innovativeEvidence = innovativeComponents
      .filter((activity) => activity.coList.includes(co) && activity.appeared > 0)
      .map((activity) => ({ source: activity.label, level: activity.outcomeLevel }));

    const mainInternal = mainEvidence.length
      ? Number((mainEvidence.reduce((sum, item) => sum + item.level, 0) / mainEvidence.length).toFixed(4))
      : 0;
    const innovative = innovativeEvidence.length
      ? Number((innovativeEvidence.reduce((sum, item) => sum + item.level, 0) / innovativeEvidence.length).toFixed(4))
      : 0;

    const internal = internalWeight > 0
      ? Number(((mainInternal * mainInternalWeight + innovative * innovativeWeight) / internalWeight).toFixed(4))
      : 0;
    const external = eseSummary.outcomeLevel;
    const weight = Number((
      mainInternal * (mainInternalWeight / 100) +
      innovative * (innovativeWeight / 100) +
      external * (externalWeight / 100)
    ).toFixed(4));

    return {
      co,
      t1: t1?.outcomeLevel ?? null,
      t2: t2?.outcomeLevel ?? null,
      mainInternal,
      innovative,
      internal,
      external,
      weight,
      mainEvidence,
      innovativeEvidence,
    };
  });

  const weightedAverage = coAttainment.length > 0
    ? Number((coAttainment.reduce((sum, c) => sum + c.weight, 0) / coAttainment.length).toFixed(4))
    : 0;

  return {
    eseSummary,
    t1Summary,
    t2Summary,
    activitySummary,
    coAttainment,
    weightedAverage,
    formulaWeights: { mainInternalWeight, innovativeWeight, externalWeight },
  };
}

/** Legacy component-total CIA calculation retained for old records/imports. */
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
    const internal = covering.length > 0
      ? Number((covering.reduce((sum, c) => sum + c.outcomeLevel, 0) / covering.length).toFixed(4))
      : 0;
    const external = eseSummary.outcomeLevel;
    const weight = Number((internal * (internalWeight / 100) + external * (externalWeight / 100)).toFixed(4));
    return { co, internal, external, weight };
  });

  const weightedAverage = coAttainment.length > 0
    ? Number((coAttainment.reduce((s, c) => s + c.weight, 0) / coAttainment.length).toFixed(4))
    : 0;

  return { eseSummary, ciaComponentSummary, coAttainment, weightedAverage };
}

/**
 * Excel-equivalent PO/PSO computation.
 * Expected = AVERAGE(non-zero CO correlation values)
 * Observed = Expected * weightedAverage / 3
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
      const observed = expected > 0 ? expected * (Number(weightedAverage) || 0) / 3 : 0;

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

module.exports = {
  computeConsolidated,
  computeQuestionWiseConsolidated,
  computeQuestionWiseSet,
  computeActivitySummary,
  computePoPsoAttainment,
  outcomeLevel,
  computeExamStats,
};
