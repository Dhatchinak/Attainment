const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const Allocation = require("../models/Allocation");
const AcademicYear = require("../models/AcademicYear");
const AttainmentSettings = require("../models/AttainmentSettings");
const CIAQuestionSet = require("../models/CIAQuestionSet");
const CIAActivitySet = require("../models/CIAActivitySet");
const CIAVerification = require("../models/CIAVerification");
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

  let stage = "reading workbook";
  try {
    // The supplied workbook is ~4.3 MB. Multer already accepts up to 20 MB,
    // so a valid workbook should reach this point unless an upstream proxy
    // rejects the request before Express receives it.
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });

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

        const questions = questionKeys.map((questionKey, index) => {
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
        });

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
            filter: { paperCodeKey: paperKey, exam, term, academicYear },
            update: {
              $set: {
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
            filter: { paperCodeKey: paperKey, term, academicYear: meta.academicYear || "" },
            update: {
              $set: {
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

    // Make every academic year found in the workbook available in the staff
    // dashboard. Historical CIA imports must not be hidden by the current year.
    stage = "registering academic years";
    if (detectedAcademicYears.size) {
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
    }

    // The previous importer issued one MongoDB request per dataset (160+ requests
    // for the supplied workbook). On hosted deployments that can exceed reverse-
    // proxy/request timeouts. Batched bulk writes reduce that to a handful of DB calls.
    stage = "saving T1/T2 question datasets to MongoDB";
    await runBulkBatches(CIAQuestionSet, questionOps, 15);

    stage = "saving CIA activity datasets to MongoDB";
    await runBulkBatches(CIAActivitySet, activityOps, 15);

    return res.json({
      message: "Question-wise CIA workbook imported to MongoDB",
      sourceFileName: req.file.originalname,
      sourceFileBytes: req.file.size,
      terms: detectedTerms,
      academicYears: [...detectedAcademicYears].sort(),
      questionSetsImported: questionOps.length,
      questionRowsImported,
      activitySetsImported: activityOps.length,
      activityRowsImported,
      note: "Question maximum marks are inferred from the source data. Admin can review/override them before staff verification.",
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
        ? "Check old CIAQuestionSet/CIAActivitySet indexes in MongoDB and remove obsolete duplicate indexes before retrying."
        : mongoUnavailable
          ? "MongoDB could not be reached. Check MONGO_URI / Atlas network access and retry."
          : "The workbook format was accepted up to this stage; use the stage and error text to identify the failing step.",
    });
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
    return res.status(400).json({ message: "Admin must confirm the inferred question maximum marks before staff verification" });
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
    return res.status(400).json({ message: "Admin must confirm Seminar / Assignment / Innovative maximum marks before staff verification" });
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
