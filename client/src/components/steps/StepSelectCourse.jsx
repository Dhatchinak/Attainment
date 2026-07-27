import React, { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";

export default function StepSelectCourse({ context, updateContext, onNext }) {
  const [academicYear, setAcademicYear] = useState(null);
  const [degree, setDegree] = useState(context.programme || "");
  const [admissionBatches, setAdmissionBatches] = useState([]);
  const [admissionBatchId, setAdmissionBatchId] = useState(context.admissionBatchId || "");
  const [programmes, setProgrammes] = useState([]);
  const [course, setCourse] = useState(context.course || "");
  const [years, setYears] = useState([]);
  const [studyYear, setStudyYear] = useState(context.studyYear || "");
  const [classes, setClasses] = useState([]);
  const [classKey, setClassKey] = useState("");
  const [papers, setPapers] = useState([]);
  const [paperType, setPaperType] = useState("");
  const [paperCode, setPaperCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingLabel, setLoadingLabel] = useState("Loading current academic year...");
  const [error, setError] = useState("");

  const selectedAdmissionBatch = admissionBatches.find((item) => item._id === admissionBatchId);
  const selectedClass = classes.find((item) => item.key === classKey);
  const filteredPapers = useMemo(() => papers.filter((paper) => !paperType || paper.paperType === paperType), [papers, paperType]);
  const paperTypes = useMemo(() => [...new Set(papers.map((paper) => paper.paperType).filter(Boolean))].sort(), [papers]);

  useEffect(() => {
    setLoading(true);
    api.get("/manual-attainment/bootstrap")
      .then((res) => setAcademicYear(res.data.academicYear))
      .catch((err) => setError(err.response?.data?.message || "Unable to connect to the attainment API"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setAdmissionBatches([]); setAdmissionBatchId(""); setProgrammes([]); setCourse(""); setYears([]); setStudyYear(""); setClasses([]); setClassKey(""); setPapers([]); setPaperType(""); setPaperCode("");
    if (!degree) return;
    setLoadingLabel("Loading batches..."); setLoading(true); setError("");
    api.get("/manual-attainment/admission-batches", { params: { degree } })
      .then((res) => setAdmissionBatches(res.data))
      .catch((err) => setError(err.response?.data?.message || "Failed to load batches"))
      .finally(() => setLoading(false));
  }, [degree]);

  useEffect(() => {
    setProgrammes([]); setCourse(""); setYears([]); setStudyYear(""); setClasses([]); setClassKey(""); setPapers([]); setPaperType(""); setPaperCode("");
    if (!degree || !selectedAdmissionBatch) return;
    setLoadingLabel("Loading programmes for the selected batch..."); setLoading(true); setError("");
    api.get("/manual-attainment/programmes", { params: { degree, admissionYear: selectedAdmissionBatch.admissionYear } })
      .then((res) => setProgrammes(res.data))
      .catch((err) => setError(err.response?.data?.message || "Failed to load programmes"))
      .finally(() => setLoading(false));
  }, [degree, admissionBatchId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setYears([]); setStudyYear(""); setClasses([]); setClassKey(""); setPapers([]); setPaperType(""); setPaperCode("");
    if (!degree || !course || !selectedAdmissionBatch) return;
    setLoadingLabel("Loading available years..."); setLoading(true); setError("");
    api.get("/manual-attainment/years", { params: { degree, course, admissionYear: selectedAdmissionBatch.admissionYear } })
      .then((res) => setYears(res.data))
      .catch((err) => setError(err.response?.data?.message || "Failed to load course years"))
      .finally(() => setLoading(false));
  }, [degree, course, admissionBatchId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setClasses([]); setClassKey(""); setPapers([]); setPaperType(""); setPaperCode("");
    if (!degree || !course || !studyYear || !selectedAdmissionBatch) return;
    setLoadingLabel("Loading classes..."); setLoading(true); setError("");
    api.get("/manual-attainment/classes", { params: { degree, course, year: studyYear, admissionYear: selectedAdmissionBatch.admissionYear } })
      .then((res) => setClasses(res.data))
      .catch((err) => setError(err.response?.data?.message || "Failed to load classes"))
      .finally(() => setLoading(false));
  }, [degree, course, studyYear, admissionBatchId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPapers([]); setPaperType(""); setPaperCode("");
    if (!selectedClass || !selectedAdmissionBatch) return;
    setLoadingLabel("Finding papers written by this class..."); setLoading(true); setError("");
    api.get("/manual-attainment/papers", { params: { course, year: studyYear, section: selectedClass.section, admissionYear: selectedAdmissionBatch.admissionYear } })
      .then((res) => setPapers(res.data))
      .catch((err) => setError(err.response?.data?.message || "Failed to load paper codes"))
      .finally(() => setLoading(false));
  }, [classKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleNext() {
    const paper = papers.find((item) => item.paperCode === paperCode);
    if (!academicYear || !degree || !selectedAdmissionBatch || !course || !studyYear || !selectedClass || !paperType || !paper) {
      setError("Please complete every selection, including Batch.");
      return;
    }

    setLoadingLabel("Importing selected batch students, ESE and CIA marks..."); setLoading(true); setError("");
    try {
      const res = await api.post("/manual-attainment/prepare", {
        degree,
        admissionBatchId: selectedAdmissionBatch._id,
        admissionYear: selectedAdmissionBatch.admissionYear,
        course,
        year: Number(studyYear),
        section: selectedClass.section,
        paperCode: paper.paperCode,
        paperName: paper.paperName,
        paperType: paper.paperType,
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
      } catch { resumeStep = 1; }

      updateContext({
        academicYear: academicYear._id,
        academicYearLabel: academicYear.year,
        admissionBatchId: selectedAdmissionBatch._id,
        admissionBatchLabel: selectedAdmissionBatch.label,
        admissionYear: selectedAdmissionBatch.admissionYear,
        programme: degree,
        course,
        studyYear,
        batch: batch._id,
        batchLabel: batch.displayName,
        allocation,
        completed,
        imported,
      });
      onNext(resumeStep);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to prepare attainment data");
    } finally { setLoading(false); }
  }

  return (
    <section className="workflow-panel">
      <div className="section-heading-row">
        <div>
          <span className="section-kicker">STEP 01 · CURRENT ACADEMIC YEAR</span>
          <h2>Manual Class & Paper Selection</h2>
          <p>Select the admission batch first. The next fields show only matching ERP students, classes and papers.</p>
        </div>
        <span className="status-chip status-success">{academicYear?.year || "Loading..."}</span>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <Field label="Degree">
          <select value={degree} onChange={(e) => setDegree(e.target.value)} className="input-field">
            <option value="">-- Select UG / PG --</option><option value="UG">UG</option><option value="PG">PG</option>
          </select>
        </Field>
        <Field label="Batch">
          <select value={admissionBatchId} onChange={(e) => setAdmissionBatchId(e.target.value)} disabled={!admissionBatches.length} className="input-field disabled:bg-gray-100">
            <option value="">-- Select Batch --</option>{admissionBatches.map((item) => <option key={item._id} value={item._id}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Academic Year">
          <input value={academicYear?.year || ""} readOnly className="input-field bg-gray-50" />
        </Field>
        <Field label="Programme">
          <select value={course} onChange={(e) => setCourse(e.target.value)} disabled={!programmes.length} className="input-field disabled:bg-gray-100">
            <option value="">-- Select Programme --</option>{programmes.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Year of Study">
          <select value={studyYear} onChange={(e) => setStudyYear(e.target.value)} disabled={!years.length} className="input-field disabled:bg-gray-100">
            <option value="">-- Select Year --</option>{years.map((item) => <option key={item} value={item}>Year {item}</option>)}
          </select>
        </Field>
        <Field label="Class / Section">
          <select value={classKey} onChange={(e) => setClassKey(e.target.value)} disabled={!classes.length} className="input-field disabled:bg-gray-100">
            <option value="">-- Select Class --</option>{classes.map((item) => <option key={item.key} value={item.key}>{item.displayName} ({item.studentCount} students)</option>)}
          </select>
        </Field>
        <Field label="Paper Type">
          <select value={paperType} onChange={(e) => { setPaperType(e.target.value); setPaperCode(""); }} disabled={!paperTypes.length} className="input-field disabled:bg-gray-100">
            <option value="">-- Select Paper Type --</option>{paperTypes.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Paper Code">
            <select value={paperCode} onChange={(e) => setPaperCode(e.target.value)} disabled={!paperType || !filteredPapers.length} className="input-field disabled:bg-gray-100">
              <option value="">-- Select Paper Code --</option>{filteredPapers.map((item) => <option key={item.paperCode} value={item.paperCode}>{item.paperCode} · {item.paperName}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {loading && <div className="mt-5 flex items-center gap-2 text-sm text-gray-600"><span className="inline-block h-4 w-4 rounded-full border-2 border-brand border-t-transparent animate-spin" />{loadingLabel}</div>}
      {error && <p className="alert-error mt-5">{error}</p>}
      {!loading && selectedClass && papers.length === 0 && <p className="alert-error mt-5">No written paper records were found for this class.</p>}

      <div className="workflow-actions"><span /><button onClick={handleNext} disabled={loading || !paperCode} className="btn btn-primary">Prepare Attainment →</button></div>
    </section>
  );
}

function Field({ label, children }) {
  return <div><label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>{children}</div>;
}
