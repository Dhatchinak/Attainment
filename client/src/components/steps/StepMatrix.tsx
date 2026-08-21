import React, { useEffect, useState } from "react";
import api from "../../api/axios";

const PO_COUNT = 12;
const PSO_COUNT = 2;
const LEVEL_TO_NUMBER = { "-": 0, L: 1, M: 2, H: 3 };
const NUMBER_TO_LEVEL = { 0: "-", 1: "L", 2: "M", 3: "H" };

function emptyRow(n) {
  return { co: `CO${n}`, description: "", po: Array(PO_COUNT).fill(0), pso: Array(PSO_COUNT).fill(0) };
}

export default function StepMatrix({ context, onNext, onBack }) {
  const [rows, setRows] = useState([emptyRow(1)]);
  const [locked, setLocked] = useState(false);
  const [editable, setEditable] = useState(true);
  const [submittedBy, setSubmittedBy] = useState("");
  const [submittedByName, setSubmittedByName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const allocationId = context.allocation?._id;

  useEffect(() => {
    if (!allocationId) return;
    api.get(`/matrix/${allocationId}`).then((res) => {
      const data = res.data;
      if (data.exists && data.rows?.length) {
        setRows(data.rows); setLocked(data.isLocked); setEditable(data.isEditableByMe);
        setSubmittedBy(data.submittedBy); setSubmittedByName(data.submittedByName || data.submittedBy);
      }
    }).catch((err) => setError(err.response?.data?.message || "Failed to load matrix"))
      .finally(() => setLoading(false));
  }, [allocationId]);

  function addRow() { setRows((r) => [...r, emptyRow(r.length + 1)]); }
  function removeRow(idx) { setRows((r) => r.filter((_, i) => i !== idx).map((row, i) => ({ ...row, co: `CO${i + 1}` }))); }
  function updateCell(rowIdx, type, colIdx, level) {
    setRows((r) => r.map((row, i) => i !== rowIdx ? row : { ...row, [type]: row[type].map((v, j) => j === colIdx ? LEVEL_TO_NUMBER[level] : v) }));
  }
  function updateText(rowIdx, field, value) { setRows((r) => r.map((row, i) => i === rowIdx ? { ...row, [field]: value } : row)); }

  async function submitMatrix() {
    setSaving(true); setError(""); setMessage("");
    try {
      const res = await api.post(`/matrix/${allocationId}`, { rows, poCount: PO_COUNT, psoCount: PSO_COUNT });
      setLocked(true); setSubmittedByName(res.data.submittedByName || "");
      setMessage("Matrix submitted and locked successfully.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save matrix");
      if (err.response?.data?.submittedByName) { setSubmittedByName(err.response.data.submittedByName); setLocked(true); }
    } finally { setSaving(false); }
  }

  if (loading) return <div className="loading-state">Loading matrix...</div>;
  const readOnly = locked && !editable;

  return (
    <section className="workflow-panel">
      <div className="section-heading-row">
        <div>
          <span className="section-kicker">STEP 02 · COURSE MAPPING</span>
          <h2>CO–PO–PSO Mapping Matrix</h2>
          <p>{context.allocation?.paperCode} · {context.allocation?.paperName}</p>
        </div>
        {locked && <span className={`status-chip ${readOnly ? "status-warning" : "status-success"}`}>{readOnly ? `Locked by ${submittedByName || submittedBy}` : "✓ Matrix locked"}</span>}
      </div>

      <div className="mapping-legend">
        <strong>Mapping levels</strong>
        <span><b>L</b> Low · 1</span><span><b>M</b> Medium · 2</span><span><b>H</b> High · 3</span><span><b>–</b> No mapping · 0</span>
      </div>

      <div className="table-shell">
        <table className="matrix-table w-full">
          <thead><tr><th>CO</th><th className="min-w-[260px]">Course Outcome Description</th>
            {Array.from({ length: PO_COUNT }).map((_, i) => <th key={i}>PO{i + 1}</th>)}
            {Array.from({ length: PSO_COUNT }).map((_, i) => <th key={i}>PSO{i + 1}</th>)}
            {!readOnly && <th>Action</th>}
          </tr></thead>
          <tbody>{rows.map((row, rIdx) => <tr key={rIdx}>
            <td className="font-bold text-slate-900">{row.co}</td>
            <td><input value={row.description} onChange={(e) => updateText(rIdx, "description", e.target.value)} disabled={readOnly} placeholder={`Describe ${row.co}`} className="matrix-description" /></td>
            {row.po.map((val, cIdx) => <td key={cIdx}><select value={NUMBER_TO_LEVEL[val] ?? "-"} disabled={readOnly} onChange={(e) => updateCell(rIdx, "po", cIdx, e.target.value)} className={`matrix-level level-${NUMBER_TO_LEVEL[val] ?? "none"}`}><option value="-">–</option><option value="L">L</option><option value="M">M</option><option value="H">H</option></select></td>)}
            {row.pso.map((val, cIdx) => <td key={cIdx}><select value={NUMBER_TO_LEVEL[val] ?? "-"} disabled={readOnly} onChange={(e) => updateCell(rIdx, "pso", cIdx, e.target.value)} className={`matrix-level level-${NUMBER_TO_LEVEL[val] ?? "none"}`}><option value="-">–</option><option value="L">L</option><option value="M">M</option><option value="H">H</option></select></td>)}
            {!readOnly && <td><button onClick={() => removeRow(rIdx)} disabled={rows.length === 1} className="table-action danger">Remove</button></td>}
          </tr>)}</tbody>
        </table>
      </div>

      {!readOnly && <button onClick={addRow} className="inline-action mt-4">＋ Add another CO</button>}
      {error && <p className="alert-error mt-4">{error}</p>}{message && <p className="alert-success mt-4">{message}</p>}
      <div className="workflow-actions"><button onClick={onBack} className="btn btn-ghost">← Back</button><div className="flex gap-3">{!readOnly && !locked && <button onClick={submitMatrix} disabled={saving} className="btn btn-accent">{saving ? "Submitting..." : "Submit & Lock Matrix"}</button>}<button onClick={onNext} disabled={!locked} className="btn btn-primary">Next →</button></div></div>
    </section>
  );
}
