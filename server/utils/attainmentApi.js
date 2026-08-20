const axios = require("axios");

const BASE = process.env.ATTAINMENT_API_BASE || "http://192.168.18.89/hepta/api/attainment_data.php";
const TIMEOUT = Number(process.env.ATTAINMENT_API_TIMEOUT || 30000);

function clean(value) {
  return String(value ?? "").trim();
}

function normaliseCourse(value) {
  return clean(value).replace(/\s+/g, " ");
}

function inferDegree(course = "") {
  const c = clean(course).toUpperCase();
  if (/^(M\.|MSC|MSc|M A|MA\b|MCOM|MCA|MBA|M\.SC|M\.A|M\.COM)/.test(c)) return "PG";
  return "UG";
}

function inferPaperType(code = "", title = "") {
  const text = `${code} ${title}`.toUpperCase();
  if (/LAB|PRACTICAL|PROJECT|INTERNSHIP|DISSERTATION|FIELD WORK/.test(text)) return "Practical";
  return "Theory";
}

function currentAcademicYear(date = new Date()) {
  // Indian colleges commonly begin the academic year around June/July.
  const start = date.getMonth() >= 5 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

function admissionYearFor(academicYear, studyYear) {
  const start = Number(String(academicYear).slice(0, 4));
  return start - Number(studyYear) + 1;
}

function admissionYearFromRoll(rollno, referenceYear = new Date().getFullYear()) {
  const roll = clean(rollno);
  const match = roll.match(/^(\d{2})/);
  if (!match) return null;
  const twoDigit = Number(match[1]);
  const century = Math.floor(referenceYear / 100) * 100;
  let full = century + twoDigit;
  if (full > referenceYear + 1) full -= 100;
  return full;
}

function rollMatchesBatch(rollno, admissionYear) {
  const inferred = admissionYearFromRoll(rollno, Number(admissionYear) + 6);
  return inferred === Number(admissionYear);
}

function rollMatchesAcademicYear(rollno, academicYear, studyYear) {
  const roll = clean(rollno);
  if (!/^\d{2}/.test(roll)) return true; // do not wrongly discard non-standard roll numbers
  const expected = String(admissionYearFor(academicYear, studyYear)).slice(-2);
  return roll.slice(0, 2) === expected;
}

async function request(params) {
  const response = await axios.get(BASE, {
    params,
    timeout: TIMEOUT,
    headers: { Accept: "application/json" },
    validateStatus: () => true,
  });
  if (response.status !== 200 || !response.data) {
    throw new Error(`Attainment API returned HTTP ${response.status}`);
  }
  if (response.data.success === false) {
    throw new Error(response.data.message || "Attainment API request failed");
  }
  return response.data;
}

async function fetchAllStudents() {
  const first = await request({ type: "students", page: 1, limit: 1000 });
  const totalPages = Number(first.pagination?.total_pages || 1);
  const rows = [...(first.data || [])];
  for (let page = 2; page <= totalPages; page += 1) {
    const result = await request({ type: "students", page, limit: 1000 });
    rows.push(...(result.data || []));
  }
  const unique = new Map();
  rows.forEach((row) => {
    const rollno = clean(row.rollno || row.ROLLNO || row.regno || row.REGNO);
    if (!rollno) return;
    unique.set(rollno, {
      rollno,
      name: clean(row.name || row.NAME),
      year: Number(row.year || row.YEAR || 0),
      course: normaliseCourse(row.course || row.COURSE),
      section: clean(row.section || row.SECTION || "NIL") || "NIL",
      dob: row.dob || row.DOB || "",
      rawPayload: row,
    });
  });
  return [...unique.values()];
}

function flattenRecords(value, output = []) {
  if (Array.isArray(value)) value.forEach((v) => flattenRecords(v, output));
  else if (value && typeof value === "object") {
    const hasPaper = value.PAPERCODE || value.paperCode || value.paper_code;
    if (hasPaper) output.push(value);
    Object.values(value).forEach((v) => {
      if (v && typeof v === "object") flattenRecords(v, output);
    });
  }
  return output;
}

function parseReport(payload) {
  const records = flattenRecords(payload);
  const ese = new Map();
  const cia = new Map();

  records.forEach((r) => {
    const paperCode = clean(r.PAPERCODE || r.paperCode || r.paper_code);
    if (!paperCode) return;
    const title = clean(r.TITLE || r.paper_title || r.paperTitle || r.title);
    const common = { paperCode, title, paperType: inferPaperType(paperCode, title) };

    const isCIA = r.T1 !== undefined || r.T2 !== undefined || String(r.cat || r.category || "").toUpperCase() === "CIA";
    const isESE = r.ESE !== undefined || r.GRADE !== undefined || r.EXAMNO !== undefined;

    if (isESE) {
      ese.set(paperCode, {
        ...common,
        obtained: Number(r.ESE ?? r.ese ?? r.TOTAL ?? r.total ?? 0),
        ciaTotal: Number(r.CIA ?? r.cia ?? 0),
        total: Number(r.TOTAL ?? r.total ?? 0),
        result: clean(r.RESULT || r.result),
        semester: Number(r.SEM || r.semester || 0) || null,
      });
    }
    if (isCIA) {
      const componentMarks = {};
      ["T1", "T2", "AR", "AT", "SE", "IT", "MCQ", "LIB"].forEach((key) => {
        if (r[key] !== undefined && r[key] !== null && r[key] !== "") {
          componentMarks[key] = Number(r[key]) || 0;
        }
      });
      cia.set(paperCode, {
        ...common,
        componentMarks,
        total: Number(r.TOTAL ?? r.total ?? 0),
        semesterLabel: clean(r.sem || r.semester),
        result: clean(r.RESULT || r.result),
      });
    }
  });

  return { ese: [...ese.values()], cia: [...cia.values()] };
}

async function fetchStudentReport(rollno) {
  try {
    const report = await request({ type: "report", rollno });
    const parsed = parseReport(report);
    if (parsed.ese.length || parsed.cia.length) return { ...parsed, rawPayload: report };
  } catch (_) {
    // Older API builds may not expose a combined report; use filtered endpoints below.
  }

  const [esePayload, ciaPayload] = await Promise.all([
    request({ type: "ese", rollno, examno: rollno, limit: 500 }),
    request({ type: "cia", rollno, regno: rollno, limit: 500 }),
  ]);
  const rawPayload = { ese: esePayload, cia: ciaPayload };
  return { ...parseReport(rawPayload), rawPayload };
}

module.exports = {
  clean,
  currentAcademicYear,
  inferDegree,
  inferPaperType,
  admissionYearFromRoll,
  rollMatchesBatch,
  rollMatchesAcademicYear,
  fetchAllStudents,
  fetchStudentReport,
};
