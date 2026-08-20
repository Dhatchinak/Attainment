const crypto = require("crypto");
const HistoricalAttainmentRecord = require("../models/HistoricalAttainmentRecord");

const OUTCOME_ORDER = [
  "po1", "po2", "po3", "po4", "po5", "po6", "po7", "po8", "po9",
  "pso1", "pso2", "pso3", "pso4",
];

function clean(value) {
  return String(value ?? "").trim();
}

function sectionValue(value) {
  const section = clean(value).toUpperCase();
  return section && section !== "NULL" ? section : "NIL";
}

function parseOutcomeObject(value) {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { return {}; }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const result = {};
  Object.entries(parsed).forEach(([key, raw]) => {
    const normalizedKey = clean(key).toLowerCase();
    if (!/^(po|pso)\d+$/.test(normalizedKey)) return;
    const number = Number(raw);
    result[normalizedKey] = raw === "-" || raw === "" || !Number.isFinite(number) ? null : number;
  });
  return result;
}

function recordKey(row) {
  return [row.year, row.batch, row.semester, row.department, sectionValue(row.section), row.course_code, row.professor_name]
    .map((value) => clean(value).toUpperCase().replace(/\s+/g, " "))
    .join("::");
}

function extractRows(payload) {
  if (!Array.isArray(payload)) throw new Error("Expected a phpMyAdmin JSON export array");
  const table = payload.find((item) => item?.type === "table" && item?.name === "attainment_records");
  if (!table || !Array.isArray(table.data)) throw new Error("attainment_records table was not found in this JSON file");
  return table.data;
}

async function importHistoricalAttainment(buffer, { fileName = "", importedBy = "" } = {}) {
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  let payload;
  try { payload = JSON.parse(buffer.toString("utf8")); }
  catch { throw new Error("The uploaded file is not valid JSON"); }

  const rows = extractRows(payload);
  const prepared = rows.map((row) => {
    const expectedValues = parseOutcomeObject(row.expected_values);
    const observedValues = parseOutcomeObject(row.observed_values);
    const keys = OUTCOME_ORDER.filter((key) => key in expectedValues || key in observedValues);
    const outcomes = keys.map((key) => ({
      outcome: key.toUpperCase(),
      expected: expectedValues[key] ?? null,
      observed: observedValues[key] ?? null,
    }));
    return {
      row,
      key: recordKey(row),
      expectedValues,
      observedValues,
      outcomes,
      sourceCreatedAt: row.created_at ? new Date(`${row.created_at.replace(" ", "T")}Z`) : null,
    };
  });

  const groups = new Map();
  prepared.forEach((item) => {
    if (!groups.has(item.key)) groups.set(item.key, []);
    groups.get(item.key).push(item);
  });
  groups.forEach((items) => items.sort((a, b) =>
    Number(a.sourceCreatedAt || 0) - Number(b.sourceCreatedAt || 0)
      || Number(a.row.id || 0) - Number(b.row.id || 0)
  ));

  const now = new Date();
  const operations = [];
  let invalidRows = 0;
  groups.forEach((items) => items.forEach((item, index) => {
    const row = item.row;
    if (!clean(row.id) || !clean(row.year) || !clean(row.department) || !clean(row.course_code) || !Number(row.semester)) {
      invalidRows += 1;
      return;
    }
    operations.push({
      updateOne: {
        filter: { sourceSystem: "LEGACY_FINALBHC", legacyId: clean(row.id) },
        update: {
          $set: {
            recordKey: item.key,
            version: index + 1,
            isLatest: index === items.length - 1,
            academicYear: clean(row.year),
            batch: clean(row.batch),
            semester: Number(row.semester),
            studyLevel: Number(row.level) || null,
            department: clean(row.department),
            assessmentType: clean(row.programme) || "ESE",
            section: sectionValue(row.section),
            courseTitle: clean(row.course_title),
            courseCode: clean(row.course_code),
            courseType: clean(row.course_type),
            professorName: clean(row.professor_name),
            expectedValues: item.expectedValues,
            observedValues: item.observedValues,
            outcomes: item.outcomes,
            poCount: item.outcomes.filter((value) => value.outcome.startsWith("PO")).length,
            psoCount: item.outcomes.filter((value) => value.outcome.startsWith("PSO")).length,
            sourceCreatedAt: item.sourceCreatedAt,
            sourceFileName: fileName,
            sourceFileHash: hash,
            raw: row,
            importedAt: now,
            importedBy,
          },
          $setOnInsert: { sourceSystem: "LEGACY_FINALBHC", legacyId: clean(row.id) },
        },
        upsert: true,
      },
    });
  }));

  let matched = 0, modified = 0, upserted = 0;
  for (let start = 0; start < operations.length; start += 500) {
    const result = await HistoricalAttainmentRecord.bulkWrite(operations.slice(start, start + 500), { ordered: false });
    matched += result.matchedCount || 0;
    modified += result.modifiedCount || 0;
    upserted += result.upsertedCount || 0;
  }

  return {
    sourceRows: rows.length,
    imported: operations.length,
    inserted: upserted,
    matched,
    updated: modified,
    invalidRows,
    logicalRecordGroups: groups.size,
    historicalVersions: operations.length - groups.size,
    sourceFileHash: hash,
  };
}

module.exports = { importHistoricalAttainment, parseOutcomeObject, sectionValue, recordKey };
