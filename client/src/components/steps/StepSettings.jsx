import React, { useEffect, useState } from "react";
import api from "../../api/axios";

const DEFAULT_COMPONENTS = [
  { key: "T1", label: "T1", coStart: 1, coEnd: 3, maxMarks: 20 },
  { key: "T2", label: "T2", coStart: 4, coEnd: 6, maxMarks: 20 },
  { key: "Seminar", label: "Seminar", coStart: 1, coEnd: 6, maxMarks: 10 },
  { key: "Assignment", label: "Assignment", coStart: 1, coEnd: 6, maxMarks: 10 },
  { key: "Innovative", label: "Innovative", coStart: 1, coEnd: 6, maxMarks: 10 },
];

export default function StepSettings({ context, onNext, onBack }) {
  const allocationId = context.allocation?._id;
  const [form, setForm] = useState({
    thresholdMarksPercent: 50,
    targetPercent: 70,
    internalWeight: 25,
    externalWeight: 75,
    ciaComponents: DEFAULT_COMPONENTS,
  });
  const [configured, setConfigured] = useState(false);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!allocationId) return;
    setLoading(true);
    api.get(`/settings/${allocationId}`)
      .then((res) => {
        const data = res.data;
        setForm({
          thresholdMarksPercent: data.thresholdMarksPercent ?? 50,
          targetPercent: data.targetPercent ?? 70,
          internalWeight: data.internalWeight ?? 25,
          externalWeight: data.externalWeight ?? 75,
          ciaComponents: data.ciaComponents?.length ? data.ciaComponents : DEFAULT_COMPONENTS,
        });
        setConfigured(Boolean(data.configuredByStaff || data.configuredByAdmin));
        setLocked(Boolean(data.isLocked));
      })
      .catch((err) => setError(err.response?.data?.message || "Failed to load threshold settings"))
      .finally(() => setLoading(false));
  }, [allocationId]);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: Number(value) }));
  }

  function setInternal(value) {
    const internalWeight = Math.max(0, Math.min(100, Number(value)));
    setForm((current) => ({ ...current, internalWeight, externalWeight: 100 - internalWeight }));
  }

  function updateComponent(index, field, value) {
    setForm((current) => ({
      ...current,
      ciaComponents: current.ciaComponents.map((component, componentIndex) =>
        componentIndex === index
          ? { ...component, [field]: ["key", "label"].includes(field) ? value : Number(value) }
          : component
      ),
    }));
  }

  function addComponent() {
    setForm((current) => ({
      ...current,
      ciaComponents: [
        ...current.ciaComponents,
        {
          key: `Comp${current.ciaComponents.length + 1}`,
          label: `Component ${current.ciaComponents.length + 1}`,
          coStart: 1,
          coEnd: 1,
          maxMarks: 10,
        },
      ],
    }));
  }

  function removeComponent(index) {
    setForm((current) => ({
      ...current,
      ciaComponents: current.ciaComponents.filter((_, componentIndex) => componentIndex !== index),
    }));
  }

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await api.post(`/settings/${allocationId}`, form);
      setConfigured(Boolean(response.data.configuredByStaff || response.data.configuredByAdmin));
      setLocked(Boolean(response.data.isLocked));
      setMessage("Threshold settings saved successfully. You can continue to the Student List.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save threshold settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading-state">Loading threshold settings...</div>;

  return (
    <section className="workflow-panel">
      <div className="section-heading-row">
        <div>
          <span className="section-kicker">STEP 03 · STAFF CONFIGURATION</span>
          <h2>Set Thresholds</h2>
          <p>Set the threshold, target, CIA/ESE weight and CIA components for this selected paper.</p>
        </div>
        <span className={`status-chip ${configured ? "status-success" : "status-warning"}`}>
          {configured ? "✓ Saved by staff" : "Not yet saved"}
        </span>
      </div>

      {locked && (
        <div className="admin-notice mb-6">
          <div className="admin-notice-icon">!</div>
          <div>
            <strong>Settings are locked.</strong>
            <p>Marks entry has already started, so these values cannot be changed.</p>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-4 gap-4 my-6">
        <label className="admin-field">
          <span>Marks Threshold %</span>
          <input disabled={locked} type="number" min="0" max="100" className="input-field" value={form.thresholdMarksPercent} onChange={(e) => setField("thresholdMarksPercent", e.target.value)} />
          <small>Minimum score required for attainment</small>
        </label>
        <label className="admin-field">
          <span>Target %</span>
          <input disabled={locked} type="number" min="1" max="100" className="input-field" value={form.targetPercent} onChange={(e) => setField("targetPercent", e.target.value)} />
          <small>Expected percentage of students</small>
        </label>
        <label className="admin-field">
          <span>CIA Weight %</span>
          <input disabled={locked} type="number" min="0" max="100" className="input-field" value={form.internalWeight} onChange={(e) => setInternal(e.target.value)} />
          <small>Internal assessment contribution</small>
        </label>
        <label className="admin-field">
          <span>ESE Weight %</span>
          <input disabled className="input-field" value={form.externalWeight} />
          <small>Automatically balances to 100%</small>
        </label>
      </div>

      <div className="subsection-title">
        <div>
          <h3>CIA Components</h3>
          <p>These columns are used during CIA mark entry and Excel upload.</p>
        </div>
        {!locked && <button type="button" className="inline-action" onClick={addComponent}>＋ Add component</button>}
      </div>

      <div className="table-shell">
        <table className="pro-table">
          <thead><tr><th>Column Key</th><th>Label</th><th>CO Start</th><th>CO End</th><th>Maximum Marks</th><th>Action</th></tr></thead>
          <tbody>
            {form.ciaComponents.map((component, index) => (
              <tr key={`${component.key}-${index}`}>
                <td><input disabled={locked} className="table-input" value={component.key} onChange={(e) => updateComponent(index, "key", e.target.value)} /></td>
                <td><input disabled={locked} className="table-input" value={component.label} onChange={(e) => updateComponent(index, "label", e.target.value)} /></td>
                <td><input disabled={locked} type="number" min="1" className="table-input compact" value={component.coStart} onChange={(e) => updateComponent(index, "coStart", e.target.value)} /></td>
                <td><input disabled={locked} type="number" min="1" className="table-input compact" value={component.coEnd} onChange={(e) => updateComponent(index, "coEnd", e.target.value)} /></td>
                <td><input disabled={locked} type="number" min="1" className="table-input compact" value={component.maxMarks} onChange={(e) => updateComponent(index, "maxMarks", e.target.value)} /></td>
                <td>{!locked ? <button type="button" className="table-action danger" onClick={() => removeComponent(index)}>Remove</button> : <span className="readonly-badge">LOCKED</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="alert-error mt-4">{error}</p>}
      {message && <p className="alert-success mt-4">{message}</p>}

      <div className="workflow-actions">
        <button onClick={onBack} className="btn btn-ghost">← Back</button>
        <div className="flex gap-3">
          {!locked && <button onClick={save} disabled={saving} className="btn btn-secondary">{saving ? "Saving..." : "Save Thresholds"}</button>}
          <button onClick={onNext} disabled={!configured} className="btn btn-primary">Next →</button>
        </div>
      </div>
    </section>
  );
}
