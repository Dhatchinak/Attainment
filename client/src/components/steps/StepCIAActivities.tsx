import React, { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";

function fixed(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "0.00";
}

export default function StepCIAActivities({ context, onNext, onBack }) {
  const allocationId = context.allocation?._id;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showStudents, setShowStudents] = useState(false);

  useEffect(() => {
    if (!allocationId) return;
    setLoading(true);
    setError("");
    api.get(`/cia-question/${allocationId}/activities`)
      .then((res) => {
        setData(res.data);
        setVerified(Boolean(res.data.verified));
      })
      .catch((err) => setError(err.response?.data?.message || "Failed to load CIA activities"))
      .finally(() => setLoading(false));
  }, [allocationId]);

  const summary = data?.summary || [];
  const visibleComponents = useMemo(() => summary.filter((c) => c.sourceKey || c.appeared > 0), [summary]);
  const primary = visibleComponents.filter((c) => ["SE", "AR", "IT"].includes(String(c.sourceKey || "").toUpperCase()));
  const requiredSourceKeys = ["SE", "AR", "IT"];
  const presentSourceKeys = new Set(primary.map((c) => String(c.sourceKey || "").toUpperCase()));
  const missingPrimary = requiredSourceKeys.filter((key) => !presentSourceKeys.has(key));
  const unconfirmedPrimary = primary.filter((c) => c.maxMarksInferred);
  const canVerify = missingPrimary.length === 0 && unconfirmedPrimary.length === 0 && primary.every((c) => c.appeared > 0 && c.maxMarks > 0);
  const scope = data?.scope || data?.source?.scope || {};
  const selectedSection = scope.section || "—";
  const sourceStudentCount = Number(scope.sourceStudentCount || data?.students?.length || 0);
  const matchedStudentCount = Number(scope.matchedStudentCount ?? data?.students?.length ?? 0);

  async function verify() {
    setVerifying(true);
    setError("");
    try {
      await api.post(`/cia-question/${allocationId}/activities/verify`, {});
      setVerified(true);
    } catch (err) {
      setError(err.response?.data?.message || "Could not verify CIA activities");
    } finally {
      setVerifying(false);
    }
  }

  if (loading) return <div className="loading-state">Loading CIA activity marks...</div>;

  return (
    <section className="workflow-panel">
      <div className="section-heading-row">
        <div>
          <span className="section-kicker">STEP 07 · CIA ACTIVITY VERIFICATION</span>
          <h2>Seminar, Assignment & Innovative — {context.allocation?.paperCode}</h2>
          <p>
            These non-test CIA marks come from the imported department workbook. Verify the student marks and the CO coverage configured for this paper.
          </p>
        </div>
        <span className={`status-chip ${verified ? "status-success" : "status-warning"}`}>
          {verified ? "✓ Verified" : "Verification required"}
        </span>
      </div>

      {error && <p className="alert-error mt-4">{error}</p>}

      {!error && data && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 my-5">
            <div className="metric-box"><span>Selected Class Students</span><strong>{data.students?.length || 0}</strong><small>{sourceStudentCount > matchedStudentCount ? `Filtered from ${sourceStudentCount} source rows` : "Class-specific CIA rows"}</small></div>
            <div className="metric-box"><span>Activities Found</span><strong>{visibleComponents.length}</strong><small>{visibleComponents.map((c) => c.sourceKey).join(", ") || "—"}</small></div>
            <div className="metric-box"><span>Threshold</span><strong>{data.thresholdMarksPercent}%</strong><small>Minimum activity score</small></div>
          </div>

          {sourceStudentCount > matchedStudentCount && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 mb-5 text-sm text-emerald-800">
              <strong>✓ Class/section filter applied.</strong> Only {matchedStudentCount} students from the selected {selectedSection === "NIL" ? "NIL (Aided)" : `Section ${selectedSection}`} class are used for CIA activities.
            </div>
          )}

          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 mb-5">
            <strong className="text-slate-800">Easy reading:</strong>
            <span className="text-sm text-slate-600 ml-2">
              each activity gets one attainment level. That level is attached only to its configured CO range. Innovative is kept separately in the final 25% CIA calculation, following the reference Excel structure.
            </span>
          </div>

          {missingPrimary.length > 0 && (
            <p className="alert-error mb-4">Required CIA source fields are missing for this paper: {missingPrimary.join(", ")}. Admin should verify that Seminar (SE), Assignment (AR) and Innovative (IT) were imported.</p>
          )}
          {unconfirmedPrimary.length > 0 && (
            <p className="alert-error mb-4">Admin must confirm the maximum marks for {unconfirmedPrimary.map((c) => c.label).join(", ")} before staff verification. This is important because the imported English workbook uses different activity maxima for different papers.</p>
          )}

          <div className="table-shell">
            <table className="pro-table">
              <thead>
                <tr>
                  <th className="!text-left">Activity</th>
                  <th>Source Field</th>
                  <th>CO Coverage</th>
                  <th>Max</th>
                  <th>Appeared</th>
                  <th>Above Threshold</th>
                  <th>Attained %</th>
                  <th>Level / 3</th>
                </tr>
              </thead>
              <tbody>
                {visibleComponents.map((component) => (
                  <tr key={component.key}>
                    <td className="!text-left font-semibold">{component.label}</td>
                    <td>{component.sourceKey || "Not found"}</td>
                    <td>{component.coList?.join(", ") || "—"}</td>
                    <td>{component.maxMarks}</td>
                    <td>{component.appeared}</td>
                    <td>{component.attained}</td>
                    <td>{fixed(component.attainedPercent)}%</td>
                    <td className="font-bold text-brand">{fixed(component.outcomeLevel)}</td>
                  </tr>
                ))}
                {visibleComponents.length === 0 && <tr><td colSpan={8} className="py-8 text-slate-400">No configured CIA activity matched the imported source columns.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {primary.map((component) => (
              <div key={component.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex justify-between gap-3">
                  <strong>{component.label}</strong>
                  <span className="status-chip status-neutral">{component.coList?.join(" · ")}</span>
                </div>
                <div className="text-2xl font-bold text-brand mt-3">{fixed(component.outcomeLevel)} / 3</div>
                <div className="text-xs text-slate-500 mt-1">{component.attained} of {component.appeared} students above threshold</div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 overflow-hidden">
            <button type="button" onClick={() => setShowStudents((v) => !v)} className="w-full px-4 py-3 bg-slate-50 flex items-center justify-between text-sm font-semibold text-slate-700">
              <span>Student Activity Marks ({data.students?.length || 0})</span>
              <span>{showStudents ? "Hide ↑" : "View details ↓"}</span>
            </button>
            {showStudents && (
              <div className="overflow-auto max-h-[55vh]">
                <table className="pro-table min-w-max">
                  <thead><tr><th>Reg No</th><th className="!text-left min-w-[220px]">Name</th>{visibleComponents.map((c) => <th key={c.key}>{c.label}<div className="text-[10px] font-normal opacity-70">/{c.maxMarks}</div></th>)}</tr></thead>
                  <tbody>
                    {(data.students || []).map((student) => (
                      <tr key={student.regNo}>
                        <td className="font-medium">{student.regNo}</td>
                        <td className="!text-left">{student.name}</td>
                        {visibleComponents.map((component) => {
                          const value = student.marks?.[component.sourceKey];
                          return <td key={component.key}>{value === undefined || value === null || value === "" ? <span className="text-slate-300">—</span> : value}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className={`mt-6 rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-4 ${verified ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <div>
              <strong className={verified ? "text-emerald-800" : "text-amber-900"}>{verified ? "✓ CIA activities verified" : "Verify activities before calculation"}</strong>
              <p className="text-sm text-slate-600 mt-1">Check Seminar, Assignment and Innovative values and their CO mapping before confirming.</p>
            </div>
            {!verified && <button onClick={verify} disabled={!canVerify || verifying} className="btn btn-secondary">{verifying ? "Verifying..." : "Verify CIA Activities"}</button>}
          </div>
        </>
      )}

      <div className="workflow-actions">
        <button onClick={onBack} className="btn btn-ghost">← Back</button>
        <button onClick={onNext} disabled={!verified} className="btn btn-primary">Next: Calculation →</button>
      </div>
    </section>
  );
}
