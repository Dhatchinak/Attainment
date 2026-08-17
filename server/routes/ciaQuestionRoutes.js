const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const crypto = require("crypto");
const Allocation = require("../models/Allocation");
const AcademicYear = require("../models/AcademicYear");
const AttainmentSettings = require("../models/AttainmentSettings");
const CIAQuestionSet = require("../models/CIAQuestionSet");
const CIAActivitySet = require("../models/CIAActivitySet");
const CIAVerification = require("../models/CIAVerification");
const CIADepartmentImport = require("../models/CIADepartmentImport");
const { authRequired } = require("../middleware/auth");
const { computeQuestionWiseSet, computeActivitySummary } = require("../utils/attainmentCalc");
const { paperCodeKey, findQuestionSet, findActivitySet } = require("../utils/ciaQuestionData");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
router.use(authRequired);

const ACTIVITY_LABELS = {
  SE: "Seminar",
  AR: "Assignment",
  IT: "Innovative",
  MCQ: "MCQ",
  LIB: "Library",
  COMP: "COMP",
  AT: "Attendance",
};
const ACTIVITY_KEYS = Object.keys(ACTIVITY_LABELS);
const MAX_BUCKETS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 100];

function clean(value) {
  const text = String(value ?? "").trim();
  if (!text || text.toUpperCase() === "NULL") return "";
  return text;
}

function num(value) {
  const text = clean(value);
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function yearFromSource(value) {
  const match = clean(value).match(/20\d{2}\s*-\s*20\d{2}/);
  return match ? match[0].replace(/\s+/g, "") : "";
}

function inferMax(observedMax) {
  const value = Number(observedMax) || 0;
  if (value <= 0) return 0;
  if (Number.isInteger(value) && MAX_BUCKETS.includes(value)) return value;
  return MAX_BUCKETS.find((candidate) => candidate >= value) || Math.ceil(value);
}

function inferActivityMax(key, observedMax) {
  const value = Number(observedMax) || 0;
  if (value <= 0) return 0;
  const normal = String(key || "").toUpperCase();
  const buckets = ["SE", "AR", "IT"].includes(normal)
    ? [5, 10, 20, 25, 30, 40, 50]
    : normal === "AT"
      ? [5, 10, 20]
      : normal === "LIB"
        ? [1, 2, 3, 5, 10, 20]
        : MAX_BUCKETS;
  return buckets.find((candidate) => candidate >= value) || Math.ceil(value);
}

function fillZeroQuestionMaximums(questions) {
  const rows = (questions || []).map((q) => ({ ...q }));
  const numberOf = (key) => Number(String(key || "").match(/\d+/)?.[0] || 0);
  const suffixOf = (key) => String(key || "").match(/[ab]$/i)?.[0]?.toLowerCase() || "";

  for (let index = 0; index < rows.length; index += 1) {
    const q = rows[index];
    if (Number(q.maxMarks) > 0) continue;

    const number = numberOf(q.key);
    const suffix = suffixOf(q.key);
    let candidate = null;

    // Strongest inference: an unattempted optional "b" question normally has
    // the same maximum as its attempted "a" counterpart (and vice versa).
    if (suffix) {
      candidate = rows.find((other) =>
        other.key !== q.key && numberOf(other.key) === number && suffixOf(other.key) && Number(other.maxMarks) > 0
      );
    }

    const ranked = (predicate) => rows
      .map((other, otherIndex) => ({ other, distance: Math.abs(otherIndex - index) }))
      .filter(({ other }) => other.key !== q.key && Number(other.maxMarks) > 0 && predicate(other))
      .sort((a, b) => a.distance - b.distance);

    if (!candidate) candidate = ranked((other) => clean(other.co).toUpperCase() === clean(q.co).toUpperCase() && clean(other.kLevel).toUpperCase() === clean(q.kLevel).toUpperCase())[0]?.other || null;
    if (!candidate) candidate = ranked((other) => clean(other.co).toUpperCase() === clean(q.co).toUpperCase())[0]?.other || null;

    if (candidate) {
      q.maxMarks = Number(candidate.maxMarks) || inferMax(candidate.observedMax);
      q.maxMarksInferred = true;
      q.maxMarksInferenceSource = candidate.key;
    }
  }
  return rows;
}

function isVerified(verification, source) {
  if (!verification || !source || !source.scope?.signature) return false;
  return String(verification.sourceId) === String(source._id) &&
    new Date(verification.sourceUpdatedAt).getTime() === new Date(source.updatedAt).getTime() &&
    verification.sourceScopeSignature === source.scope.signature;
}

async function assertOwnership(req, allocationId) {
  const allocation = await Allocation.findById(allocationId).populate("academicYear").populate("batch");
  if (!allocation) return { error: "Allocation not found", status: 404 };
  if (!req.user.isAdmin && allocation.staff_id !== req.user.staff_id) {
    return { error: "Not your allocation", status: 403 };
  }
  return { allocation };
}

function sheetRows(workbook, name) {
  const sheet = workbook.Sheets[name];
  return sheet ? XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true }) : [];
}

function findSheetName(workbook, wanted) {
  const exact = workbook.SheetNames.find((name) => name.toLowerCase() === wanted.toLowerCase());
  if (exact) return exact;
  return workbook.SheetNames.find((name) => name.toLowerCase().includes(wanted.toLowerCase()));
}

function groupBy(rows, makeKey) {
  const map = new Map();
  rows.forEach((row) => {
    const key = makeKey(row);
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
}

function departmentKeyFromName(value) {
  return clean(value)
    .replace(/^department\s+of\s+/i, "")
    .replace(/\b(?:dept|department)\.?$/i, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function canonicalDepartmentName(value) {
  const stripped = clean(value)
    .replace(/^department\s+of\s+/i, "")
    .replace(/\b(?:dept|department)\.?$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "";
  return stripped
    .split(" ")
    .map((word) => word.length <= 3 && /^[A-Z0-9]+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function inferDepartmentFromFilename(filename) {
  const base = clean(filename).replace(/\.(xlsx|xls)$/i, "");
  const explicit = base.match(/(?:^|[-_(])\s*([A-Za-z][A-Za-z &.]{2,}?)\s+(?:DEPT|DEPARTMENT)\b/i);
  if (explicit?.[1]) return canonicalDepartmentName(explicit[1]);

  const cleaned = base
    .replace(/20?\d{2}\s*[-_]\s*\d{2,4}/g, " ")
    .replace(/\b(CIA|MARKS?|ODD|EVEN|DATA|WORKBOOK|EXPORT|DEPT|DEPARTMENT)\b/gi, " ")
    .replace(/[()_[\]{}-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned && cleaned.length <= 60 ? canonicalDepartmentName(cleaned) : "";
}

function detectWorkbookDepartment(workbook, filename) {
  const found = new Map();
  const activityNames = workbook.SheetNames.filter((name) => /^(MAJOR|PARTII)_(ODD|EVEN)$/i.test(name));
  for (const name of activityNames) {
    const rows = sheetRows(workbook, name);
    for (const row of rows.slice(0, 500)) {
      const raw = clean(row.department || row.DEPARTMENT || row.Department);
      if (!raw) continue;
      const canonical = canonicalDepartmentName(raw);
      const key = departmentKeyFromName(canonical);
      if (key) found.set(key, canonical);
    }
  }

  if (found.size > 1) {
    throw new Error(`This workbook contains multiple departments (${[...found.values()].join(", ")}). Upload one workbook per department; you can select all department files together in the Admin page.`);
  }
  if (found.size === 1) return [...found.values()][0];

  const inferred = inferDepartmentFromFilename(filename);
  if (inferred) return inferred;
  throw new Error("Department could not be detected from the workbook. Keep the ERP 'department' column in MAJOR/PARTII sheets or include the department name in the file name.");
}

function departmentDisplayName(value) {
  const canonical = canonicalDepartmentName(value);
  return /^department\s+of\s+/i.test(clean(value)) ? clean(value) : `Department of ${canonical || "Unknown"}`;
}

function classIdentity(student) {
  const course = clean(student?.course) || "Unknown course";
  const sectionRaw = clean(student?.section);
  const section = !sectionRaw || ["NIL", "NULL", "NONE", "AIDED", "-"].includes(sectionRaw.toUpperCase())
    ? "NIL (Aided)"
    : sectionRaw;
  return `${course}|${section}`;
}

function validateDepartmentData(questionDocs, activityDocs) {
  const issues = [];
  const add = (severity, code, message, extra = {}) => issues.push({ severity, code, message, ...extra });
  const paperGroups = new Map();
  const uniquePapers = new Set();
  const uniqueClasses = new Set();
  const uniqueStudents = new Set();
  let questionRows = 0;
  let activityRows = 0;
  let inferredQuestionMaxCount = 0;
  let inferredActivityMaxCount = 0;

  for (const set of questionDocs) {
    const groupKey = `${set.paperCodeKey}|${set.term}|${set.academicYear}`;
    uniquePapers.add(`${set.paperCodeKey}|${set.term}`);
    if (!paperGroups.has(groupKey)) paperGroups.set(groupKey, { paperCode: set.paperCode, term: set.term, exams: new Set() });
    paperGroups.get(groupKey).exams.add(set.exam);

    const students = Array.isArray(set.students) ? set.students : [];
    questionRows += students.length;
    if (!students.length) add("critical", "NO_STUDENTS", `${set.paperCode} ${set.exam} has no student question-mark rows.`, { paperCode: set.paperCode, exam: set.exam, term: set.term });
    for (const student of students) {
      if (student.regNo) uniqueStudents.add(String(student.regNo).trim().toUpperCase());
      uniqueClasses.add(classIdentity(student));
    }

    const questions = Array.isArray(set.questions) ? set.questions : [];
    if (!questions.length) add("critical", "NO_QUESTIONS", `${set.paperCode} ${set.exam} has no mapped questions.`, { paperCode: set.paperCode, exam: set.exam, term: set.term });
    let invalidCoCount = 0;
    let invalidMaxCount = 0;
    let aboveMaxCount = 0;
    for (const q of questions) {
      if (!/^CO\d+$/i.test(clean(q.co))) invalidCoCount += 1;
      if (!(Number(q.maxMarks) > 0)) invalidMaxCount += 1;
      if (Number(q.observedMax || 0) > Number(q.maxMarks || 0)) aboveMaxCount += 1;
      if (q.maxMarksInferred !== false) inferredQuestionMaxCount += 1;
    }
    if (invalidCoCount) add("critical", "INVALID_CO", `${set.paperCode} ${set.exam} has ${invalidCoCount} question(s) without a valid CO mapping.`, { paperCode: set.paperCode, exam: set.exam, term: set.term });
    if (invalidMaxCount) add("critical", "INVALID_QUESTION_MAX", `${set.paperCode} ${set.exam} has ${invalidMaxCount} question(s) whose maximum mark cannot be inferred because no usable source marks were found.`, { paperCode: set.paperCode, exam: set.exam, term: set.term });
    if (aboveMaxCount) add("critical", "MARK_ABOVE_MAX", `${set.paperCode} ${set.exam} has ${aboveMaxCount} question(s) containing a mark above the current maximum.`, { paperCode: set.paperCode, exam: set.exam, term: set.term });
    if (!clean(set.staffName)) add("warning", "NO_STAFF_NAME", `${set.paperCode} ${set.exam} has no staff in-charge name in the source workbook.`, { paperCode: set.paperCode, exam: set.exam, term: set.term });
  }

  const activityByPaper = new Map();
  for (const set of activityDocs) {
    const key = `${set.paperCodeKey}|${set.term}|${set.academicYear}`;
    activityByPaper.set(key, set);
    activityRows += Array.isArray(set.students) ? set.students.length : 0;
    if (!(set.students || []).length) add("critical", "NO_ACTIVITY_STUDENTS", `${set.paperCode} ${set.term} has no CIA activity rows.`, { paperCode: set.paperCode, term: set.term });
    const components = Array.isArray(set.components) ? set.components : [];
    for (const component of components) {
      if (!(Number(component.maxMarks) > 0)) add("critical", "INVALID_ACTIVITY_MAX", `${set.paperCode} ${component.label || component.key} has no usable maximum mark.`, { paperCode: set.paperCode, term: set.term });
      if (component.maxMarksInferred !== false) inferredActivityMaxCount += 1;
    }
  }

  for (const [key, group] of paperGroups) {
    for (const exam of ["T1", "T2"]) {
      if (!group.exams.has(exam)) add("critical", `MISSING_${exam}`, `${group.paperCode} ${group.term} is missing ${exam} question-wise data.`, { paperCode: group.paperCode, exam, term: group.term });
    }
    const activity = activityByPaper.get(key);
    if (!activity) {
      add("critical", "MISSING_ACTIVITIES", `${group.paperCode} ${group.term} has no CIA activity dataset.`, { paperCode: group.paperCode, term: group.term });
      continue;
    }
    const componentKeys = new Set((activity.components || []).map((component) => String(component.key || "").toUpperCase()));
    const missingPrimary = ["SE", "AR", "IT"].filter((keyName) => !componentKeys.has(keyName));
    if (missingPrimary.length) add("critical", "MISSING_PRIMARY_ACTIVITIES", `${group.paperCode} is missing required CIA component(s): ${missingPrimary.join(", ")}.`, { paperCode: group.paperCode, term: group.term });
  }

  if (inferredQuestionMaxCount) add("warning", "INFERRED_QUESTION_MAX", `${inferredQuestionMaxCount} question maximum mark(s) were inferred from observed marks. One-click department verification will accept these values.`);
  if (inferredActivityMaxCount) add("warning", "INFERRED_ACTIVITY_MAX", `${inferredActivityMaxCount} activity maximum mark(s) were inferred from observed marks. One-click department verification will accept these values.`);

  const criticalCount = issues.filter((issue) => issue.severity === "critical").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  return {
    paperCount: uniquePapers.size,
    classCount: [...uniqueClasses].filter((value) => !value.startsWith("Unknown course|")).length,
    studentCount: uniqueStudents.size,
    questionSetCount: questionDocs.length,
    activitySetCount: activityDocs.length,
    questionRows,
    activityRows,
    inferredQuestionMaxCount,
    inferredActivityMaxCount,
    criticalCount,
    warningCount,
    issues: issues.slice(0, 250),
    status: "READY",
  };
}

async function ensureLegacyDepartmentImports() {
  const [questionSets, activitySets] = await Promise.all([
    CIAQuestionSet.find({}).lean(),
    CIAActivitySet.find({}).lean(),
  ]);
  if (!questionSets.length && !activitySets.length) return;

  const groups = new Map();
  const addToGroup = (kind, set) => {
    const departmentName = canonicalDepartmentName(set.departmentName || inferDepartmentFromFilename(set.sourceFileName));
    const departmentKey = departmentKeyFromName(departmentName);
    const academicYear = clean(set.academicYear);
    if (!departmentKey || !academicYear) return;
    const key = `${departmentKey}|${academicYear}`;
    if (!groups.has(key)) groups.set(key, { departmentName, departmentKey, academicYear, questionDocs: [], activityDocs: [], sourceFileName: set.sourceFileName || "", importedAt: set.importedAt || set.updatedAt || new Date() });
    const group = groups.get(key);
    group[`${kind}Docs`].push({ ...set, departmentName, departmentKey, departmentImportVersion: set.departmentImportVersion || 1 });
    if (new Date(set.updatedAt || 0) > new Date(group.importedAt || 0)) {
      group.sourceFileName = set.sourceFileName || group.sourceFileName;
      group.importedAt = set.importedAt || set.updatedAt || group.importedAt;
    }
  };
  questionSets.forEach((set) => addToGroup("question", set));
  activitySets.forEach((set) => addToGroup("activity", set));

  for (const group of groups.values()) {
    const existing = await CIADepartmentImport.findOne({ departmentKey: group.departmentKey, academicYear: group.academicYear });
    if (existing) continue;
    const version = 1;
    const summary = validateDepartmentData(group.questionDocs, group.activityDocs);
    await Promise.all([
      CIAQuestionSet.updateMany(
        { _id: { $in: group.questionDocs.map((doc) => doc._id) } },
        { $set: { departmentName: group.departmentName, departmentKey: group.departmentKey, departmentImportVersion: version, departmentVerified: false } }
      ),
      CIAActivitySet.updateMany(
        { _id: { $in: group.activityDocs.map((doc) => doc._id) } },
        { $set: { departmentName: group.departmentName, departmentKey: group.departmentKey, departmentImportVersion: version, departmentVerified: false } }
      ),
    ]);
    await CIADepartmentImport.create({
      departmentName: group.departmentName,
      departmentKey: group.departmentKey,
      academicYear: group.academicYear,
      sourceFileName: group.sourceFileName,
      terms: [...new Set([...group.questionDocs.map((doc) => doc.term), ...group.activityDocs.map((doc) => doc.term)].filter(Boolean))],
      version,
      ...summary,
      importedAt: group.importedAt,
      history: [{ action: "reimported", by: "migration", at: new Date(), version, note: "Existing CIA datasets grouped into department-wise verification." }],
    });
  }
}

/**
 * Admin upload for the English-department CIA workbook supplied with the project.
 * It imports question mappings, question-wise T1/T2 marks, staff-in-charge names,
 * and MAJOR/PARTII CIA activity marks into MongoDB.
 */
async function runBulkBatches(Model, operations, batchSize = 20) {
  for (let i = 0; i < operations.length; i += batchSize) {
    const batch = operations.slice(i, i + batchSize);
    if (batch.length) {
      await Model.bulkWrite(batch, { ordered: false });
    }
  }
}

router.post("/import", upload.single("file"), async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ message: "Admin access only" });
  if (!req.file) return res.status(400).json({ message: "Excel workbook is required" });

  let stage = "migrating existing CIA imports";
  try {
    // Backfill department identity on v7/older CIA documents before an upsert.
    // This prevents a re-import from creating a second copy of the same paper.
    await ensureLegacyDepartmentImports();

    stage = "reading workbook";
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });

    stage = "detecting department";
    const departmentName = detectWorkbookDepartment(wb, req.file.originalname);
    const departmentKey = departmentKeyFromName(departmentName);
    if (!departmentKey) throw new Error("A valid department name could not be detected.");

    stage = "analysing workbook sheets";
    const questionOps = [];
    const activityOps = [];
    let questionRowsImported = 0;
    let activityRowsImported = 0;
    const metaByPaperTerm = new Map();
    const detectedTerms = [];
    const detectedAcademicYears = new Set();

    for (const term of ["ODD", "EVEN"]) {
      const lower = term.toLowerCase();
      const levelName = findSheetName(wb, `ciaobe_level_${lower}`);
      const marksName = findSheetName(wb, `ciaobe_ques_test_${lower}`);
      if (!levelName && !marksName) continue;
      if (!levelName || !marksName) {
        throw new Error(
          `${term} CIA import requires both question-mapping and question-mark sheets. ` +
          `Found mapping=${levelName || "missing"}, marks=${marksName || "missing"}.`
        );
      }
      detectedTerms.push(term);

      const levelRows = sheetRows(wb, levelName);
      const markRows = sheetRows(wb, marksName);
      const markGroups = groupBy(markRows, (row) => {
        const paper = paperCodeKey(row.papercode || row.Papercode || row.PAPERCODE);
        const exam = clean(row.exam || row.EXAM).toUpperCase();
        return paper && ["T1", "T2"].includes(exam) ? `${paper}|${exam}` : "";
      });

      for (const mapping of levelRows) {
        const paperCode = clean(mapping.Papercode || mapping.papercode || mapping.PAPERCODE);
        const exam = clean(mapping.exam || mapping.EXAM).toUpperCase();
        if (!paperCode || !["T1", "T2"].includes(exam)) continue;

        const paperKey = paperCodeKey(paperCode);
        const sourceRows = markGroups.get(`${paperKey}|${exam}`) || [];
        const questionKeys = Object.keys(mapping)
          .filter((key) => /^Q\d+(?:[ab])?C$/i.test(key))
          .map((key) => key.slice(0, -1));

        if (!questionKeys.length) continue;

        const questions = fillZeroQuestionMaximums(questionKeys.map((questionKey, index) => {
          let observedMax = 0;
          sourceRows.forEach((row) => {
            const value = num(row[questionKey]);
            if (value !== null) observedMax = Math.max(observedMax, value);
          });
          return {
            key: questionKey,
            co: clean(mapping[`${questionKey}C`]).toUpperCase(),
            kLevel: clean(mapping[`${questionKey}K`]).toUpperCase(),
            observedMax,
            maxMarks: inferMax(observedMax),
            maxMarksInferred: true,
            order: index + 1,
          };
        }));

        const students = sourceRows.map((row) => {
          const marks = {};
          questionKeys.forEach((questionKey) => {
            const value = num(row[questionKey]);
            if (value !== null) marks[questionKey] = value;
          });
          return {
            regNo: clean(row.rollno || row.ROLLNO || row.regno || row.REGNO),
            name: clean(row.name || row.NAME),
            course: clean(row.course || row.COURSE),
            section: clean(row.section || row.SECTION),
            marks,
            total: num(row.total || row.TOTAL),
          };
        }).filter((student) => student.regNo);

        const academicYearSource = clean(mapping.syear || mapping.SYEAR);
        const academicYear = yearFromSource(academicYearSource);
        if (academicYear) detectedAcademicYears.add(academicYear);
        const staffName = clean(mapping.staffname || mapping.STAFFNAME);

        questionOps.push({
          updateOne: {
            filter: { departmentKey, paperCodeKey: paperKey, exam, term, academicYear },
            update: {
              $set: {
                departmentName,
                departmentKey,
                departmentVerified: false,
                departmentVerifiedBy: "",
                departmentVerifiedAt: null,
                paperCode,
                paperCodeKey: paperKey,
                exam,
                term,
                academicYear,
                academicYearSource,
                staffName,
                sourceFileName: req.file.originalname,
                sourceSheet: marksName,
                questions,
                students,
                importedAt: new Date(),
              },
            },
            upsert: true,
          },
        });

        questionRowsImported += students.length;
        const metaKey = `${paperKey}|${term}`;
        if (!metaByPaperTerm.has(metaKey) || exam === "T1") {
          metaByPaperTerm.set(metaKey, { academicYear, staffName });
        }
      }

      const activitySheetNames = [
        findSheetName(wb, `MAJOR_${term}`),
        findSheetName(wb, `PARTII_${term}`),
      ].filter(Boolean);

      const allActivityRows = activitySheetNames.flatMap((name) =>
        sheetRows(wb, name).map((row) => ({ ...row, __sheet: name }))
      );
      const activityGroups = groupBy(
        allActivityRows,
        (row) => paperCodeKey(row.PAPERCODE || row.papercode)
      );

      for (const [paperKey, rows] of activityGroups.entries()) {
        const paperCode = clean(rows[0]?.PAPERCODE || rows[0]?.papercode);
        if (!paperCode) continue;
        const meta = metaByPaperTerm.get(`${paperKey}|${term}`) || {};

        const components = ACTIVITY_KEYS.map((key) => {
          let observedMax = 0;
          rows.forEach((row) => {
            const value = num(row[key]);
            if (value !== null) observedMax = Math.max(observedMax, value);
          });
          const inferredMax = inferActivityMax(key, observedMax);
          return {
            key,
            label: ACTIVITY_LABELS[key],
            observedMax,
            inferredMax,
            maxMarks: inferredMax,
            maxMarksInferred: true,
          };
        }).filter((component) => component.observedMax > 0);

        const students = rows.map((row) => {
          const marks = {};
          components.forEach((component) => {
            const value = num(row[component.key]);
            if (value !== null) marks[component.key] = value;
          });
          return {
            regNo: clean(row.REGNO || row.regno || row.ROLLNO || row.rollno),
            name: clean(row.NAME || row.name),
            course: clean(row.course || row.COURSE),
            result: clean(row.RESULT || row.result),
            marks,
          };
        }).filter((student) => student.regNo);

        activityOps.push({
          updateOne: {
            filter: { departmentKey, paperCodeKey: paperKey, term, academicYear: meta.academicYear || "" },
            update: {
              $set: {
                departmentName,
                departmentKey,
                departmentVerified: false,
                departmentVerifiedBy: "",
                departmentVerifiedAt: null,
                paperCode,
                paperCodeKey: paperKey,
                term,
                academicYear: meta.academicYear || "",
                staffName: meta.staffName || "",
                sourceFileName: req.file.originalname,
                sourceSheet: [...new Set(rows.map((r) => r.__sheet))].join(", "),
                components,
                students,
                importedAt: new Date(),
              },
            },
            upsert: true,
          },
        });
        activityRowsImported += students.length;
      }
    }

    if (!questionOps.length) {
      throw new Error(
        "No supported T1/T2 question datasets were found. Expected ciaobe_level_odd/even and ciaobe_ques_test_odd/even sheets."
      );
    }
    if (!detectedAcademicYears.size) {
      throw new Error("Academic year could not be detected from the CIA mapping sheets.");
    }

    stage = "preparing department verification";
    const sourceFileHash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    const importMetaByYear = new Map();
    for (const academicYear of detectedAcademicYears) {
      const existing = await CIADepartmentImport.findOne({ departmentKey, academicYear }).lean();
      const version = Number(existing?.version || 0) + 1;
      importMetaByYear.set(academicYear, { version, existing });
    }

    for (const operation of questionOps) {
      const year = operation.updateOne.update.$set.academicYear;
      const meta = importMetaByYear.get(year);
      if (meta) operation.updateOne.update.$set.departmentImportVersion = meta.version;
    }
    for (const operation of activityOps) {
      const year = operation.updateOne.update.$set.academicYear;
      const meta = importMetaByYear.get(year);
      if (meta) operation.updateOne.update.$set.departmentImportVersion = meta.version;
    }

    stage = "registering academic years";
    await AcademicYear.bulkWrite(
      [...detectedAcademicYears].map((year) => ({
        updateOne: {
          filter: { year },
          update: { $set: { isActive: true } },
          upsert: true,
        },
      })),
      { ordered: false }
    );

    stage = "saving T1/T2 question datasets to MongoDB";
    await runBulkBatches(CIAQuestionSet, questionOps, 15);

    stage = "saving CIA activity datasets to MongoDB";
    await runBulkBatches(CIAActivitySet, activityOps, 15);

    stage = "building department verification summary";
    const departmentImports = [];
    for (const academicYear of detectedAcademicYears) {
      const meta = importMetaByYear.get(academicYear);
      const questionDocs = questionOps
        .map((operation) => operation.updateOne.update.$set)
        .filter((doc) => doc.academicYear === academicYear);
      const activityDocs = activityOps
        .map((operation) => operation.updateOne.update.$set)
        .filter((doc) => doc.academicYear === academicYear);
      const summary = validateDepartmentData(questionDocs, activityDocs);
      const now = new Date();

      const updated = await CIADepartmentImport.findOneAndUpdate(
        { departmentKey, academicYear },
        {
          $set: {
            departmentName,
            departmentKey,
            academicYear,
            sourceFileName: req.file.originalname,
            sourceFileHash,
            terms: [...new Set([...questionDocs.map((doc) => doc.term), ...activityDocs.map((doc) => doc.term)].filter(Boolean))],
            version: meta.version,
            ...summary,
            verifiedBy: "",
            verifiedAt: null,
            importedAt: now,
          },
          $push: {
            history: {
              action: "reimported",
              by: req.user.staff_id || "admin",
              at: now,
              version: meta.version,
              note: `Imported ${req.file.originalname}; department verification reset.`,
            },
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      departmentImports.push(updated);
    }

    return res.json({
      message: `${departmentDisplayName(departmentName)} CIA workbook imported to MongoDB`,
      departmentName,
      departmentKey,
      sourceFileName: req.file.originalname,
      sourceFileBytes: req.file.size,
      terms: detectedTerms,
      academicYears: [...detectedAcademicYears].sort(),
      questionSetsImported: questionOps.length,
      questionRowsImported,
      activitySetsImported: activityOps.length,
      activityRowsImported,
      departmentImports: departmentImports.map((item) => ({
        _id: item._id,
        academicYear: item.academicYear,
        status: item.status,
        criticalCount: item.criticalCount,
        warningCount: item.warningCount,
      })),
      note: "Review the department summary once, then use Verify Entire Department. Separate question/activity confirmation is no longer required.",
    });
  } catch (err) {
    console.error(`CIA question import failed during ${stage}`, err);

    const duplicateIndex = err?.code === 11000;
    const mongoUnavailable = ["MongoServerSelectionError", "MongoNetworkError", "MongooseServerSelectionError"].includes(err?.name);

    return res.status(mongoUnavailable ? 503 : 400).json({
      message: duplicateIndex
        ? "CIA data could not be saved because MongoDB has a duplicate/old unique index."
        : "Could not import CIA workbook",
      error: err?.message || "Unknown import error",
      stage,
      hint: duplicateIndex
        ? "Restart the updated backend once so the CIA department-aware indexes can be migrated, then retry."
        : mongoUnavailable
          ? "MongoDB could not be reached. Check MONGO_URI / Atlas network access and retry."
          : "The workbook format was accepted up to this stage; use the stage and error text to identify the failing step.",
    });
  }
});

router.get("/admin/department-imports", async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ message: "Admin access only" });
  try {
    await ensureLegacyDepartmentImports();
    const imports = await CIADepartmentImport.find({}).sort({ academicYear: -1, departmentName: 1 }).lean();
    res.json({
      imports: imports.map((item) => ({
        _id: item._id,
        departmentName: item.departmentName,
        departmentKey: item.departmentKey,
        academicYear: item.academicYear,
        sourceFileName: item.sourceFileName,
        terms: item.terms,
        version: item.version,
        paperCount: item.paperCount,
        classCount: item.classCount,
        studentCount: item.studentCount,
        questionSetCount: item.questionSetCount,
        activitySetCount: item.activitySetCount,
        questionRows: item.questionRows,
        activityRows: item.activityRows,
        inferredQuestionMaxCount: item.inferredQuestionMaxCount,
        inferredActivityMaxCount: item.inferredActivityMaxCount,
        criticalCount: item.criticalCount,
        warningCount: item.warningCount,
        status: item.status,
        verifiedBy: item.verifiedBy,
        verifiedAt: item.verifiedAt,
        importedAt: item.importedAt,
        updatedAt: item.updatedAt,
        issues: (item.issues || []).slice(0, 8),
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || "Unable to load department CIA imports" });
  }
});

router.get("/admin/department-imports/:id", async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ message: "Admin access only" });
  try {
    const record = await CIADepartmentImport.findById(req.params.id).lean();
    if (!record) return res.status(404).json({ message: "Department CIA import not found" });

    let [questionSets, activitySets] = await Promise.all([
      CIAQuestionSet.find({ departmentKey: record.departmentKey, academicYear: record.academicYear, departmentImportVersion: record.version }).lean(),
      CIAActivitySet.find({ departmentKey: record.departmentKey, academicYear: record.academicYear, departmentImportVersion: record.version }).lean(),
    ]);
    if (!questionSets.length) questionSets = await CIAQuestionSet.find({ departmentKey: record.departmentKey, academicYear: record.academicYear }).lean();
    if (!activitySets.length) activitySets = await CIAActivitySet.find({ departmentKey: record.departmentKey, academicYear: record.academicYear }).lean();

    const activityMap = new Map(activitySets.map((set) => [`${set.paperCodeKey}|${set.term}`, set]));
    const groups = new Map();
    for (const set of questionSets) {
      const key = `${set.paperCodeKey}|${set.term}`;
      if (!groups.has(key)) groups.set(key, { paperCode: set.paperCode, paperCodeKey: set.paperCodeKey, term: set.term, t1: null, t2: null, classes: new Set(), staffNames: new Set() });
      const group = groups.get(key);
      const info = {
        questionCount: (set.questions || []).length,
        studentRows: (set.students || []).length,
        inferredCount: (set.questions || []).filter((q) => q.maxMarksInferred !== false).length,
        invalidMaxCount: (set.questions || []).filter((q) => !(Number(q.maxMarks) > 0)).length,
        invalidCoCount: (set.questions || []).filter((q) => !/^CO\d+$/i.test(clean(q.co))).length,
      };
      if (set.exam === "T1") group.t1 = info;
      if (set.exam === "T2") group.t2 = info;
      if (set.staffName) group.staffNames.add(set.staffName);
      for (const student of set.students || []) group.classes.add(classIdentity(student).replace("|", " · "));
    }

    const papers = [...groups.values()].map((group) => {
      const activity = activityMap.get(`${group.paperCodeKey}|${group.term}`);
      const required = new Set((activity?.components || []).map((component) => String(component.key || "").toUpperCase()));
      const activityReady = Boolean(activity) && ["SE", "AR", "IT"].every((key) => required.has(key));
      const testReady = (test) => Boolean(test && test.studentRows > 0 && test.invalidMaxCount === 0 && test.invalidCoCount === 0);
      const ready = Boolean(testReady(group.t1) && testReady(group.t2) && activityReady && (activity?.students || []).length > 0);
      return {
        paperCode: group.paperCode,
        term: group.term,
        staffNames: [...group.staffNames],
        classes: [...group.classes].slice(0, 6),
        t1: group.t1,
        t2: group.t2,
        activities: activity ? {
          componentCount: (activity.components || []).length,
          studentRows: (activity.students || []).length,
          inferredCount: (activity.components || []).filter((component) => component.maxMarksInferred !== false).length,
          componentKeys: (activity.components || []).map((component) => component.key),
        } : null,
        status: ready ? "READY" : "ISSUE",
      };
    }).sort((a, b) => a.paperCode.localeCompare(b.paperCode) || a.term.localeCompare(b.term));

    res.json({ ...record, papers });
  } catch (err) {
    res.status(500).json({ message: err.message || "Unable to open department CIA verification" });
  }
});

router.post("/admin/department-imports/:id/verify", async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ message: "Admin access only" });
  try {
    const record = await CIADepartmentImport.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Department CIA import not found" });

    let [questionSets, activitySets] = await Promise.all([
      CIAQuestionSet.find({ departmentKey: record.departmentKey, academicYear: record.academicYear, departmentImportVersion: record.version }),
      CIAActivitySet.find({ departmentKey: record.departmentKey, academicYear: record.academicYear, departmentImportVersion: record.version }),
    ]);
    if (!questionSets.length) questionSets = await CIAQuestionSet.find({ departmentKey: record.departmentKey, academicYear: record.academicYear });
    if (!activitySets.length) activitySets = await CIAActivitySet.find({ departmentKey: record.departmentKey, academicYear: record.academicYear });

    const summary = validateDepartmentData(
      questionSets.map((set) => set.toObject()),
      activitySets.map((set) => set.toObject())
    );
    const now = new Date();
    const verifiedBy = req.user.staff_id || "admin";
    const qOps = questionSets.map((set) => {
      const questions = (set.questions || []).map((q) => {
        const valid = /^CO\d+$/i.test(clean(q.co)) && Number(q.maxMarks) > 0 && Number(q.observedMax || 0) <= Number(q.maxMarks || 0);
        return { ...q.toObject(), maxMarksInferred: valid ? false : q.maxMarksInferred !== false };
      });
      const datasetReady = (set.students || []).length > 0 && questions.length > 0 && questions.every((q) => q.maxMarksInferred === false);
      return {
        updateOne: {
          filter: { _id: set._id },
          update: {
            $set: {
              questions,
              departmentVerified: datasetReady,
              departmentVerifiedBy: datasetReady ? verifiedBy : "",
              departmentVerifiedAt: datasetReady ? now : null,
              updatedAt: now,
            },
          },
        },
      };
    });
    const aOps = activitySets.map((set) => {
      const components = (set.components || []).map((component) => {
        const valid = Number(component.maxMarks) > 0 && Number(component.observedMax || 0) <= Number(component.maxMarks || 0);
        return {
          ...component.toObject(),
          maxMarksInferred: valid ? false : component.maxMarksInferred !== false,
          inferredMax: Number(component.maxMarks || component.inferredMax || 0),
        };
      });
      const componentKeys = new Set(components.filter((component) => component.maxMarksInferred === false).map((component) => String(component.key || "").toUpperCase()));
      const datasetReady = (set.students || []).length > 0 && ["SE", "AR", "IT"].every((key) => componentKeys.has(key));
      return {
        updateOne: {
          filter: { _id: set._id },
          update: {
            $set: {
              components,
              departmentVerified: datasetReady,
              departmentVerifiedBy: datasetReady ? verifiedBy : "",
              departmentVerifiedAt: datasetReady ? now : null,
              updatedAt: now,
            },
          },
        },
      };
    });
    await runBulkBatches(CIAQuestionSet, qOps, 20);
    await runBulkBatches(CIAActivitySet, aOps, 20);

    record.status = summary.criticalCount > 0 ? "VERIFIED_WITH_ISSUES" : "VERIFIED";
    record.verifiedBy = verifiedBy;
    record.verifiedAt = now;
    record.criticalCount = summary.criticalCount;
    record.warningCount = summary.warningCount;
    record.issues = summary.issues;
    record.history.push({
      action: "verified",
      by: verifiedBy,
      at: now,
      version: record.version,
      note: summary.criticalCount > 0
        ? `Department verification completed; ${summary.criticalCount} source issue(s) remain pending and were not unlocked.`
        : "Entire department CIA import verified in one action.",
    });
    await record.save();

    res.json({
      message: summary.criticalCount > 0
        ? `${departmentDisplayName(record.departmentName)} verified with ${summary.criticalCount} source issue(s) still pending. All valid CIA datasets are unlocked for staff; affected papers remain unavailable until corrected/re-imported.`
        : `${departmentDisplayName(record.departmentName)} verified for ${record.academicYear}. Staff can now verify T1, T2 and CIA Activities for their assigned classes.`,
      import: record,
    });
  } catch (err) {
    res.status(400).json({ message: err.message || "Department verification failed" });
  }
});

router.get("/admin/datasets", async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ message: "Admin access only" });
  const sets = await CIAQuestionSet.find({}).sort({ academicYear: -1, term: 1, paperCode: 1, exam: 1 });
  const activities = await CIAActivitySet.find({}).sort({ academicYear: -1, term: 1, paperCode: 1 });
  res.json({
    questionSets: sets.map((set) => ({
      _id: set._id,
      paperCode: set.paperCode,
      exam: set.exam,
      term: set.term,
      academicYear: set.academicYear,
      staffName: set.staffName,
      questionCount: set.questions.length,
      studentCount: set.students.length,
      inferredCount: set.questions.filter((q) => q.maxMarksInferred).length,
      updatedAt: set.updatedAt,
    })),
    activitySets: activities.map((set) => ({
      _id: set._id,
      paperCode: set.paperCode,
      term: set.term,
      academicYear: set.academicYear,
      staffName: set.staffName,
      components: set.components,
      studentCount: set.students.length,
      inferredCount: set.components.filter((component) => component.maxMarksInferred !== false).length,
      updatedAt: set.updatedAt,
    })),
  });
});

router.get("/admin/datasets/:id", async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ message: "Admin access only" });
  const set = await CIAQuestionSet.findById(req.params.id);
  if (!set) return res.status(404).json({ message: "Question dataset not found" });
  res.json(set);
});

router.patch("/admin/datasets/:id/questions", async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ message: "Admin access only" });
  try {
    const set = await CIAQuestionSet.findById(req.params.id);
    if (!set) return res.status(404).json({ message: "Question dataset not found" });
    if (!Array.isArray(req.body.questions)) return res.status(400).json({ message: "questions array required" });

    const updates = new Map(req.body.questions.map((q) => [String(q.key), q]));
    for (const question of set.questions) {
      const update = updates.get(question.key);
      if (!update) continue;
      const maxMarks = Number(update.maxMarks);
      if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
        return res.status(400).json({ message: `${question.key} maximum mark must be greater than 0` });
      }
      const co = clean(update.co || question.co).toUpperCase();
      if (!/^CO\d+$/.test(co)) {
        return res.status(400).json({ message: `${question.key} must be mapped to a valid CO such as CO1` });
      }
    }

    set.questions = set.questions.map((question) => {
      const update = updates.get(question.key);
      if (!update) return question;
      return {
        ...question.toObject(),
        co: clean(update.co || question.co).toUpperCase(),
        kLevel: clean(update.kLevel || question.kLevel).toUpperCase(),
        maxMarks: Number(update.maxMarks),
        maxMarksInferred: false,
      };
    });
    await set.save();
    res.json(set);
  } catch (err) {
    res.status(400).json({ message: err.message || "Could not update question mapping" });
  }
});

router.get("/admin/activity-datasets/:id", async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ message: "Admin access only" });
  const set = await CIAActivitySet.findById(req.params.id);
  if (!set) return res.status(404).json({ message: "CIA activity dataset not found" });
  res.json(set);
});

router.patch("/admin/activity-datasets/:id/components", async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ message: "Admin access only" });
  try {
    const set = await CIAActivitySet.findById(req.params.id);
    if (!set) return res.status(404).json({ message: "CIA activity dataset not found" });
    if (!Array.isArray(req.body.components)) return res.status(400).json({ message: "components array required" });

    const updates = new Map(req.body.components.map((component) => [String(component.key).toUpperCase(), component]));
    for (const component of set.components) {
      const update = updates.get(String(component.key).toUpperCase());
      if (!update) continue;
      const maxMarks = Number(update.maxMarks);
      if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
        return res.status(400).json({ message: `${component.label || component.key} maximum mark must be greater than 0` });
      }
      if (Number(component.observedMax || 0) > maxMarks) {
        return res.status(400).json({ message: `${component.label || component.key} maximum cannot be below the observed mark ${component.observedMax}` });
      }
    }

    set.components = set.components.map((component) => {
      const update = updates.get(String(component.key).toUpperCase());
      if (!update) return component;
      const maxMarks = Number(update.maxMarks);
      return {
        ...component.toObject(),
        maxMarks,
        inferredMax: maxMarks,
        maxMarksInferred: false,
      };
    });
    await set.save();
    res.json(set);
  } catch (err) {
    res.status(400).json({ message: err.message || "Could not update CIA activity maximums" });
  }
});

router.get("/:allocationId/test/:exam", async (req, res) => {
  const exam = clean(req.params.exam).toUpperCase();
  if (!["T1", "T2"].includes(exam)) return res.status(400).json({ message: "Exam must be T1 or T2" });

  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });
  const settings = await AttainmentSettings.findOne({ allocation: allocation._id });
  if (!settings) return res.status(400).json({ message: "Set thresholds before opening CIA question attainment" });

  const set = await findQuestionSet(allocation, exam);
  if (!set) {
    return res.status(404).json({
      message: `${exam} question-wise CIA data is not imported for ${allocation.paperCode}. Ask Admin to upload the CIA workbook.`,
    });
  }
  if ((set.scope?.sourceStudentCount || 0) > 0 && (set.students?.length || 0) === 0) {
    const section = set.scope?.section === "NIL" ? "NIL (Aided)" : (set.scope?.section || "selected");
    return res.status(404).json({
      message: `${exam} data exists for ${allocation.paperCode}, but no imported students match the selected ${section} class/section.`,
    });
  }
  const verification = await CIAVerification.findOne({ allocation: allocation._id, stage: exam });
  const summary = computeQuestionWiseSet(set, settings.thresholdMarksPercent, settings.targetPercent);

  res.json({
    source: {
      _id: set._id,
      paperCode: set.paperCode,
      exam: set.exam,
      term: set.term,
      academicYear: set.academicYear,
      staffName: set.staffName,
      importedAt: set.importedAt,
      updatedAt: set.updatedAt,
      sourceFileName: set.sourceFileName,
      departmentName: set.departmentName || "",
      departmentVerified: Boolean(set.departmentVerified),
      departmentVerifiedBy: set.departmentVerifiedBy || "",
      departmentVerifiedAt: set.departmentVerifiedAt || null,
      scope: set.scope || null,
    },
    scope: set.scope || null,
    questions: set.questions,
    students: set.students,
    summary,
    thresholdMarksPercent: settings.thresholdMarksPercent,
    targetPercent: settings.targetPercent,
    verified: isVerified(verification, set),
    verification,
  });
});

router.post("/:allocationId/test/:exam/verify", async (req, res) => {
  const exam = clean(req.params.exam).toUpperCase();
  if (!["T1", "T2"].includes(exam)) return res.status(400).json({ message: "Exam must be T1 or T2" });
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });
  if (req.user.isAdmin) return res.status(403).json({ message: "The allocated staff member must verify CIA data" });

  const settings = await AttainmentSettings.findOne({ allocation: allocation._id });
  const set = await findQuestionSet(allocation, exam);
  if (!set || !settings) return res.status(400).json({ message: "CIA source data and thresholds are required" });
  const summary = computeQuestionWiseSet(set, settings.thresholdMarksPercent, settings.targetPercent);
  if (!summary.questions.length || summary.questions.some((q) => q.maxMarks <= 0) || summary.invalidCount > 0) {
    return res.status(400).json({ message: "Resolve missing/invalid question maximums or marks before verification" });
  }
  if (summary.questions.some((q) => q.maxMarksInferred)) {
    const dept = set.departmentName ? departmentDisplayName(set.departmentName) : "the imported department";
    return res.status(400).json({ message: `Admin must verify ${dept} in CIA Data Import before staff can verify ${exam}.` });
  }
  if (summary.questions.some((q) => !/^CO\d+$/.test(String(q.co || "").toUpperCase()))) {
    return res.status(400).json({ message: "Every CIA question must have a valid CO mapping before verification" });
  }

  const verification = await CIAVerification.findOneAndUpdate(
    { allocation: allocation._id, stage: exam },
    {
      $set: {
        verifiedBy: req.user.staff_id,
        verifiedAt: new Date(),
        sourceUpdatedAt: set.updatedAt,
        sourceId: set._id,
        sourceScopeSignature: set.scope.signature,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.json({ message: `${exam} question-wise attainment verified`, verification });
});

router.get("/:allocationId/activities", async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });
  const settings = await AttainmentSettings.findOne({ allocation: allocation._id });
  if (!settings) return res.status(400).json({ message: "Set thresholds before opening CIA activities" });

  const set = await findActivitySet(allocation);
  if (!set) {
    return res.status(404).json({
      message: `CIA activity data is not imported for ${allocation.paperCode}. Ask Admin to upload the CIA workbook.`,
    });
  }
  if ((set.scope?.sourceStudentCount || 0) > 0 && (set.students?.length || 0) === 0) {
    const section = set.scope?.section === "NIL" ? "NIL (Aided)" : (set.scope?.section || "selected");
    return res.status(404).json({
      message: `CIA activity data exists for ${allocation.paperCode}, but no imported students match the selected ${section} class/section.`,
    });
  }
  const verification = await CIAVerification.findOne({ allocation: allocation._id, stage: "ACTIVITIES" });
  const summary = computeActivitySummary(set, settings.ciaComponents, settings.thresholdMarksPercent, settings.targetPercent);

  res.json({
    source: {
      _id: set._id,
      paperCode: set.paperCode,
      term: set.term,
      academicYear: set.academicYear,
      staffName: set.staffName,
      importedAt: set.importedAt,
      updatedAt: set.updatedAt,
      sourceFileName: set.sourceFileName,
      departmentName: set.departmentName || "",
      departmentVerified: Boolean(set.departmentVerified),
      departmentVerifiedBy: set.departmentVerifiedBy || "",
      departmentVerifiedAt: set.departmentVerifiedAt || null,
      scope: set.scope || null,
    },
    scope: set.scope || null,
    sourceComponents: set.components,
    students: set.students,
    summary,
    thresholdMarksPercent: settings.thresholdMarksPercent,
    targetPercent: settings.targetPercent,
    verified: isVerified(verification, set),
    verification,
  });
});

router.post("/:allocationId/activities/verify", async (req, res) => {
  const { allocation, error, status } = await assertOwnership(req, req.params.allocationId);
  if (error) return res.status(status).json({ message: error });
  if (req.user.isAdmin) return res.status(403).json({ message: "The allocated staff member must verify CIA data" });

  const settings = await AttainmentSettings.findOne({ allocation: allocation._id });
  const set = await findActivitySet(allocation);
  if (!set || !settings) return res.status(400).json({ message: "CIA activity source data and thresholds are required" });
  const summary = computeActivitySummary(set, settings.ciaComponents, settings.thresholdMarksPercent, settings.targetPercent);
  const requiredKeys = ["SE", "AR", "IT"];
  const unresolvedPrimary = (set.components || []).filter((component) =>
    requiredKeys.includes(String(component.key || "").toUpperCase()) && component.maxMarksInferred !== false
  );
  if (unresolvedPrimary.length) {
    const dept = set.departmentName ? departmentDisplayName(set.departmentName) : "the imported department";
    return res.status(400).json({ message: `Admin must verify ${dept} in CIA Data Import before staff can verify CIA Activities.` });
  }
  const bySource = new Map(summary.map((component) => [String(component.sourceKey || "").toUpperCase(), component]));
  const missing = requiredKeys.filter((key) => {
    const component = bySource.get(key);
    return !component || component.appeared <= 0 || component.maxMarks <= 0;
  });
  if (missing.length) {
    return res.status(400).json({
      message: `Seminar / Assignment / Innovative data must all be available before verification. Missing: ${missing.join(", ")}`,
    });
  }

  const verification = await CIAVerification.findOneAndUpdate(
    { allocation: allocation._id, stage: "ACTIVITIES" },
    {
      $set: {
        verifiedBy: req.user.staff_id,
        verifiedAt: new Date(),
        sourceUpdatedAt: set.updatedAt,
        sourceId: set._id,
        sourceScopeSignature: set.scope.signature,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.json({ message: "CIA activities verified", verification });
});

module.exports = router;
