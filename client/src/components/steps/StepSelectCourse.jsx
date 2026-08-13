import React, { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";

export default function StepSelectCourse({ context, updateContext, onNext }) {
  const [academicYear, setAcademicYear] = useState(null);
  const [degree, setDegree] = useState(context.programme || "");
  const [admissionBatches, setAdmissionBatches] = useState([]);
  const [admissionBatchId, setAdmissionBatchId] = useState(context.admissionBatchId || "");
  const [programmes, setProgrammes] = useState([]);
  const [course, setCourse] = useState(context.course || "");
  const [semesters, setSemesters] = useState([]);
  const [semester, setSemester] = useState(context.allocation?.semester || "");
  const [classes, setClasses] = useState([]);
  const [classKey, setClassKey] = useState("");
  const [papers, setPapers] = useState([]);
  const [paperCode, setPaperCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingLabel, setLoadingLabel] = useState("Loading current academic year...");
  const [error, setError] = useState("");

  const selectedAdmissionBatch = admissionBatches.find((item) => item._id === admissionBatchId);
  const selectedClass = classes.find((item) => item.key === classKey);
  const selectedPaper = useMemo(() => papers.find((item) => item.paperCode === paperCode), [papers, paperCode]);

  useEffect(() => {
    setLoading(true);
    api.get("/manual-attainment/bootstrap")
      .then((res) => setAcademicYear(res.data.academicYear))
      .catch((err) => setError(err.response?.data?.message || "Unable to connect to the attainment API"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setAdmissionBatches([]);
    setAdmissionBatchId("");
    setProgrammes([]);
    setCourse("");
    setSemesters([]);
    setSemester("");
    setClasses([]);
    setClassKey("");
    setPapers([]);
    setPaperCode("");
    if (!degree) return;

    setLoadingLabel("Loading batches...");
    setLoading(true);
    setError("");
    api.get("/manual-attainment/admission-batches", { params: { degree } })
      .then((res) => setAdmissionBatches(res.data))
      .catch((err) => setError(err.response?.data?.message || "Failed to load batches"))
      .finally(() => setLoading(false));
  }, [degree]);

  useEffect(() => {
    setProgrammes([]);
    setCourse("");
    setSemesters([]);
    setSemester("");
    setClasses([]);
    setClassKey("");
    setPapers([]);
    setPaperCode("");
    if (!degree || !selectedAdmissionBatch) return;

    setLoadingLabel("Loading programmes for this batch...");
    setLoading(true);
    setError("");
    api.get("/manual-attainment/programmes", {
      params: { degree, admissionYear: selectedAdmissionBatch.admissionYear },
    })
      .then((res) => {
        setProgrammes(res.data);
        if (res.data.length === 1) setCourse(res.data[0]);
      })
      .catch((err) => setError(err.response?.data?.message || "Failed to load programmes"))
      .finally(() => setLoading(false));
  }, [degree, admissionBatchId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSemesters([]);
    setSemester("");
    setClasses([]);
    setClassKey("");
    setPapers([]);
    setPaperCode("");
    if (!degree || !course || !selectedAdmissionBatch) return;

    setLoadingLabel("Finding available semesters and class sections...");
    setLoading(true);
    setError("");
    Promise.all([
      api.get("/manual-attainment/semesters", {
        params: { degree, course, admissionYear: selectedAdmissionBatch.admissionYear },
      }),
      api.get("/manual-attainment/classes", {
        params: { degree, course, admissionYear: selectedAdmissionBatch.admissionYear },
      }),
    ])
      .then(([semesterRes, classRes]) => {
        setSemesters(semesterRes.data);
        setClasses(classRes.data);
        if (semesterRes.data.length === 1) setSemester(String(semesterRes.data[0]));
        if (classRes.data.length === 1) setClassKey(classRes.data[0].key);
      })
      .catch((err) => setError(err.response?.data?.message || "Failed to load semester/class information"))
      .finally(() => setLoading(false));
  }, [degree, course, admissionBatchId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPapers([]);
    setPaperCode("");
    if (!semester || !selectedClass || !selectedAdmissionBatch) return;

    setLoadingLabel(`Loading Semester ${semester} papers...`);
    setLoading(true);
    setError("");
    api.get("/manual-attainment/papers", {
      params: {
        degree,
        course,
        section: selectedClass.section,
        admissionYear: selectedAdmissionBatch.admissionYear,
        semester: Number(semester),
      },
    })
      .then((res) => {
        setPapers(res.data);
        if (res.data.length === 1) setPaperCode(res.data[0].paperCode);
      })
      .catch((err) => setError(err.response?.data?.message || "Failed to load semester papers"))
      .finally(() => setLoading(false));
  }, [semester, classKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleNext() {
    if (!academicYear || !degree || !selectedAdmissionBatch || !course || !semester || !selectedClass || !selectedPaper) {
      setError("Please complete the selection before continuing.");
      return;
    }

    setLoadingLabel("Importing students, ESE and CIA marks from ERP...");
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/manual-attainment/prepare", {
        degree,
        admissionBatchId: selectedAdmissionBatch._id,
        admissionYear: selectedAdmissionBatch.admissionYear,
        course,
        year: Number(selectedClass.studyYear),
        section: selectedClass.section,
        semester: Number(semester),
        paperCode: selectedPaper.paperCode,
        paperName: selectedPaper.paperName,
        paperType: selectedPaper.paperType,
      });

      const { batch, allocation, imported } = res.data;
      let resumeStep = 1;
      let completed = false;
      try {
        const progress = await api.get(`/attainment/${allocation._id}/progress`);
        const p = progress.data;
        completed = p.completed;
        if (!p.matrixLocked) resumeStep = 1;
        else if (!p.settingsSet) resumeStep = 2;
        else if (!p.studentsUploaded) resumeStep = 3;
        else if (!p.eseEntered) resumeStep = 4;
        else if (!p.ciaEntered) resumeStep = 5;
        else if (!p.computed) resumeStep = 6;
        else resumeStep = 7;
      } catch {
        resumeStep = 1;
      }

      updateContext({
        academicYear: academicYear._id,
        academicYearLabel: academicYear.year,
        admissionBatchId: selectedAdmissionBatch._id,
        admissionBatchLabel: selectedAdmissionBatch.label,
        admissionYear: selectedAdmissionBatch.admissionYear,
        programme: degree,
        course,
        studyYear: selectedClass.studyYear,
        semester: Number(semester),
        batch: batch._id,
        batchLabel: batch.displayName,
        allocation,
        completed,
        imported,
      });
      onNext(resumeStep);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to prepare attainment data");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="workflow-panel">
      <div className="section-heading-row">
        <div>
          <span className="section-kicker">STEP 01 · QUICK PAPER SELECTION</span>
          <h2>Select Batch, Semester & Paper</h2>
          <p>
            Choose the batch once, then select the semester. Only papers from that semester are shown, so there are fewer clicks and no manual academic-year selection.
          </p>
        </div>
        <span className="status-chip status-success">AY {academicYear?.year || "Loading..."}</span>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <Field label="Degree">
          <select value={degree} onChange={(e) => setDegree(e.target.value)} className="input-field">
            <option value="">-- Select UG / PG --</option>
            <option value="UG">UG</option>
            <option value="PG">PG</option>
          </select>
        </Field>

        <Field label="Admission Batch">
          <select
            value={admissionBatchId}
            onChange={(e) => setAdmissionBatchId(e.target.value)}
            disabled={!admissionBatches.length}
            className="input-field disabled:bg-gray-100"
          >
            <option value="">-- Select Batch --</option>
            {admissionBatches.map((item) => <option key={item._id} value={item._id}>{item.label}</option>)}
          </select>
        </Field>

        <Field label="Programme">
          <select
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            disabled={!programmes.length}
            className="input-field disabled:bg-gray-100"
          >
            <option value="">-- Select Programme --</option>
            {programmes.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </Field>
      </div>

      <div className="mt-5">
        <label className="block text-sm font-medium text-gray-700 mb-2">Semester</label>
        <div className="flex flex-wrap gap-2 min-h-[42px] items-center">
          {!course && <span className="text-sm text-gray-400">Select a programme to see semesters</span>}
          {course && !loading && semesters.length === 0 && <span className="text-sm text-gray-400">No semesters found</span>}
          {semesters.map((item) => {
            const active = Number(semester) === Number(item);
            return (
              <button
                key={item}
                type="button"
                onClick={() => setSemester(String(item))}
                className={`px-4 py-2 rounded-lg border text-sm font-semibold transition ${
                  active
                    ? "bg-brand text-white border-brand shadow-sm"
                    : "bg-white text-gray-700 border-gray-200 hover:border-brand hover:text-brand"
                }`}
              >
                Sem {item}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5 mt-5">
        <Field label="Class / Section">
          <select
            value={classKey}
            onChange={(e) => setClassKey(e.target.value)}
            disabled={!classes.length}
            className="input-field disabled:bg-gray-100"
          >
            <option value="">-- Select Class --</option>
            {classes.map((item) => (
              <option key={item.key} value={item.key}>{item.displayName} · {item.studentCount} students</option>
            ))}
          </select>
        </Field>

        <Field label={semester ? `Semester ${semester} Paper` : "Paper"}>
          <select
            value={paperCode}
            onChange={(e) => setPaperCode(e.target.value)}
            disabled={!semester || !selectedClass || !papers.length}
            className="input-field disabled:bg-gray-100"
          >
            <option value="">-- Select Paper --</option>
            {papers.map((item) => (
              <option key={item.paperCode} value={item.paperCode}>
                {item.paperCode} · {item.paperName} · {item.paperType}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {selectedPaper && (
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <strong className="text-gray-900">{selectedPaper.paperCode}</strong>
          <span className="text-gray-700">{selectedPaper.paperName}</span>
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-white border border-blue-100 text-brand">{selectedPaper.paperType}</span>
          <span className="text-xs text-gray-500">Semester {semester}</span>
        </div>
      )}

      {loading && (
        <div className="mt-5 flex items-center gap-2 text-sm text-gray-600">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          {loadingLabel}
        </div>
      )}
      {error && <p className="alert-error mt-5">{error}</p>}
      {!loading && semester && selectedClass && papers.length === 0 && (
        <p className="alert-error mt-5">No Semester {semester} paper records were found for this class.</p>
      )}

      <div className="workflow-actions">
        <span className="text-xs text-gray-400 hidden sm:block">Academic year is handled automatically.</span>
        <button onClick={handleNext} disabled={loading || !paperCode} className="btn btn-primary">
          Prepare Attainment →
        </button>
      </div>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
