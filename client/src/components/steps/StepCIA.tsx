import React, { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";

export default function StepCIA({ context, onNext, onBack }) {
  const [components, setComponents] = useState([]);
  const [grid, setGrid] = useState<any[]>([]);
  const [componentSummary, setComponentSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
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
    () => grid.filter((row) => (Object.values(row.componentMarks || {}) as any[]).some((mark) => mark?.obtained !== "" && mark?.obtained !== null && mark?.obtained !== undefined)).length,
    [grid]
  );

  const hasAnyMarks = rowsWithMarks > 0;

  function updateMark(rowIndex, key, value, max) {
    setGrid((current) => current.map((row, index) => index === rowIndex ? {
      ...row, componentMarks: { ...row.componentMarks, [key]: value === "" ? null : { obtained: value, max } },
    } : row));
  }

  async function saveMarks() {
    setSaving(true); setError(""); setMessage("");
    try {
      const entries = grid.map((row) => ({ studentId: row.student._id, componentMarks: row.componentMarks || {} }));
      await api.post(`/cia/${allocationId}/bulk`, { entries });
      setMessage("CIA marks saved successfully in MongoDB.");
    } catch (requestError) { setError(requestError.response?.data?.message || "Failed to save CIA marks"); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="loading-state">Loading CIA marks...</div>;

  return (
    <section className="workflow-panel">
      <div className="section-heading-row">
        <div>
          <span className="section-kicker">STEP 05 · CIA MARK ENTRY</span>
          <h2>Continuous Internal Assessment — {context.allocation?.paperCode}</h2>
          <p>
            Migrated CIA marks load automatically. If CIA is unavailable, the allocated staff member can enter it here; Admin can also correct it.
          </p>
        </div>
        <span className="readonly-badge">STAFF / ADMIN ENTRY</span>
      </div>

      {error && <p className="alert-error mb-5">{error}</p>}

      {!error && !hasAnyMarks && (
        <div className="admin-notice mb-5">
          <div className="admin-notice-icon">!</div>
          <div>
            <strong>Migrated CIA marks are unavailable for this paper.</strong>
            <p>
              Enter the marks below and save them. They will be stored in MongoDB for this exact class, section and paper.
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
          <small>Saved CIA rows</small>
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
            {grid.map((row, rowIndex) => (
              <tr key={row.student._id}>
                <td className="font-semibold text-slate-500">{context.allocation?.paperCode}</td>
                <td className="font-medium">{row.student.regNo}</td>
                <td className="!text-left">{row.student.name}</td>
                {components.map((c) => {
                  const value = row.componentMarks?.[c.key]?.obtained;
                  const hasValue = value !== undefined && value !== null && value !== "";
                  return (
                    <td key={c.key}>
                      <input type="number" min="0" max={c.maxMarks} className="input-field w-20 text-center" value={hasValue ? value : ""} onChange={(event) => updateMark(rowIndex, c.key, event.target.value, c.maxMarks)} placeholder="—" />
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

      <div className="flex justify-end mt-4"><button className="btn btn-secondary" onClick={saveMarks} disabled={saving}>{saving ? "Saving..." : "Save CIA Marks"}</button></div>
      {message && <p className="alert-success mt-4">{message}</p>}

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
          title={!hasAnyMarks ? "Enter and save CIA marks before consolidation" : ""}
          className="btn btn-primary"
        >
          Next: Consolidated CO →
        </button>
      </div>
    </section>
  );
}
