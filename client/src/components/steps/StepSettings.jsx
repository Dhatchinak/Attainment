import React, { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";

const QUESTION_DEFAULT_COMPONENTS = [
  { key: "T1", label: "T1 Question-wise", coStart: 1, coEnd: 3, maxMarks: 50 },
  { key: "Assignment", label: "Assignment", coStart: 1, coEnd: 3, maxMarks: 10 },
  { key: "T2", label: "T2 Question-wise", coStart: 4, coEnd: 6, maxMarks: 50 },
  { key: "Seminar", label: "Seminar", coStart: 4, coEnd: 6, maxMarks: 10 },
  { key: "Innovative", label: "Innovative", coStart: 1, coEnd: 6, maxMarks: 10 },
];

const LEGACY_DEFAULT_COMPONENTS = [
  { key: "T1", label: "T1", coStart: 1, coEnd: 3, maxMarks: 50 },
  { key: "Assignment", label: "Assignment", coStart: 1, coEnd: 3, maxMarks: 10 },
  { key: "T2", label: "T2", coStart: 4, coEnd: 6, maxMarks: 50 },
  { key: "Seminar", label: "Seminar", coStart: 4, coEnd: 6, maxMarks: 10 },
  { key: "Innovative", label: "Innovative", coStart: 1, coEnd: 6, maxMarks: 10 },
];

function defaultsForMode(questionWise) {
  return questionWise ? QUESTION_DEFAULT_COMPONENTS : LEGACY_DEFAULT_COMPONENTS;
}

function normalizeComponentsForMode(components, questionWise) {
  return (components || []).map((component) => {
    const key = String(component.key || "").toUpperCase();
    if (!questionWise && key === "T1") return { ...component, label: "T1" };
    if (!questionWise && key === "T2") return { ...component, label: "T2" };
    return component;
  });
}

export default function StepSettings({ context, onNext, onBack, questionWise = true }) {
  const allocationId = context.allocation?._id;
  const [form, setForm] = useState({
    thresholdMarksPercent: 50,
    targetPercent: 70,
    internalWeight: 25,
    externalWeight: 75,
    eseMaxMarks: 75,
    ciaComponents: defaultsForMode(questionWise),
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
        const components = data.ciaComponents?.length ? data.ciaComponents : defaultsForMode(questionWise);
        setForm({
          thresholdMarksPercent: data.thresholdMarksPercent ?? 50,
          targetPercent: data.targetPercent ?? 70,
          internalWeight: data.internalWeight ?? 25,
          externalWeight: data.externalWeight ?? 75,
          eseMaxMarks: data.eseMaxMarks ?? 75,
          ciaComponents: normalizeComponentsForMode(components, questionWise),
        });
        setConfigured(Boolean(data.configuredByStaff || data.configuredByAdmin));
        setLocked(Boolean(data.isLocked));
      })
      .catch((err) => setError(err.response?.data?.message || "Failed to load threshold settings"))
      .finally(() => setLoading(false));
  }, [allocationId, questionWise]);

  const componentRows = useMemo(
    () => form.ciaComponents
      .map((component, index) => ({ ...component, originalIndex: index }))
      .filter((component) => !questionWise || !["T1", "T2"].includes(String(component.key || "").toUpperCase())),
    [form.ciaComponents, questionWise]
  );

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

  function addActivity() {
    setForm((current) => ({
      ...current,
      ciaComponents: [
        ...current.ciaComponents,
        {
          key: `Activity${current.ciaComponents.length + 1}`,
          label: "Other CIA Activity",
          coStart: 1,
          coEnd: 6,
          maxMarks: 10,
        },
      ],
    }));
  }

  function removeActivity(index) {
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
      setMessage(questionWise
        ? "Thresholds and CIA activity mapping saved. Continue to ESE verification."
        : "Thresholds and legacy CIA component mapping saved. Continue to ESE verification.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save threshold settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading-state">Loading attainment settings...</div>;

  const mainInternalWeight = Number((form.internalWeight * 0.9).toFixed(2));
  const innovativeWeight = Number((form.internalWeight * 0.1).toFixed(2));

  return (
    <section className="workflow-panel">
      <div className="section-heading-row">
        <div>
          <span className="section-kicker">STEP 03 · ATTAINMENT RULES</span>
          <h2>{questionWise ? "Thresholds & CIA Activity Mapping" : "Thresholds & Legacy CIA Mapping"}</h2>
          <p>
            {questionWise
              ? "For 2025-2026 and 2026-2027, T1/T2 are calculated question-wise. Question → CO mapping comes from the imported CIA workbook."
              : "For older academic years, the existing component-total CIA method is retained. T1/T2 and activities are treated as component totals, not question-wise data."}
          </p>
        </div>
        <span className={`status-chip ${configured ? "status-success" : "status-warning"}`}>
          {configured ? "✓ Saved" : "Needs setup"}
        </span>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 mt-5">
        <div className="font-semibold text-slate-800 mb-1">How this paper will be calculated</div>
        {questionWise ? (
          <p className="text-sm text-slate-600 leading-6">
            T1 and T2 are calculated question-wise by CO. Seminar and Assignment are included as regular CIA evidence. Innovative is kept separately. With CIA {form.internalWeight}% and ESE {form.externalWeight}%, the final split is <strong>{mainInternalWeight}% main CIA + {innovativeWeight}% Innovative + {form.externalWeight}% ESE</strong>.
          </p>
        ) : (
          <p className="text-sm text-slate-600 leading-6">
            Each CIA component is converted to an attainment level using the configured threshold and target. Components mapped to the same CO are averaged, then combined as <strong>CIA {form.internalWeight}% + ESE {form.externalWeight}%</strong>.
          </p>
        )}
      </div>

      {locked && (
        <div className="admin-notice mt-5">
          <div className="admin-notice-icon">!</div>
          <div>
            <strong>Settings are locked after calculation.</strong>
            <p>This keeps the final report reproducible. Reopen through an administrator if the institutional formula itself changes.</p>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-5 gap-4 my-6">
        <label className="admin-field">
          <span>Marks Threshold %</span>
          <input disabled={locked} type="number" min="0" max="100" className="input-field" value={form.thresholdMarksPercent} onChange={(e) => setField("thresholdMarksPercent", e.target.value)} />
          <small>Minimum mark percentage for a student to attain a question/component</small>
        </label>
        <label className="admin-field">
          <span>Target Students %</span>
          <input disabled={locked} type="number" min="1" max="100" className="input-field" value={form.targetPercent} onChange={(e) => setField("targetPercent", e.target.value)} />
          <small>Used to convert class attainment into level 0–3</small>
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
        <label className="admin-field">
          <span>ESE Maximum Mark</span>
          <input disabled={locked} type="number" min="1" className="input-field" value={form.eseMaxMarks} onChange={(e) => setField("eseMaxMarks", e.target.value)} />
          <small>ESE remains ERP/read-only in both workflows</small>
        </label>
      </div>

      <div className="subsection-title">
        <div>
          <h3>{questionWise ? "CIA Activities → CO Mapping" : "CIA Components → CO Mapping"}</h3>
          <p>
            {questionWise
              ? "T1/T2 mappings come from the CIA workbook. Configure only non-test CIA activity coverage here."
              : "Older batches use these component totals directly in CIA attainment. Configure each component maximum and CO coverage."}
          </p>
        </div>
        {!locked && <button type="button" className="inline-action" onClick={addActivity}>＋ Add component</button>}
      </div>

      <div className="table-shell">
        <table className="pro-table">
          <thead>
            <tr>
              <th>Component Key</th>
              <th>Display Name</th>
              <th>CO From</th>
              <th>CO To</th>
              {!questionWise && <th>Max Mark</th>}
              <th>Mark Source</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {componentRows.map((component) => (
              <tr key={`${component.key}-${component.originalIndex}`}>
                <td><input disabled={locked} className="table-input" value={component.key} onChange={(e) => updateComponent(component.originalIndex, "key", e.target.value)} /></td>
                <td><input disabled={locked} className="table-input" value={component.label} onChange={(e) => updateComponent(component.originalIndex, "label", e.target.value)} /></td>
                <td><input disabled={locked} type="number" min="1" className="table-input compact" value={component.coStart} onChange={(e) => updateComponent(component.originalIndex, "coStart", e.target.value)} /></td>
                <td><input disabled={locked} type="number" min="1" className="table-input compact" value={component.coEnd} onChange={(e) => updateComponent(component.originalIndex, "coEnd", e.target.value)} /></td>
                {!questionWise && <td><input disabled={locked} type="number" min="1" className="table-input compact" value={component.maxMarks} onChange={(e) => updateComponent(component.originalIndex, "maxMarks", e.target.value)} /></td>}
                <td><span className="readonly-badge">{questionWise ? "CIA WORKBOOK" : "ADMIN CIA"}</span></td>
                <td>{!locked ? <button type="button" className="table-action danger" onClick={() => removeActivity(component.originalIndex)}>Remove</button> : <span className="readonly-badge">LOCKED</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 mt-4 text-sm text-slate-600">
        {questionWise ? (
          <>Recommended reference mapping: <strong>Assignment → CO1–CO3</strong>, <strong>Seminar → CO4–CO6</strong>, <strong>Innovative → CO1–CO6</strong>.</>
        ) : (
          <>Legacy workflow keeps the existing component-total method. T1/T2 are <strong>not</strong> converted to question-wise attainment for academic years before 2025-2026.</>
        )}
      </div>

      {error && <p className="alert-error mt-4">{error}</p>}
      {message && <p className="alert-success mt-4">{message}</p>}

      <div className="workflow-actions">
        <button onClick={onBack} className="btn btn-ghost">← Back</button>
        <div className="flex gap-3">
          {!locked && <button onClick={save} disabled={saving} className="btn btn-secondary">{saving ? "Saving..." : "Save Settings"}</button>}
          <button onClick={onNext} disabled={!configured} className="btn btn-primary">Next: ESE Verification →</button>
        </div>
      </div>
    </section>
  );
}
