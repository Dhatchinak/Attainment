export {};
const ExcelJS = require("exceljs");
const CIADepartmentImport = require("../models/CIADepartmentImport");
const CIAQuestionSet = require("../models/CIAQuestionSet");
const CIAActivitySet = require("../models/CIAActivitySet");
const CIAWorkbookImport = require("../models/CIAWorkbookImport");

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
const PARTII_HEADERS = ["PAPERCODE", "ROLLNO", "NAME", "REGNO", "T1", "T2", "SE", "AR", "AT", "IT", "COMP", "TOTAL", "RESULT", "course", "cbatch", "department"];
const MAX_BUCKETS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 100];

function valueOf(value) {
  if (value && typeof value === "object") {
    if (value.result !== undefined) return value.result;
    if (value.text !== undefined) return value.text;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
  }
  return value;
}

function clean(value) {
  const text = String(valueOf(value) ?? "").trim();
  if (!text || text.toUpperCase() === "NULL") return "";
  return text;
}

function num(value) {
  const text = clean(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function paperKey(value) {
  return clean(value).toUpperCase().replace(/\s+/g, "");
}

function departmentKey(value) {
  return clean(value)
    .replace(/^department\s+of\s+/i, "")
    .replace(/\b(?:dept|department)\.?$/i, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function departmentName(value) {
  const text = clean(value).replace(/^department\s+of\s+/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!text) return "Unassigned Source";
  return text.split(" ").map((word) => word.length <= 3 && /^[A-Z0-9]+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
}

function normalCourse(value) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function inferMax(value) {
  const mark = Number(value) || 0;
  if (mark <= 0) return 0;
  if (Number.isInteger(mark) && MAX_BUCKETS.includes(mark)) return mark;
  return MAX_BUCKETS.find((candidate) => candidate >= mark) || Math.ceil(mark);
}

function inferActivityMax(key, value) {
  const mark = Number(value) || 0;
  if (mark <= 0) return 0;
  const buckets = ["SE", "AR", "IT"].includes(key)
    ? [5, 10, 20, 25, 30, 40, 50]
    : key === "AT" ? [5, 10, 20] : key === "LIB" ? [1, 2, 3, 5, 10, 20] : MAX_BUCKETS;
  return buckets.find((candidate) => candidate >= mark) || Math.ceil(mark);
}

function rowObject(headers, values) {
  const row = {};
  headers.forEach((header, index) => { if (header) row[header] = valueOf(values[index]); });
  return row;
}

function headerValue(row, ...wanted) {
  const entries = Object.entries(row);
  for (const name of wanted) {
    const match = entries.find(([key]) => key.toUpperCase() === name.toUpperCase());
    if (match) return match[1];
  }
  return "";
}

function sourceSnapshot(student) {
  return { marks: student.marks, total: student.total, totalMismatch: student.totalMismatch };
}

function addStudent(group, student) {
  group.sourceRowCount += 1;
  if (student.totalMismatch) group.totalMismatchCount += 1;
  const existing = group.students.get(student.regNo);
  if (!existing) {
    group.students.set(student.regNo, student);
    return;
  }
  group.duplicateRowCount += 1;
  existing.duplicateCount = Number(existing.duplicateCount || 0) + 1;
  const conflict = JSON.stringify(sourceSnapshot(existing)) !== JSON.stringify(sourceSnapshot(student));
  existing.duplicateConflict = existing.duplicateConflict || conflict;
  if (!existing.duplicateSourceRows.length) existing.duplicateSourceRows.push(sourceSnapshot(existing));
  existing.duplicateSourceRows.push(sourceSnapshot(student));
  if (Object.keys(student.marks || {}).length > Object.keys(existing.marks || {}).length) {
    existing.marks = student.marks;
    existing.total = student.total;
    existing.totalMismatch = student.totalMismatch;
  }
}

async function streamWorkbook(filePath, onWorksheet) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: "emit",
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    worksheets: "emit",
  });
  for await (const worksheet of reader) await onWorksheet(worksheet);
}

async function saveInBatches(Model, operations, size = 15) {
  for (let index = 0; index < operations.length; index += size) {
    await Model.bulkWrite(operations.slice(index, index + size), { ordered: false });
  }
}

async function updateProgress(importId, currentSheet, stage) {
  const record = await CIAWorkbookImport.findByIdAndUpdate(importId, {
    $inc: { "progress.processed": 1 },
    $set: { "progress.currentSheet": currentSheet, "progress.stage": stage },
  }, { new: true }).lean();
  const processed = Number(record?.progress?.processed || 0);
  const total = Math.max(1, Number(record?.progress?.total || 16));
  await CIAWorkbookImport.findByIdAndUpdate(importId, { $set: { "progress.percent": Math.min(95, Math.round((processed / total) * 95)) } });
}

async function processCollegeCIAWorkbook({ filePath, workbookImport, academicYear, sourceFileName }) {
  const importId = workbookImport._id;
  const issues = [];
  const terms = new Set();
  const sheetNames = new Set();
  const departmentMap = new Map();
  const versionMap = new Map();
  const exactStudentMeta = new Map();
  const rollMeta = new Map();
  const courseDepartmentCounts = new Map();
  const activityGroups = new Map();
  const importedDepartmentKeys = new Set();
  const uniqueStudents = new Set();

  const addIssue = (severity, code, message, sheet = "", count = 0) => {
    if (issues.length < 250) issues.push({ severity, code, message, sheet, count });
  };
  const rememberDepartment = (name) => {
    const canonical = departmentName(name);
    const key = departmentKey(canonical) || "UNASSIGNED";
    departmentMap.set(key, canonical);
    importedDepartmentKeys.add(key);
    return { key, name: canonical };
  };
  const versionFor = async (key) => {
    if (versionMap.has(key)) return versionMap.get(key);
    const current = await CIADepartmentImport.findOne({ departmentKey: key, academicYear }).select("version").lean();
    const version = Number(current?.version || 0) + 1;
    versionMap.set(key, version);
    return version;
  };

  // Pass 1: the authoritative MAJOR/PARTII sheets provide department, course,
  // section and regular CIA components for every paper/student.
  await streamWorkbook(filePath, async (worksheet) => {
    const rawName = worksheet.name;
    const name = rawName.trim().toUpperCase();
    if (!/^(MAJOR|PARTII)_(ODD|EVEN)$/.test(name)) return;
    sheetNames.add(rawName);
    const term = name.endsWith("ODD") ? "ODD" : "EVEN";
    terms.add(term);
    let headers = null;
    for await (const excelRow of worksheet) {
      const values = excelRow.values.slice(1).map(valueOf);
      if (!headers) {
        if (clean(values[0]).toUpperCase() === "PAPERCODE") { headers = values.map(clean); continue; }
        if (name.startsWith("PARTII_")) {
          headers = PARTII_HEADERS;
          addIssue("warning", "HEADERLESS_SHEET", `${rawName} has no header row; the official PARTII column order was applied.`, rawName, 1);
        } else {
          addIssue("critical", "INVALID_HEADER", `${rawName} does not contain a PAPERCODE header.`, rawName, 1);
          return;
        }
      }
      const row = rowObject(headers, values);
      const paperCode = clean(headerValue(row, "PAPERCODE"));
      const regNo = clean(headerValue(row, "REGNO", "ROLLNO")).toUpperCase();
      if (!paperCode || !regNo) continue;
      const dept = rememberDepartment(headerValue(row, "department"));
      const course = clean(headerValue(row, "course"));
      const section = clean(headerValue(row, "cbatch", "section")) || "NIL";
      uniqueStudents.add(regNo);
      exactStudentMeta.set(`${term}|${paperKey(paperCode)}|${regNo}`, { ...dept, course, section });
      if (!rollMeta.has(`${term}|${regNo}`)) rollMeta.set(`${term}|${regNo}`, { ...dept, course, section });
      const courseKey = `${term}|${normalCourse(course)}`;
      if (!courseDepartmentCounts.has(courseKey)) courseDepartmentCounts.set(courseKey, new Map());
      const deptCounts = courseDepartmentCounts.get(courseKey);
      deptCounts.set(dept.key, Number(deptCounts.get(dept.key) || 0) + 1);

      const groupKey = `${dept.key}|${term}|${paperKey(paperCode)}`;
      if (!activityGroups.has(groupKey)) activityGroups.set(groupKey, {
        departmentKey: dept.key, departmentName: dept.name, term, paperCode, paperCodeKey: paperKey(paperCode),
        sourceSheets: new Set(), students: new Map(), sourceRowCount: 0, duplicateRowCount: 0, totalMismatchCount: 0,
      });
      const group = activityGroups.get(groupKey);
      group.sourceSheets.add(rawName);
      const marks = {};
      ACTIVITY_KEYS.forEach((key) => { const value = num(headerValue(row, key)); if (value !== null) marks[key] = value; });
      const total = num(headerValue(row, "TOTAL"));
      const calculated = ["T1", "T2", ...ACTIVITY_KEYS].reduce((sum, key) => sum + (num(headerValue(row, key)) || 0), 0);
      addStudent(group, {
        regNo, name: clean(headerValue(row, "NAME")), course, section,
        result: clean(headerValue(row, "RESULT")), marks, total,
        totalMismatch: total !== null && Math.abs(total - calculated) > 0.51,
        duplicateCount: 0, duplicateConflict: false, duplicateSourceRows: [],
      });
    }
    await updateProgress(importId, rawName, "Reading college CIA totals and activities");
  });

  const courseDepartment = new Map();
  for (const [key, counts] of courseDepartmentCounts) {
    courseDepartment.set(key, [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "");
  }

  const activityOps = [];
  const allPaperKeys = new Set();
  for (const group of activityGroups.values()) {
    const students = [...group.students.values()];
    const components = ACTIVITY_KEYS.map((key) => {
      const observedMax = students.reduce((max, student) => Math.max(max, Number(student.marks?.[key] || 0)), 0);
      const maxMarks = inferActivityMax(key, observedMax);
      return { key, label: ACTIVITY_LABELS[key], inferredMax: maxMarks, maxMarks, maxMarksInferred: true, observedMax };
    }).filter((component) => component.observedMax > 0);
    const version = await versionFor(group.departmentKey);
    allPaperKeys.add(group.paperCodeKey);
    activityOps.push({ updateOne: {
      filter: { departmentKey: group.departmentKey, paperCodeKey: group.paperCodeKey, term: group.term, academicYear },
      update: { $set: {
        departmentName: group.departmentName, departmentKey: group.departmentKey, departmentImportVersion: version,
        departmentVerified: false, departmentVerifiedBy: "", departmentVerifiedAt: null,
        paperCode: group.paperCode, paperCodeKey: group.paperCodeKey, term: group.term, academicYear,
        sourceFileName, sourceSheet: [...group.sourceSheets].join(", "), sourceSheets: [...group.sourceSheets],
        sourceRowCount: group.sourceRowCount, duplicateRowCount: group.duplicateRowCount,
        totalMismatchCount: group.totalMismatchCount, workbookImport: importId,
        components, students, importedAt: new Date(),
      } }, upsert: true,
    } });
  }
  const activitySetCount = activityOps.length;
  const activityRowCount = activityOps.reduce((sum, op) => sum + Number(op.updateOne.update.$set.sourceRowCount || 0), 0);
  const activityDuplicateCount = activityOps.reduce((sum, op) => sum + Number(op.updateOne.update.$set.duplicateRowCount || 0), 0);
  const activityMismatchCount = activityOps.reduce((sum, op) => sum + Number(op.updateOne.update.$set.totalMismatchCount || 0), 0);
  await saveInBatches(CIAActivitySet, activityOps, 12);
  activityGroups.clear();
  activityOps.length = 0;

  const mappingByDataset = new Map();
  const mappingSheetUsable = new Map();
  let questionSetCount = 0;
  let questionRowCount = 0;
  let duplicateCount = activityDuplicateCount;
  let totalMismatchCount = activityMismatchCount;
  let unresolvedRows = 0;
  let mappingMissing = 0;

  function resolveStudent(term, paperCode, regNo, course) {
    const exact = exactStudentMeta.get(`${term}|${paperKey(paperCode)}|${regNo}`);
    if (exact) return exact;
    const roll = rollMeta.get(`${term}|${regNo}`);
    if (roll) return { ...roll, course: clean(course) || roll.course };
    const key = courseDepartment.get(`${term}|${normalCourse(course)}`);
    if (key) return { key, name: departmentMap.get(key) || key, course: clean(course), section: "" };
    return { key: "UNASSIGNED", name: "Unassigned Source", course: clean(course), section: "" };
  }

  function sourceType(name) {
    if (name.includes("_ACT_")) return "ACT";
    if (name.includes("_MBA_")) return "MBA";
    return "TEST";
  }

  // Pass 2: question mapping sheets are immediately followed by their mark
  // sheets. Each mark sheet is grouped, saved, and released before continuing.
  await streamWorkbook(filePath, async (worksheet) => {
    const rawName = worksheet.name;
    const name = rawName.trim().toUpperCase();
    const term = name.includes("ODD2526") ? "ODD" : name.includes("EVEN2526") ? "EVEN" : "";
    const isMapping = name.startsWith("CIAOBE_LEVEL_");
    const isMarks = name.startsWith("CIAOBE_QUES_");
    if (!term || (!isMapping && !isMarks)) return;
    sheetNames.add(rawName);
    terms.add(term);
    const type = sourceType(`_${name}_`);
    let headers = null;
    let usableMapping = false;
    const questionGroups = new Map();
    let invalidExamRows = 0;

    for await (const excelRow of worksheet) {
      const values = excelRow.values.slice(1).map(valueOf);
      if (!headers) {
        if (!values.some((value) => clean(value))) continue;
        headers = values.map(clean);
        const headerKeys = new Set(headers.map((header) => header.toUpperCase()));
        if (isMapping) {
          const firstMappingKey = type === "ACT" ? "Q1AC" : "Q1C";
          const firstKnowledgeKey = type === "ACT" ? "Q1AK" : "Q1K";
          usableMapping = headerKeys.has("PAPERCODE") && headerKeys.has(firstMappingKey) && headerKeys.has(firstKnowledgeKey);
          mappingSheetUsable.set(`${type}|${term}`, usableMapping);
          if (!usableMapping) addIssue("critical", "INCOMPLETE_MAPPING_EXPORT", `${rawName} does not contain a usable PAPERCODE plus complete question-to-CO mapping layout. Marks will be preserved and flagged for mapping review.`, rawName, 1);
        }
        continue;
      }
      const row = rowObject(headers, values);
      if (isMapping) {
        if (!usableMapping) continue;
        const paperCode = clean(headerValue(row, "PAPERCODE"));
        const exam = clean(headerValue(row, "exam")).toUpperCase();
        if (!paperCode || !["T1", "T2"].includes(exam)) continue;
        const mappings = {};
        headers.filter((header) => /^Q\d+(?:[abc])?C$/i.test(header)).forEach((coHeader) => {
          const question = coHeader.slice(0, -1);
          mappings[question] = { co: clean(headerValue(row, coHeader)).toUpperCase(), kLevel: clean(headerValue(row, `${question}K`)).toUpperCase() };
        });
        const key = `${type}|${term}|${paperKey(paperCode)}|${exam}`;
        if (mappingByDataset.has(key) && JSON.stringify(mappingByDataset.get(key).mappings) !== JSON.stringify(mappings)) {
          addIssue("warning", "CONFLICTING_MAPPING", `${paperCode} ${exam} contains more than one question mapping; the latest source row was retained for Admin review.`, rawName, 1);
        }
        mappingByDataset.set(key, { mappings, staffName: clean(headerValue(row, "staffname")), sourceSheet: rawName });
        continue;
      }

      const paperCode = clean(headerValue(row, "papercode", "PAPERCODE"));
      const regNo = clean(headerValue(row, "rollno", "REGNO")).toUpperCase();
      const exam = clean(headerValue(row, "exam")).toUpperCase();
      if (!paperCode || !regNo) continue;
      if (!["T1", "T2"].includes(exam)) { invalidExamRows += 1; continue; }
      const course = clean(headerValue(row, "course"));
      const meta = resolveStudent(term, paperCode, regNo, course);
      if (meta.key === "UNASSIGNED") unresolvedRows += 1;
      rememberDepartment(meta.name);
      const groupKey = `${meta.key}|${term}|${paperKey(paperCode)}|${exam}`;
      if (!questionGroups.has(groupKey)) questionGroups.set(groupKey, {
        departmentKey: meta.key, departmentName: meta.name, term, paperCode, paperCodeKey: paperKey(paperCode), exam,
        type, questionKeys: headers.filter((header) => /^Q\d+(?:[abc])?$/i.test(header)),
        sourceSheets: new Set([rawName]), students: new Map(), sourceRowCount: 0, duplicateRowCount: 0, totalMismatchCount: 0,
      });
      const group = questionGroups.get(groupKey);
      const marks = {};
      group.questionKeys.forEach((key) => { const value = num(headerValue(row, key)); if (value !== null) marks[key] = value; });
      const total = num(headerValue(row, "total"));
      const calculated = (Object.values(marks) as any[]).reduce((sum, value) => sum + Number(value || 0), 0);
      addStudent(group, {
        regNo, name: clean(headerValue(row, "name")), course: course || meta.course,
        section: clean(headerValue(row, "section")) || meta.section, marks, total,
        totalMismatch: total !== null && Math.abs(total - calculated) > 0.11,
        duplicateCount: 0, duplicateConflict: false, duplicateSourceRows: [],
      });
      uniqueStudents.add(regNo);
    }

    if (isMarks) {
      if (invalidExamRows) addIssue("warning", "INVALID_EXAM_ROWS", `${rawName} contains ${invalidExamRows} row(s) outside T1/T2; they were preserved in the workbook audit but excluded from T1/T2 attainment.`, rawName, invalidExamRows);
      const questionOps = [];
      for (const group of questionGroups.values()) {
        const students = [...group.students.values()];
        const mapping = mappingByDataset.get(`${group.type}|${group.term}|${group.paperCodeKey}|${group.exam}`);
        const questions = group.questionKeys.map((key, index) => {
          const observedMax = students.reduce((max, student) => Math.max(max, Number(student.marks?.[key] || 0)), 0);
          const mapped = mapping?.mappings?.[key] || {};
          return {
            key, co: clean(mapped.co).toUpperCase(), kLevel: clean(mapped.kLevel).toUpperCase(),
            maxMarks: inferMax(observedMax), maxMarksInferred: true, observedMax,
            maxMarksInferenceSource: observedMax > 0 ? "observed source maximum" : "", order: index + 1,
          };
        });
        const validMappings = questions.filter((question) => /^CO\d+$/i.test(question.co)).length;
        const mappingStatus = validMappings === questions.length && questions.length ? "COMPLETE" : validMappings ? "PARTIAL" : "MISSING";
        if (mappingStatus !== "COMPLETE") mappingMissing += 1;
        const version = await versionFor(group.departmentKey);
        allPaperKeys.add(group.paperCodeKey);
        questionOps.push({ updateOne: {
          filter: { departmentKey: group.departmentKey, paperCodeKey: group.paperCodeKey, exam: group.exam, term: group.term, academicYear },
          update: { $set: {
            departmentName: group.departmentName, departmentKey: group.departmentKey, departmentImportVersion: version,
            departmentVerified: false, departmentVerifiedBy: "", departmentVerifiedAt: null,
            paperCode: group.paperCode, paperCodeKey: group.paperCodeKey, exam: group.exam, term: group.term,
            academicYear, academicYearSource: academicYear, staffName: mapping?.staffName || "",
            sourceFileName, sourceSheet: rawName, sourceSheets: [...group.sourceSheets],
            sourceRowCount: group.sourceRowCount, duplicateRowCount: group.duplicateRowCount,
            totalMismatchCount: group.totalMismatchCount,
            unresolvedStudentCount: group.departmentKey === "UNASSIGNED" ? students.length : 0,
            mappingStatus, mappingSource: mapping?.sourceSheet || "Mapping not available in source export",
            workbookImport: importId, questions, students, importedAt: new Date(),
          } }, upsert: true,
        } });
        questionSetCount += 1;
        questionRowCount += group.sourceRowCount;
        duplicateCount += group.duplicateRowCount;
        totalMismatchCount += group.totalMismatchCount;
      }
      await saveInBatches(CIAQuestionSet, questionOps, 12);
      questionGroups.clear();
    }
    await updateProgress(importId, rawName, isMapping ? "Reading question-to-CO mappings" : "Saving question-wise T1/T2 marks");
  });

  if (!terms.size) addIssue("critical", "NO_TERMS", "No supported ODD or EVEN CIA sheets were detected.", "", 1);
  if (!questionSetCount) addIssue("critical", "NO_QUESTION_DATA", "No T1/T2 question rows were imported.", "", 1);
  if (!activitySetCount) addIssue("critical", "NO_ACTIVITY_DATA", "No MAJOR/PARTII CIA activity rows were imported.", "", 1);
  if (unresolvedRows) addIssue("warning", "UNRESOLVED_DEPARTMENT", `${unresolvedRows} question row(s) could not be matched to a department and are retained under Unassigned Source.`, "", unresolvedRows);
  if (mappingMissing) addIssue("warning", "MAPPING_REVIEW_REQUIRED", `${mappingMissing} T1/T2 dataset(s) contain missing or partial CO mappings. Their marks are saved but they remain unavailable for calculation until mapping is corrected.`, "", mappingMissing);
  if (duplicateCount) addIssue("warning", "DUPLICATE_SOURCE_ROWS", `${duplicateCount} duplicate source row(s) were retained in the audit fields and de-duplicated for calculation.`, "", duplicateCount);
  if (totalMismatchCount) addIssue("info", "SOURCE_TOTAL_DIFFERENCE", `${totalMismatchCount} row(s) have a supplied total different from the simple sum of visible question/component cells. The supplied total is preserved unchanged.`, "", totalMismatchCount);

  const departments = [...versionMap.entries()].map(([key, version]) => ({ key, name: departmentMap.get(key) || key, version }));
  return {
    departments,
    terms: [...terms].sort(),
    sheets: [...sheetNames],
    issues,
    counts: {
      departments: departments.filter((item) => item.key !== "UNASSIGNED").length,
      papers: allPaperKeys.size,
      students: uniqueStudents.size,
      questionSets: questionSetCount,
      questionRows: questionRowCount,
      activitySets: activitySetCount,
      activityRows: activityRowCount,
      duplicates: duplicateCount,
      totalMismatches: totalMismatchCount,
      unresolvedRows,
      mappingMissing,
    },
  };
}

module.exports = { processCollegeCIAWorkbook };
