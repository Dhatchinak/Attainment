import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../api/axios";


function badgeForExam(exam) {
  return exam === "T1"
    ? "bg-blue-50 text-blue-700 border-blue-200"
    : "bg-violet-50 text-violet-700 border-violet-200";
}

export default function CIADataImport() {
  const fileRef = useRef(null);
  const [questionSets, setQuestionSets] = useState([]);
  const [activitySets, setActivitySets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [reviewId, setReviewId] = useState(null);
  const [activityReviewId, setActivityReviewId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/cia-question/admin/datasets");
      setQuestionSets(data.questionSets || []);
      setActivitySets(data.activitySets || []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load CIA datasets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => ({
    papers: new Set(questionSets.map((item) => `${item.paperCode}|${item.term}|${item.academicYear}`)).size,
    questionSets: questionSets.length,
    students: questionSets.reduce((sum, item) => sum + Number(item.studentCount || 0), 0),
    needsReview: questionSets.filter((item) => Number(item.inferredCount || 0) > 0).length + activitySets.filter((item) => Number(item.inferredCount || 0) > 0).length,
  }), [questionSets, activitySets]);

  async function uploadWorkbook() {
    if (!selectedFile) {
      setError("Choose the English department CIA Excel workbook first.");
      return;
    }
    setUploading(true);
    setMessage("");
    setError("");
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const { data } = await api.post("/cia-question/import", form);
      setMessage(
        `Imported ${data.questionSetsImported || 0} T1/T2 dataset(s), ${data.questionRowsImported || 0} question-mark row(s), ` +
        `and ${data.activitySetsImported || 0} activity dataset(s) into MongoDB. Review inferred question maximums before staff verification.`
      );
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) {
      const status = err.response?.status;
      const payload = err.response?.data;
      let detail = payload && typeof payload === "object"
        ? (payload.error || payload.message || "")
        : "";

      if (status === 413) {
        const mb = (selectedFile.size / 1024 / 1024).toFixed(1);
        detail = `The ${mb} MB workbook was rejected before it reached the Node server (HTTP 413). Increase the web-server/proxy upload limit.`;
      } else if (!err.response) {
        detail = "The import request did not receive a response from the backend. The server may be offline or the request may have timed out.";
      } else if (!detail) {
        detail = `CIA workbook import failed (HTTP ${status || "unknown"}).`;
      }

      const stage = payload && typeof payload === "object" ? payload.stage : "";
      const hint = payload && typeof payload === "object" ? payload.hint : "";
      setError([detail, stage ? `Stage: ${stage}` : "", hint].filter(Boolean).join(" — "));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="card-surface p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <span className="section-kicker">QUESTION-WISE CIA SOURCE</span>
            <h2 className="font-display text-xl font-bold text-slate-900 mt-1">CIA Workbook Import</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-3xl">
              Upload the English department CIA workbook once. The portal stores T1/T2 question marks, question-to-CO/K mapping,
              course-teacher name, and Seminar / Assignment / Innovative activity marks in MongoDB.
            </p>
          </div>
          <span className="readonly-badge">ADMIN ONLY</span>
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-5">
          <div className="metric-box"><span>Paper / Term Sets</span><strong>{summary.papers}</strong><small>Unique imported paper datasets</small></div>
          <div className="metric-box"><span>T1 / T2 Sets</span><strong>{summary.questionSets}</strong><small>Question-wise source datasets</small></div>
          <div className="metric-box"><span>Question Rows</span><strong>{summary.students.toLocaleString()}</strong><small>Student exam rows stored</small></div>
          <div className="metric-box"><span>Needs Max Review</span><strong>{summary.needsReview}</strong><small>Datasets with inferred maxima</small></div>
        </div>

        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
          <strong>Important:</strong> the supplied question-mapping sheets contain CO and K-level mappings but do not provide an explicit maximum mark for every question.
          The importer therefore derives a safe maximum from observed marks. Admin should open <strong>Review Questions</strong> and confirm the maximums before staff verifies T1/T2.
        </div>

        <div className="mt-5 flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">CIA Excel Workbook (.xlsx / .xls)</label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setMessage("");
                setError("");
                if (file && file.size > 20 * 1024 * 1024) {
                  setSelectedFile(null);
                  e.target.value = "";
                  setError("Workbook is larger than the 20 MB application upload limit.");
                  return;
                }
                setSelectedFile(file);
              }}
              className="input-field w-full"
            />
            {selectedFile && (
              <p className="text-xs text-slate-500 mt-1.5">
                Selected: <strong>{selectedFile.name}</strong> · {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>
          <button onClick={uploadWorkbook} disabled={uploading || !selectedFile} className="btn btn-primary min-w-[190px]">
            {uploading ? "Importing…" : "Upload to MongoDB"}
          </button>
        </div>
        {message && <p className="alert-success mt-4">✓ {message}</p>}
        {error && <p className="alert-error mt-4">{error}</p>}
      </div>

      <div className="card-surface p-5">
        <div className="mb-4">
          <h3 className="font-display font-bold text-slate-900">T1 / T2 Question Datasets</h3>
          <p className="text-xs text-slate-500 mt-1">Staff name comes directly from the workbook mapping sheet. Review inferred question maxima here.</p>
        </div>
        {loading ? <div className="loading-state">Loading imported CIA datasets…</div> : (
          <div className="table-shell">
            <table className="pro-table">
              <thead>
                <tr>
                  <th className="!text-left">Paper</th>
                  <th>Test</th>
                  <th>Term</th>
                  <th>Academic Year</th>
                  <th className="!text-left">Staff In-charge</th>
                  <th>Questions</th>
                  <th>Students</th>
                  <th>Max Review</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {questionSets.map((item) => (
                  <tr key={item._id}>
                    <td className="!text-left font-semibold">{item.paperCode}</td>
                    <td><span className={`badge border ${badgeForExam(item.exam)}`}>{item.exam}</span></td>
                    <td>{item.term}</td>
                    <td>{item.academicYear || "—"}</td>
                    <td className="!text-left">{item.staffName || "—"}</td>
                    <td>{item.questionCount}</td>
                    <td>{item.studentCount}</td>
                    <td>
                      {item.inferredCount > 0
                        ? <span className="badge bg-amber-50 text-amber-700 border border-amber-200">{item.inferredCount} inferred</span>
                        : <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">✓ Confirmed</span>}
                    </td>
                    <td><button onClick={() => setReviewId(item._id)} className="btn btn-ghost !px-3 !py-2">Review Questions</button></td>
                  </tr>
                ))}
                {!questionSets.length && <tr><td colSpan={9} className="py-9 text-slate-400">No CIA question workbook has been imported yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card-surface p-5">
        <div className="mb-4">
          <h3 className="font-display font-bold text-slate-900">CIA Activity Datasets</h3>
          <p className="text-xs text-slate-500 mt-1">Seminar, Assignment, Innovative and any other source columns found in MAJOR / PARTII are preserved.</p>
        </div>
        <div className="table-shell">
          <table className="pro-table">
            <thead><tr><th className="!text-left">Paper</th><th>Term</th><th>Academic Year</th><th className="!text-left">Staff In-charge</th><th className="!text-left">Available Components</th><th>Students</th><th>Max Review</th><th>Action</th></tr></thead>
            <tbody>
              {activitySets.map((item) => (
                <tr key={item._id}>
                  <td className="!text-left font-semibold">{item.paperCode}</td>
                  <td>{item.term}</td>
                  <td>{item.academicYear || "—"}</td>
                  <td className="!text-left">{item.staffName || "—"}</td>
                  <td className="!text-left">
                    <div className="flex flex-wrap gap-1.5">
                      {(item.components || []).map((component) => <span key={component.key} className="status-chip status-neutral">{component.label}</span>)}
                    </div>
                  </td>
                  <td>{item.studentCount}</td>
                  <td>{item.inferredCount > 0 ? <span className="badge bg-amber-50 text-amber-700 border border-amber-200">{item.inferredCount} inferred</span> : <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">✓ Confirmed</span>}</td>
                  <td><button onClick={() => setActivityReviewId(item._id)} className="btn btn-ghost !px-3 !py-2">Review Activities</button></td>
                </tr>
              ))}
              {!activitySets.length && <tr><td colSpan={8} className="py-9 text-slate-400">No CIA activity datasets imported yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {reviewId && <QuestionReview datasetId={reviewId} onClose={() => setReviewId(null)} onSaved={load} />}
      {activityReviewId && <ActivityReview datasetId={activityReviewId} onClose={() => setActivityReviewId(null)} onSaved={load} />}
    </div>
  );
}

function QuestionReview({ datasetId, onClose, onSaved }) {
  const [dataset, setDataset] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setLoading(true);
    api.get(`/cia-question/admin/datasets/${datasetId}`)
      .then(({ data }) => {
        setDataset(data);
        setQuestions((data.questions || []).map((q) => ({ ...q })));
      })
      .catch((err) => setError(err.response?.data?.message || "Unable to open question dataset"))
      .finally(() => setLoading(false));
  }, [datasetId]);

  function updateQuestion(index, field, value) {
    setMessage("");
    setQuestions((current) => current.map((row, i) => i === index ? { ...row, [field]: value } : row));
  }

  async function save() {
    const invalid = questions.find((q) => !Number.isFinite(Number(q.maxMarks)) || Number(q.maxMarks) <= 0);
    if (invalid) {
      setError(`${invalid.key}: maximum mark must be greater than 0.`);
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.patch(`/cia-question/admin/datasets/${datasetId}/questions`, {
        questions: questions.map((q) => ({ key: q.key, co: q.co, kLevel: q.kLevel, maxMarks: Number(q.maxMarks) })),
      });
      setDataset(data);
      setQuestions((data.questions || []).map((q) => ({ ...q })));
      setMessage("Question mapping and maximum marks confirmed. Staff can now verify this test.");
      await onSaved?.();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save question review");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="admin-modal-panel !max-w-6xl">
        <div className="admin-modal-header">
          <div>
            <span className="section-kicker">QUESTION MAPPING REVIEW</span>
            <h3>{dataset?.paperCode || "CIA Dataset"} {dataset?.exam ? `· ${dataset.exam}` : ""}</h3>
            <p>{dataset?.staffName || "Staff not supplied"} · {dataset?.term || "—"} · {dataset?.academicYear || "Academic year not supplied"}</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost !px-3">✕</button>
        </div>

        {loading ? <div className="loading-state">Opening questions…</div> : (
          <>
            <div className="admin-notice mb-4">
              <div className="admin-notice-icon">Q</div>
              <div>
                <strong>Confirm only what the Excel source cannot tell us.</strong>
                <p>CO and K-level are imported from the mapping sheet. “Observed max” is the highest student mark found; “Question max” is the actual mark used for attainment and can be corrected here.</p>
              </div>
            </div>
            {error && <p className="alert-error mb-4">{error}</p>}
            {message && <p className="alert-success mb-4">✓ {message}</p>}
            <div className="table-shell max-h-[58vh] overflow-auto">
              <table className="pro-table">
                <thead><tr><th>Question</th><th>CO Mapping</th><th>K Level</th><th>Observed Max</th><th>Question Max</th><th>Source Status</th></tr></thead>
                <tbody>
                  {questions.map((q, index) => (
                    <tr key={q.key}>
                      <td className="font-semibold">{q.key}</td>
                      <td><input value={q.co || ""} onChange={(e) => updateQuestion(index, "co", e.target.value.toUpperCase())} className="table-input compact" placeholder="CO1" /></td>
                      <td><input value={q.kLevel || ""} onChange={(e) => updateQuestion(index, "kLevel", e.target.value.toUpperCase())} className="table-input compact" placeholder="K1" /></td>
                      <td>{Number(q.observedMax || 0).toFixed(2)}</td>
                      <td><input type="number" min="0.01" step="0.01" value={q.maxMarks ?? ""} onChange={(e) => updateQuestion(index, "maxMarks", e.target.value)} className="table-input compact" /></td>
                      <td>{q.maxMarksInferred ? <span className="badge bg-amber-50 text-amber-700 border border-amber-200">Needs confirmation</span> : <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">✓ Confirmed</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={onClose} className="btn btn-ghost">Close</button>
              <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? "Saving…" : "Confirm Question Mapping"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


function ActivityReview({ datasetId, onClose, onSaved }) {
  const [dataset, setDataset] = useState(null);
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setLoading(true);
    api.get(`/cia-question/admin/activity-datasets/${datasetId}`)
      .then(({ data }) => {
        setDataset(data);
        setComponents((data.components || []).map((component) => ({ ...component })));
      })
      .catch((err) => setError(err.response?.data?.message || "Unable to open CIA activity dataset"))
      .finally(() => setLoading(false));
  }, [datasetId]);

  function updateMax(index, value) {
    setMessage("");
    setComponents((current) => current.map((component, i) => i === index ? { ...component, maxMarks: value } : component));
  }

  async function save() {
    const invalid = components.find((component) => {
      const max = Number(component.maxMarks);
      return !Number.isFinite(max) || max <= 0 || max < Number(component.observedMax || 0);
    });
    if (invalid) {
      setError(`${invalid.label}: maximum must be at least the observed mark ${invalid.observedMax || 0}.`);
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.patch(`/cia-question/admin/activity-datasets/${datasetId}/components`, {
        components: components.map((component) => ({ key: component.key, maxMarks: Number(component.maxMarks) })),
      });
      setDataset(data);
      setComponents((data.components || []).map((component) => ({ ...component })));
      setMessage("CIA activity maximum marks confirmed. Staff can verify Seminar, Assignment and Innovative.");
      await onSaved?.();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save CIA activity review");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="admin-modal-panel !max-w-4xl">
        <div className="admin-modal-header">
          <div>
            <span className="section-kicker">CIA ACTIVITY MAXIMUM REVIEW</span>
            <h3>{dataset?.paperCode || "CIA Activities"}</h3>
            <p>{dataset?.staffName || "Staff not supplied"} · {dataset?.term || "—"} · {dataset?.academicYear || "Academic year not supplied"}</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost !px-3">✕</button>
        </div>

        {loading ? <div className="loading-state">Opening activity data…</div> : (
          <>
            <div className="admin-notice mb-4">
              <div className="admin-notice-icon">A</div>
              <div>
                <strong>Activity maxima can vary by programme/paper.</strong>
                <p>The English workbook contains actual activity marks but not a separate maximum field. The system infers a likely maximum; confirm it here so /5, /10 and /20 components are never mixed.</p>
              </div>
            </div>
            {error && <p className="alert-error mb-4">{error}</p>}
            {message && <p className="alert-success mb-4">✓ {message}</p>}
            <div className="table-shell">
              <table className="pro-table">
                <thead><tr><th className="!text-left">Activity</th><th>Source Field</th><th>Observed Max</th><th>Activity Max</th><th>Status</th></tr></thead>
                <tbody>
                  {components.map((component, index) => (
                    <tr key={component.key}>
                      <td className="!text-left font-semibold">{component.label}</td>
                      <td>{component.key}</td>
                      <td>{Number(component.observedMax || 0).toFixed(2)}</td>
                      <td><input type="number" min="0.01" step="0.01" value={component.maxMarks ?? component.inferredMax ?? ""} onChange={(e) => updateMax(index, e.target.value)} className="table-input compact" /></td>
                      <td>{component.maxMarksInferred !== false ? <span className="badge bg-amber-50 text-amber-700 border border-amber-200">Needs confirmation</span> : <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">✓ Confirmed</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={onClose} className="btn btn-ghost">Close</button>
              <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? "Saving…" : "Confirm Activity Maximums"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
