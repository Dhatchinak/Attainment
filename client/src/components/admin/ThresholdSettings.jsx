import React, { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";

const DEFAULT_COMPONENTS = [
  { key: "T1", label: "T1", coStart: 1, coEnd: 3, maxMarks: 20 },
  { key: "T2", label: "T2", coStart: 4, coEnd: 6, maxMarks: 20 },
  { key: "Seminar", label: "Seminar", coStart: 1, coEnd: 6, maxMarks: 10 },
  { key: "Assignment", label: "Assignment", coStart: 1, coEnd: 6, maxMarks: 10 },
  { key: "Innovative", label: "Innovative", coStart: 1, coEnd: 6, maxMarks: 10 },
];

export default function ThresholdSettings() {
  const [years, setYears] = useState([]);
  const [year, setYear] = useState("");
  const [allocations, setAllocations] = useState([]);
  const [allocationId, setAllocationId] = useState("");
  const [form, setForm] = useState({ thresholdMarksPercent: 50, targetPercent: 70, internalWeight: 25, externalWeight: 75, ciaComponents: DEFAULT_COMPONENTS });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { api.get("/admin/academic-years").then((r) => { setYears(r.data); if (r.data[0]) setYear(r.data[0]._id); }); }, []);
  useEffect(() => { if (!year) return; api.get("/admin/allocations", { params: { academicYear: year } }).then((r) => { setAllocations(r.data); setAllocationId(r.data[0]?._id || ""); }); }, [year]);
  useEffect(() => {
    if (!allocationId) return;
    setLoading(true); setError(""); setMessage("");
    api.get(`/settings/${allocationId}`).then((r) => setForm({
      thresholdMarksPercent: r.data.thresholdMarksPercent ?? 50,
      targetPercent: r.data.targetPercent ?? 70,
      internalWeight: r.data.internalWeight ?? 25,
      externalWeight: r.data.externalWeight ?? 75,
      ciaComponents: r.data.ciaComponents?.length ? r.data.ciaComponents : DEFAULT_COMPONENTS,
    })).catch((e) => setError(e.response?.data?.message || "Unable to load settings. The matrix may need to be submitted first."))
      .finally(() => setLoading(false));
  }, [allocationId]);

  const selected = useMemo(() => allocations.find((a) => a._id === allocationId), [allocations, allocationId]);
  function setField(field, value) { setForm((f) => ({ ...f, [field]: Number(value) })); }
  function setInternal(value) { const n = Math.max(0, Math.min(100, Number(value))); setForm((f) => ({ ...f, internalWeight: n, externalWeight: 100 - n })); }
  function updateComponent(index, field, value) { setForm((f) => ({ ...f, ciaComponents: f.ciaComponents.map((c, i) => i === index ? { ...c, [field]: ["key", "label"].includes(field) ? value : Number(value) } : c) })); }
  function addComponent() { setForm((f) => ({ ...f, ciaComponents: [...f.ciaComponents, { key: `Comp${f.ciaComponents.length + 1}`, label: `Component ${f.ciaComponents.length + 1}`, coStart: 1, coEnd: 1, maxMarks: 10 }] })); }
  function removeComponent(index) { setForm((f) => ({ ...f, ciaComponents: f.ciaComponents.filter((_, i) => i !== index) })); }

  async function save() {
    setSaving(true); setError(""); setMessage("");
    try { await api.post(`/settings/${allocationId}`, form); setMessage("Threshold settings fixed successfully. Staff can now continue to Student List."); }
    catch (e) { setError(e.response?.data?.message || "Failed to save threshold settings"); }
    finally { setSaving(false); }
  }

  return <section className="admin-panel">
    <div className="section-heading-row"><div><span className="section-kicker">CENTRAL CONFIGURATION</span><h2>Threshold Settings</h2><p>Fix the attainment threshold, CIA/ESE weight and CIA components for each allocated paper.</p></div><span className="status-chip status-admin">Admin only</span></div>
    <div className="admin-filter-bar">
      <div><label>Academic Year</label><select className="input-field" value={year} onChange={(e) => setYear(e.target.value)}>{years.map((y) => <option key={y._id} value={y._id}>{y.year}</option>)}</select></div>
      <div className="flex-1"><label>Course Allocation</label><select className="input-field w-full" value={allocationId} onChange={(e) => setAllocationId(e.target.value)}><option value="">Select a paper</option>{allocations.map((a) => <option key={a._id} value={a._id}>{a.paperCode} — {a.paperName} · Sem {a.semester} · {a.batch?.displayName}</option>)}</select></div>
    </div>
    {selected && <div className="selected-paper"><strong>{selected.paperCode}</strong><span>{selected.paperName}</span><small>{selected.batch?.displayName} · Semester {selected.semester} · Staff ID {selected.staff_id}</small></div>}
    {loading ? <div className="loading-state">Loading settings...</div> : allocationId && <>
      <div className="grid md:grid-cols-4 gap-4 my-6">
        <label className="admin-field"><span>Marks Threshold %</span><input type="number" className="input-field" value={form.thresholdMarksPercent} onChange={(e) => setField("thresholdMarksPercent", e.target.value)} /><small>Student score needed to attain</small></label>
        <label className="admin-field"><span>Target %</span><input type="number" className="input-field" value={form.targetPercent} onChange={(e) => setField("targetPercent", e.target.value)} /><small>Expected percentage of students</small></label>
        <label className="admin-field"><span>CIA Weight %</span><input type="number" min="0" max="100" className="input-field" value={form.internalWeight} onChange={(e) => setInternal(e.target.value)} /><small>Internal contribution</small></label>
        <label className="admin-field"><span>ESE Weight %</span><input disabled className="input-field" value={form.externalWeight} /><small>Automatically balances to 100%</small></label>
      </div>
      <div className="subsection-title"><div><h3>CIA Components</h3><p>These columns will be used during CIA mark entry and Excel upload.</p></div><button className="inline-action" onClick={addComponent}>＋ Add component</button></div>
      <div className="table-shell"><table className="pro-table"><thead><tr><th>Column Key</th><th>Label</th><th>CO Start</th><th>CO End</th><th>Max Marks</th><th>Action</th></tr></thead><tbody>{form.ciaComponents.map((c, i) => <tr key={i}><td><input className="table-input" value={c.key} onChange={(e) => updateComponent(i, "key", e.target.value)} /></td><td><input className="table-input" value={c.label} onChange={(e) => updateComponent(i, "label", e.target.value)} /></td><td><input type="number" className="table-input compact" value={c.coStart} onChange={(e) => updateComponent(i, "coStart", e.target.value)} /></td><td><input type="number" className="table-input compact" value={c.coEnd} onChange={(e) => updateComponent(i, "coEnd", e.target.value)} /></td><td><input type="number" className="table-input compact" value={c.maxMarks} onChange={(e) => updateComponent(i, "maxMarks", e.target.value)} /></td><td><button className="table-action danger" onClick={() => removeComponent(i)}>Remove</button></td></tr>)}</tbody></table></div>
      {error && <p className="alert-error mt-4">{error}</p>}{message && <p className="alert-success mt-4">{message}</p>}
      <div className="flex justify-end mt-6"><button onClick={save} disabled={saving} className="btn btn-primary">{saving ? "Saving..." : "Save & Fix Thresholds"}</button></div>
    </>}
  </section>;
}
