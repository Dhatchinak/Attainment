import React, { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";

export default function StepCIA({ context, onNext, onBack }) {
  const [components, setComponents] = useState([]);
  const [grid, setGrid] = useState([]);
  const [componentSummary, setComponentSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const allocationId = context.allocation?._id;

  useEffect(() => {
    if (!allocationId) return;
    setLoading(true);
    setError("");
    api
      .get(`/cia/${allocationId}`)
      .then((res) => {
        setComponents(res.data.components || []);
        setGrid(res.data.grid || []);
        setComponentSummary(res.data.componentSummary || []);
      })
      .catch((err) => setError(err.response?.data?.message || "Failed to load CIA sheet"))
      .finally(() => setLoading(false));
  }, [allocationId]);

  const rowsWithMarks = useMemo(
    () => grid.filter((row) => Object.values(row.componentMarks || {}).some((mark) => mark?.obtained !== "" && mark?.obtained !== null && mark?.obtained !== undefined)).length,
    [grid]
  );

  const hasAnyMarks = rowsWithMarks > 0;

  if (loading) return <div className="loading-state">Loading CIA marks...</div>;

  return (
    <section className="workflow-panel">
      <div className="section-heading-row">
        <div>
          <span className="section-kicker">STEP 05 · ADMIN-MANAGED CIA</span>
          <h2>Continuous Internal Assessment — {context.allocation?.paperCode}</h2>
          <p>
            CIA marks are read-only for staff. New CIA sheets begin empty and can be entered or corrected only by the administrator.
          </p>
        </div>
        <span className="readonly-badge">ADMIN UPDATE ONLY</span>
      </div>

      {error && <p className="alert-error mb-5">{error}</p>}

      {!error && !hasAnyMarks && (
        <div className="admin-notice mb-5">
          <div className="admin-notice-icon">!</div>
          <div>
            <strong>CIA marks are awaiting administrator entry.</strong>
            <p>
              Ask the administrator to open Admin Console → Attainment Records → Edit CIA Marks. This page will update automatically after you reopen it.
            </p>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <div className="metric-box">
          <span>Total Students</span>
          <strong>{grid.length}</strong>
          <small>Student roster</small>
        </div>
        <div className="metric-box">
          <span>Rows With CIA</span>
          <strong>{rowsWithMarks}</strong>
          <small>Updated by admin</small>
        </div>
        <div className="metric-box">
          <span>CIA Components</span>
          <strong>{components.length}</strong>
          <small>Configured in thresholds</small>
        </div>
      </div>

      <div className="table-shell">
        <table className="pro-table">
          <thead>
            <tr>
              <th>Paper Code</th>
              <th>Roll No</th>
              <th className="text-left">Student Name</th>
              {components.map((c) => <th key={c.key}>{c.label}<div className="text-[10px] font-normal opacity-70 mt-0.5">Max {c.maxMarks}</div></th>)}
            </tr>
          </thead>
          <tbody>
            {grid.map((row) => (
              <tr key={row.student._id}>
                <td className="font-semibold text-slate-500">{context.allocation?.paperCode}</td>
                <td className="font-medium">{row.student.regNo}</td>
                <td className="!text-left">{row.student.name}</td>
                {components.map((c) => {
                  const value = row.componentMarks?.[c.key]?.obtained;
                  const hasValue = value !== undefined && value !== null && value !== "";
                  return (
                    <td key={c.key}>
                      <span className={`readonly-mark ${!hasValue ? "is-empty" : ""}`}>{hasValue ? value : "—"}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
            {grid.length === 0 && (
              <tr><td colSpan={3 + components.length} className="py-10 text-slate-400">No students found for this allocation.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {componentSummary.length > 0 && hasAnyMarks && (
        <div className="table-shell mt-5">
          <table className="pro-table">
            <thead>
              <tr>
                <th className="!text-left">CIA Attainment Summary</th>
                {components.map((c) => <th key={c.key}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="!text-left font-medium">Students Appeared</td>
                {componentSummary.map((c) => <td key={c.key}>{c.appeared}</td>)}
              </tr>
              <tr>
                <td className="!text-left font-medium">Students Above Threshold</td>
                {componentSummary.map((c) => <td key={c.key}>{c.attained}</td>)}
              </tr>
              <tr>
                <td className="!text-left font-medium">Percentage Above Threshold</td>
                {componentSummary.map((c) => <td key={c.key}>{c.attainedPercent}%</td>)}
              </tr>
              <tr>
                <td className="!text-left font-medium">Outcome Level / 3</td>
                {componentSummary.map((c) => <td key={c.key} className="font-semibold text-brand">{c.outcomeLevel}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="workflow-actions">
        <button onClick={onBack} className="btn btn-ghost">← Back</button>
        <button
          onClick={onNext}
          disabled={!!error || !hasAnyMarks}
          title={!hasAnyMarks ? "CIA marks must be entered by the administrator before consolidation" : ""}
          className="btn btn-primary"
        >
          Next: Consolidated CO →
        </button>
      </div>
    </section>
  );
}
