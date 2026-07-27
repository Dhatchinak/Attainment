import React, { useEffect, useState } from "react";
import api from "../../api/axios";

export default function StepSettings({ context, onNext, onBack }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const allocationId = context.allocation?._id;

  useEffect(() => {
    if (!allocationId) return;
    api.get(`/settings/${allocationId}`)
      .then((res) => setSettings(res.data))
      .catch((err) => setError(err.response?.data?.message || "Failed to load threshold settings"))
      .finally(() => setLoading(false));
  }, [allocationId]);

  if (loading) return <div className="loading-state">Loading threshold settings...</div>;

  return (
    <section className="workflow-panel">
      <div className="section-heading-row">
        <div>
          <span className="section-kicker">STEP 03 · ADMIN CONTROLLED</span>
          <h2>Threshold Settings</h2>
          <p>These values are fixed by the administrator and are shown here for reference.</p>
        </div>
        <span className={`status-chip ${settings?.configuredByAdmin ? "status-success" : "status-warning"}`}>
          {settings?.configuredByAdmin ? "✓ Fixed by admin" : "Awaiting admin setup"}
        </span>
      </div>

      {error && <p className="alert-error mb-5">{error}</p>}
      {!error && settings && (
        <>
          {!settings.configuredByAdmin && (
            <div className="admin-notice mb-6">
              <div className="admin-notice-icon">!</div>
              <div><strong>Thresholds are not yet confirmed.</strong><p>The administrator must save the values for this paper before mark entry can continue.</p></div>
            </div>
          )}

          <div className="readonly-metrics">
            <div className="metric-box"><span>Marks Threshold</span><strong>{settings.thresholdMarksPercent}%</strong><small>Minimum score required for attainment</small></div>
            <div className="metric-box"><span>Target</span><strong>{settings.targetPercent}%</strong><small>Expected students crossing threshold</small></div>
            <div className="metric-box"><span>CIA Weight</span><strong>{settings.internalWeight}%</strong><small>Internal assessment contribution</small></div>
            <div className="metric-box"><span>ESE Weight</span><strong>{settings.externalWeight}%</strong><small>External examination contribution</small></div>
          </div>

          <div className="subsection-title"><div><h3>CIA Components</h3><p>Configured centrally by the administrator.</p></div><span className="readonly-badge">VIEW ONLY</span></div>
          <div className="table-shell">
            <table className="pro-table">
              <thead><tr><th>Column Key</th><th>Label</th><th>CO Range</th><th>Maximum Marks</th></tr></thead>
              <tbody>{settings.ciaComponents?.map((c, idx) => <tr key={`${c.key}-${idx}`}><td className="font-semibold">{c.key}</td><td>{c.label}</td><td>CO{c.coStart} – CO{c.coEnd}</td><td>{c.maxMarks}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}

      <div className="workflow-actions"><button onClick={onBack} className="btn btn-ghost">← Back</button><button onClick={onNext} disabled={!settings?.configuredByAdmin} className="btn btn-primary">Next →</button></div>
    </section>
  );
}
