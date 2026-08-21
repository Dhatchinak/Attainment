import React, { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";

function calculateSummary(grid, eseMaxMarks, thresholdPercent) {
  const enteredMarks = grid
    .map((row) => row.obtained)
    .filter((value) => value !== "" && value !== null && value !== undefined)
    .map(Number);

  const validMarks = enteredMarks.filter(
    (mark) => Number.isFinite(mark) && mark >= 0 && mark <= eseMaxMarks
  );
  const invalidCount = enteredMarks.length - validMarks.length;
  const appeared = validMarks.length;
  const attained = validMarks.filter((mark) => (mark / eseMaxMarks) * 100 >= thresholdPercent).length;
  const attainedPercent = appeared > 0 ? Number(((attained / appeared) * 100).toFixed(2)) : 0;
  const outcomeLevel = Math.min(3, Number(((attainedPercent / 100) * 3).toFixed(2)));

  return { appeared, attained, attainedPercent, outcomeLevel, invalidCount };
}

export default function StepESE({ context, onNext, onBack, nextLabel = "Next: T1 Question-wise →" }) {
  const [grid, setGrid] = useState([]);
  const [eseMaxMarks, setEseMaxMarks] = useState(75);
  const [thresholdPercent, setThresholdPercent] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const allocationId = context.allocation?._id;

  useEffect(() => {
    if (!allocationId) return;
    setLoading(true);
    setError("");
    api.get(`/ese/${allocationId}`)
      .then((res) => {
        setGrid(res.data.grid || []);
        setEseMaxMarks(Number(res.data.eseMaxMarks) || 75);
        setThresholdPercent(Number(res.data.thresholdMarksPercent) || 0);
      })
      .catch((err) => setError(err.response?.data?.message || "Failed to load ESE marks"))
      .finally(() => setLoading(false));
  }, [allocationId]);

  const summary = useMemo(
    () => calculateSummary(grid, eseMaxMarks, thresholdPercent),
    [grid, eseMaxMarks, thresholdPercent]
  );

  const thresholdMark = useMemo(
    () => Number(((eseMaxMarks * thresholdPercent) / 100).toFixed(2)),
    [eseMaxMarks, thresholdPercent]
  );

  if (loading) return <div className="loading-state">Loading ERP ESE marks...</div>;

  return (
    <section className="workflow-panel">
      <div className="section-heading-row">
        <div>
          <span className="section-kicker">STEP 04 · ERP MARK VERIFICATION</span>
          <h2>ESE Marks — {context.allocation?.paperCode}</h2>
          <p>
            End Semester Examination marks are fetched from ERP and are read-only for staff. Verify the values and continue.
          </p>
        </div>
        <span className="readonly-badge">ERP SYNC · READ ONLY</span>
      </div>

      <div className="readonly-metrics">
        <div className="metric-box">
          <span>ESE Maximum</span>
          <strong>{eseMaxMarks}</strong>
          <small>Configured paper maximum</small>
        </div>
        <div className="metric-box">
          <span>Threshold</span>
          <strong>{thresholdPercent}%</strong>
          <small>Mark ≥ {thresholdMark}/{eseMaxMarks}</small>
        </div>
        <div className="metric-box">
          <span>Students Appeared</span>
          <strong>{summary.appeared}</strong>
          <small>Valid ERP marks available</small>
        </div>
        <div className="metric-box">
          <span>Above Threshold</span>
          <strong>{summary.attainedPercent}%</strong>
          <small>{summary.attained} students</small>
        </div>
      </div>

      {error && <p className="alert-error mb-4">{error}</p>}
      {!error && summary.appeared === 0 && (
        <div className="admin-notice mb-5">
          <div className="admin-notice-icon">!</div>
          <div>
            <strong>No ESE marks are available yet.</strong>
            <p>Staff cannot enter or modify ESE marks here. Please verify the ERP data before continuing.</p>
          </div>
        </div>
      )}

      <div className="table-shell">
        <table className="pro-table">
          <thead>
            <tr>
              <th>Paper Code</th>
              <th>Roll No</th>
              <th className="text-left">Student Name</th>
              <th>ESE / {eseMaxMarks}</th>
              <th>Threshold Status</th>
            </tr>
          </thead>
          <tbody>
            {grid.map((row) => {
              const hasMark = row.obtained !== "" && row.obtained !== null && row.obtained !== undefined;
              const mark = hasMark ? Number(row.obtained) : null;
              const valid = mark !== null && Number.isFinite(mark) && mark >= 0 && mark <= eseMaxMarks;
              const attained = valid && mark >= thresholdMark;
              return (
                <tr key={row.student._id}>
                  <td className="font-semibold text-slate-500">{context.allocation?.paperCode}</td>
                  <td className="font-medium">{row.student.regNo}</td>
                  <td className="!text-left">{row.student.name}</td>
                  <td>
                    <span className={`readonly-mark ${!hasMark ? "is-empty" : !valid ? "is-invalid" : ""}`}>
                      {hasMark ? row.obtained : "—"}
                    </span>
                  </td>
                  <td>
                    {!hasMark ? (
                      <span className="status-chip status-neutral">Pending</span>
                    ) : !valid ? (
                      <span className="status-chip status-danger">Invalid</span>
                    ) : attained ? (
                      <span className="status-chip status-success">✓ Above</span>
                    ) : (
                      <span className="status-chip status-warning">Below</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {grid.length === 0 && (
              <tr><td colSpan={5} className="py-10 text-slate-400">No student roster found for this allocation.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid sm:grid-cols-1 gap-3 text-sm">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-slate-500">Outcome Level Achieved</span>
          <strong className="block text-xl text-slate-900 mt-1">{summary.outcomeLevel} / 3</strong>
        </div>
      </div>

      {summary.invalidCount > 0 && (
        <p className="alert-error mt-4">
          {summary.invalidCount} ESE mark{summary.invalidCount > 1 ? "s are" : " is"} outside the configured 0–{eseMaxMarks} range and excluded from attainment.
        </p>
      )}

      <div className="workflow-actions">
        <button onClick={onBack} className="btn btn-ghost">← Back</button>
        <button onClick={onNext} disabled={!!error || summary.appeared === 0 || summary.invalidCount > 0} className="btn btn-primary">
          {nextLabel}
        </button>
      </div>
    </section>
  );
}
