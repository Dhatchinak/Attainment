export {};
const assert = require("node:assert/strict");
const {
  computeExamStats,
  computePoPsoAttainment,
  computeQuestionWiseSet,
} = require("../utils/attainmentCalc");

const exam = computeExamStats(
  [
    { obtained: 5, max: 10 },
    { obtained: 4, max: 10 },
    { obtained: 10, max: 10 },
  ],
  50,
  100
);
assert.deepEqual(exam, {
  appeared: 3,
  attained: 2,
  attainedPercent: 66.6667,
  outcomeLevel: 2,
});

const questionSet = computeQuestionWiseSet({
  questions: [{ key: "Q1", co: "CO1", kLevel: "K1", maxMarks: 10 }],
  students: [
    { marks: { Q1: 5 } },
    { marks: { Q1: 4 } },
    { marks: { Q1: 10 } },
  ],
}, 50, 100);
assert.equal(questionSet.invalidCount, 0);
assert.equal(questionSet.coSummary[0].co, "CO1");
assert.equal(questionSet.coSummary[0].outcomeLevel, 2);

const mapped = computePoPsoAttainment({
  matrixRows: [
    { po: [3], pso: [2] },
    { po: [1], pso: [0] },
  ],
  weightedAverage: 2.4,
  poCount: 1,
  psoCount: 1,
});
assert.deepEqual(mapped.poAttainment[0], { po: "PO1", value: 1.6, expected: 2 });
assert.deepEqual(mapped.psoAttainment[0], { pso: "PSO1", value: 1.6, expected: 2 });

console.log("Attainment calculation regression tests passed.");
