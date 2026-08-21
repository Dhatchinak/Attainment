import React, { useEffect, useState } from "react";
import api from "../../api/axios";

function fixed(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "0.00";
}

export default function StepCIATest({ exam, stepNumber, context, onNext, onBack }) {
  const allocationId = context.allocation?._id;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [showStudents, setShowStudents] = useState(false);

  function load() {
    if (!allocationId) return;
    setLoading(true);
    setError("");
    api.get(`/cia-question/${allocationId}/test/${exam}`)
      .then((res) => {
        setData(res.data);
        setVerified(Boolean(res.data.verified));
      })
      .catch((err) => setError(err.response?.data?.message || `Failed to load ${exam} question-wise CIA data`))
      .finally(() => setLoading(false));
  }

  useEffect(load, [allocationId, exam]);

  const questionStats = data?.summary?.questions || [];
  const coSummary = data?.summary?.coSummary || [];
  const inferredCount = questionStats.filter((q) => q.maxMarksInferred).length;
  const canVerify = questionStats.length > 0 && (data?.summary?.invalidCount || 0) === 0 && inferredCount === 0;
  const scope = data?.scope || data?.source?.scope || {};
  const selectedSection = scope.section || "—";
  const sourceStudentCount = Number(scope.sourceStudentCount || data?.students?.length || 0);
  const matchedStudentCount = Number(scope.matchedStudentCount ?? data?.students?.length ?? 0);

  async function verify() {
    setVerifying(true);
    setError("");
    try {
      await api.post(`/cia-question/${allocationId}/test/${exam}/verify`, {});
      setVerified(true);
    } catch (err) {
      setError(err.response?.data?.message || `Could not verify ${exam}`);
    } finally {
      setVerifying(false);
    }
  }

  if (loading) return <div className="loading-state">Loading {exam} question-wise attainment...</div>;

  return (
    <section className="workflow-panel">
      <div className="section-heading-row">
        <div>
          <span className="section-kicker">STEP {String(stepNumber).padStart(2, "0")} · QUESTION-WISE CIA</span>
          <h2>{exam} Question-wise Attainment — {context.allocation?.paperCode}</h2>
          <p>
            Check the imported question marks and CO mapping. The system calculates every question first, then averages the question levels mapped to each CO.
          </p>
        </div>
        <span className={`status-chip ${verified ? "status-success" : "status-warning"}`}>
          {verified ? "✓ Verified" : "Verification required"}
        </span>
      </div>

      {error && <p className="alert-error mt-4">{error}</p>}

      {!error && data && (
        <>
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4 mt-5">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
              <div className="font-semibold text-slate-800">What staff should verify on this page</div>
              <p className="text-sm text-slate-600 leading-6 mt-1">
                Confirm the paper code, student question marks, Question → CO mapping and maximum mark. No manual attainment calculation is needed; all percentages and CO averages are automatic.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <span className="text-slate-500">Source staff</span><strong className="text-right">{data.source?.staffName || "—"}</strong>
                <span className="text-slate-500">Academic year</span><strong className="text-right">{data.source?.academicYear || "—"}</strong>
                <span className="text-slate-500">Term</span><strong className="text-right">{data.source?.term || "—"}</strong>
                <span className="text-slate-500">Selected section</span><strong className="text-right">{selectedSection === "NIL" ? "NIL (Aided)" : selectedSection}</strong>
                <span className="text-slate-500">Class match</span><strong className="text-right">{matchedStudentCount} / {sourceStudentCount} rows</strong>
                <span className="text-slate-500">Source</span><strong className="text-right truncate" title={data.source?.sourceFileName}>{data.source?.sourceFileName || "MongoDB"}</strong>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 my-5">
            <div className="metric-box"><span>Selected Class Students</span><strong>{data.summary?.studentCount || 0}</strong><small>{sourceStudentCount > matchedStudentCount ? `Filtered from ${sourceStudentCount} imported rows` : "Class-specific CIA rows"}</small></div>
            <div className="metric-box"><span>Questions</span><strong>{questionStats.length}</strong><small>Mapped questions</small></div>
            <div className="metric-box"><span>Mapped COs</span><strong>{coSummary.length}</strong><small>{coSummary.map((c) => c.co).join(", ") || "—"}</small></div>
            <div className="metric-box"><span>Threshold</span><strong>{data.thresholdMarksPercent}%</strong><small>Per-question mark threshold</small></div>
          </div>

          {sourceStudentCount > matchedStudentCount && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 mb-5 text-sm text-emerald-800">
              <strong>✓ Class/section filter applied.</strong> Only {matchedStudentCount} students belonging to the selected {selectedSection === "NIL" ? "NIL (Aided)" : `Section ${selectedSection}`} class are used for {exam}. The other {Math.max(0, sourceStudentCount - matchedStudentCount)} workbook rows are excluded from this attainment.
            </div>
          )}

          {inferredCount > 0 && (
            <div className="admin-notice mb-5">
              <div className="admin-notice-icon">i</div>
              <div>
                <strong>{inferredCount} question maximum{inferredCount > 1 ? "s were" : " was"} inferred during Excel import.</strong>
                <p>The source workbook stores marks and CO/K mapping but does not provide a separate maximum-mark field. Admin can review/override maximums in CIA Data Import.</p>
              </div>
            </div>
          )}

          <div className="subsection-title">
            <div>
              <h3>{exam} Question Attainment</h3>
              <p>Formula: students above question threshold ÷ appeared students → attainment % → level / 3.</p>
            </div>
          </div>

          <div className="table-shell">
            <table className="pro-table">
              <thead>
                <tr>
                  <th>Question</th>
                  <th>CO</th>
                  <th>Bloom / K</th>
                  <th>Max</th>
                  <th>Threshold Mark</th>
                  <th>Appeared</th>
                  <th>Above Threshold</th>
                  <th>Attained %</th>
                  <th>Level / 3</th>
                </tr>
              </thead>
              <tbody>
                {questionStats.map((q) => (
                  <tr key={q.key}>
                    <td className="font-semibold">{q.key}</td>
                    <td><span className="status-chip status-neutral">{q.co || "Unmapped"}</span></td>
                    <td>{q.kLevel || "—"}</td>
                    <td>{q.maxMarks}</td>
                    <td>{q.thresholdMark}</td>
                    <td>{q.appeared}</td>
                    <td>{q.attained}</td>
                    <td>{fixed(q.attainedPercent)}%</td>
                    <td className="font-bold text-brand">{fixed(q.outcomeLevel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="subsection-title mt-6">
            <div>
              <h3>{exam} CO Average</h3>
              <p>All question levels mapped to the same CO are averaged automatically.</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {coSummary.map((co) => (
              <div key={co.co} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-slate-900">{co.co}</strong>
                  <span className="text-xs text-slate-400">{co.questionCount} Q</span>
                </div>
                <div className="text-2xl font-bold text-brand mt-2">{fixed(co.outcomeLevel)}</div>
                <div className="text-xs text-slate-500 mt-1">Average level / 3</div>
                <div className="text-[11px] text-slate-400 mt-2 truncate" title={co.questionKeys?.join(", ")}>{co.questionKeys?.join(", ")}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 overflow-hidden">
            <button type="button" onClick={() => setShowStudents((v) => !v)} className="w-full px-4 py-3 bg-slate-50 flex items-center justify-between text-sm font-semibold text-slate-700">
              <span>Student Question Marks ({data.students?.length || 0})</span>
              <span>{showStudents ? "Hide ↑" : "View details ↓"}</span>
            </button>
            {showStudents && (
              <div className="overflow-auto max-h-[55vh]">
                <table className="pro-table min-w-max">
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-slate-100 z-10">Reg No</th>
                      <th className="sticky left-[120px] bg-slate-100 z-10 !text-left min-w-[220px]">Name</th>
                      {questionStats.map((q) => <th key={q.key}>{q.key}<div className="text-[10px] font-normal opacity-70">{q.co} · /{q.maxMarks}</div></th>)}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.students || []).map((student) => (
                      <tr key={student.regNo}>
                        <td className="sticky left-0 bg-white font-medium">{student.regNo}</td>
                        <td className="sticky left-[120px] bg-white !text-left">{student.name}</td>
                        {questionStats.map((q) => {
                          const value = student.marks?.[q.key];
                          return <td key={q.key}>{value === undefined || value === null || value === "" ? <span className="text-slate-300">—</span> : value}</td>;
                        })}
                        <td className="font-semibold">{student.total ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {(data.summary?.invalidCount || 0) > 0 && (
            <p className="alert-error mt-4">{data.summary.invalidCount} imported question mark(s) are outside the configured maximum. Admin must correct the question maximum or source data before verification.</p>
          )}
          {inferredCount > 0 && (
            <p className="alert-error mt-4">Admin confirmation is required for the inferred question maximum marks before you can verify {exam}. This prevents a wrong maximum from changing the attainment percentage.</p>
          )}

          <div className={`mt-6 rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-4 ${verified ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <div>
              <strong className={verified ? "text-emerald-800" : "text-amber-900"}>{verified ? `✓ ${exam} verified` : `Verify ${exam} before continuing`}</strong>
              <p className="text-sm text-slate-600 mt-1">Verification confirms that staff checked the imported marks and Question → CO mapping used in the calculation.</p>
            </div>
            {!verified && <button onClick={verify} disabled={!canVerify || verifying} className="btn btn-secondary">{verifying ? "Verifying..." : `Verify ${exam}`}</button>}
          </div>
        </>
      )}

      <div className="workflow-actions">
        <button onClick={onBack} className="btn btn-ghost">← Back</button>
        <button onClick={onNext} disabled={!verified} className="btn btn-primary">Next →</button>
      </div>
    </section>
  );
}
