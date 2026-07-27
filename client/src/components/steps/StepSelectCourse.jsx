import React, { useEffect, useState } from "react";
import api from "../../api/axios";

export default function StepSelectCourse({ context, updateContext, onNext }) {
  const [academicYears, setAcademicYears] = useState([]);
  const [programme, setProgramme] = useState(context.programme || "");
  const [academicYear, setAcademicYear] = useState(context.academicYear || "");
  const [semester, setSemester] = useState("");
  const [batches, setBatches] = useState([]);
  const [batch, setBatch] = useState(context.batch || "");
  const [allocations, setAllocations] = useState([]);
  const [allocationId, setAllocationId] = useState("");
  const [error, setError] = useState("");
  const [loadingClasses, setLoadingClasses] = useState(false);

  useEffect(() => {
    api.get("/meta/academic-years").then((res) => setAcademicYears(res.data));
  }, []);

  // The moment Academic Year + Programme + Semester are all picked, silently
  // fetch this staff's real classes straight from the ERP in the background —
  // no button, no visible "sync" step. Falls back to whatever's already saved
  // locally if the ERP is briefly unreachable.
  useEffect(() => {
    setBatches([]);
    setBatch("");
    setAllocations([]);
    setAllocationId("");
    setError("");

    if (!academicYear || !programme || !semester) return;

    let cancelled = false;
    setLoadingClasses(true);

    api
      .post("/meta/sync-my-classes", { academicYear, semester: Number(semester) })
      .catch(() => null) // ERP hiccup shouldn't block the user — fall through to whatever's already saved
      .then(() =>
        api.get("/meta/my-batches", { params: { academicYear, programme } })
      )
      .then((res) => {
        if (cancelled) return;
        setBatches(res.data);
        if (res.data.length === 0) {
          setError("No classes found for you in this selection. Contact admin if this seems incorrect.");
        }
      })
      .catch(() => !cancelled && setError("Failed to load your classes"))
      .finally(() => !cancelled && setLoadingClasses(false));

    return () => { cancelled = true; };
  }, [academicYear, programme, semester]);

  useEffect(() => {
    setAllocations([]);
    setAllocationId("");
    if (batch && academicYear) {
      api
        .get("/meta/my-papers", { params: { batch, academicYear } })
        .then((res) => setAllocations(res.data))
        .catch(() => setError("Failed to load your papers"));
    }
  }, [batch, academicYear]);

  async function handleNext() {
    setError("");
    if (!academicYear || !programme || !semester || !batch || !allocationId) {
      setError("Please complete every selection before proceeding.");
      return;
    }
    const allocation = allocations.find((a) => a._id === allocationId);
    const batchDoc = batches.find((b) => b._id === batch);

    let resumeStep = 1;
    let completed = false;
    try {
      const res = await api.get(`/attainment/${allocation._id}/progress`);
      const p = res.data;
      completed = p.completed;
      if (!p.matrixLocked) resumeStep = 1;
      else if (!p.settingsSet) resumeStep = 2;
      else if (!p.studentsUploaded) resumeStep = 3;
      else if (!p.eseEntered) resumeStep = 4;
      else if (!p.ciaEntered) resumeStep = 5;
      else if (!p.computed) resumeStep = 6;
      else resumeStep = 7;
    } catch {
      resumeStep = 1; // brand new paper, nothing saved yet — start from the matrix
    }

    updateContext({ academicYear, programme, batch, batchLabel: batchDoc?.displayName, allocation, completed });
    onNext(resumeStep);
  }

  return (
    <div className="bg-white rounded-xl shadow-card p-6 mt-4">
      <h2 className="text-lg font-semibold text-brand mb-1">Select Programme, Batch & Paper</h2>
      <p className="text-sm text-gray-500 mb-5">
        Your classes are pulled automatically from the college ERP the moment you complete the selections below.
      </p>

      <div className="grid md:grid-cols-3 gap-5 mb-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
          <select
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            className="w-full input-field"
          >
            <option value="">-- Select --</option>
            {academicYears.map((y) => (
              <option key={y._id} value={y._id}>{y.year}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Programme</label>
          <select
            value={programme}
            onChange={(e) => setProgramme(e.target.value)}
            className="w-full input-field"
          >
            <option value="">-- Select --</option>
            <option value="UG">UG</option>
            <option value="PG">PG</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
          <select
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            className="w-full input-field"
          >
            <option value="">-- Select --</option>
            {Array.from({ length: 8 }, (_, i) => i + 1).map((s) => (
              <option key={s} value={s}>Semester {s}</option>
            ))}
          </select>
        </div>
      </div>

      {loadingClasses && (
        <p className="text-sm text-gray-500 mb-4 flex items-center gap-2">
          <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          Fetching your classes from the ERP...
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Class / Batch</label>
          <select
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            disabled={!batches.length}
            className="w-full input-field disabled:bg-gray-100"
          >
            <option value="">-- Select --</option>
            {batches.map((b) => (
              <option key={b._id} value={b._id}>{b.displayName}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Paper</label>
          <select
            value={allocationId}
            onChange={(e) => setAllocationId(e.target.value)}
            disabled={!allocations.length}
            className="w-full input-field disabled:bg-gray-100"
          >
            <option value="">-- Select --</option>
            {allocations.map((a) => (
              <option key={a._id} value={a._id}>
                {a.paperCode} · {a.paperName} ({a.paperType})
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-amber-600 mt-4">{error}</p>}

      <div className="flex justify-end mt-6">
        <button onClick={handleNext} className="btn btn-primary">
          Next →
        </button>
      </div>
    </div>
  );
}
