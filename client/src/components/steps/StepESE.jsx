import React, { useEffect, useState } from "react";
import api from "../../api/axios";

export default function StepESE({ context, onNext, onBack }) {
  const [grid, setGrid] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const allocationId = context.allocation?._id;

  function load() {
    setLoading(true);
    api.get(`/ese/${allocationId}`).then((res) => {
      setGrid(res.data.grid);
      setSummary(res.data.summary);
      setLoading(false);
    });
  }

  useEffect(() => {
    if (allocationId) load();
    // eslint-disable-next-line
  }, [allocationId]);

  function updateMark(idx, field, value) {
    setGrid((g) => {
      const copy = [...g];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  }

  async function saveAll() {
    setSaving(true);
    setMessage("");
    try {
      const entries = grid.map((g) => ({ studentId: g.student._id, obtained: g.obtained, max: g.max || 100 }));
      await api.post(`/ese/${allocationId}/bulk`, { entries });
      setMessage("ESE marks saved successfully.");
      load();
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to save marks");
    } finally {
      setSaving(false);
    }
  }

  async function uploadExcel(e) {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    setSaving(true);
    try {
      const res = await api.post(`/ese/${allocationId}/upload`, form, { headers: { "Content-Type": "multipart/form-data" } });
      setMessage(`Uploaded: ${res.data.updated} updated, ${res.data.skipped} skipped`);
      load();
    } catch (err) {
      setMessage(err.response?.data?.message || "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Loading ESE sheet...</div>;

  return (
    <div className="bg-white rounded-xl shadow-card p-6 mt-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-brand">ESE Marks Entry — {context.allocation?.paperCode}</h2>
        <label className="text-sm bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg cursor-pointer">
          Bulk Upload (Excel)
          <input type="file" accept=".xlsx,.xls,.csv" onChange={uploadExcel} className="hidden" />
        </label>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Excel columns expected: <code>Roll No</code>, <code>Name</code> (for reference), <code>ESE</code> (score), optional <code>Max</code> (defaults to 100).
      </p>

      <div className="overflow-x-auto">
        <table className="pro-table">
          <thead>
            <tr className="bg-blue-600 text-white">
              <th className="p-2 border">Paper code</th>
              <th className="p-2 border">Roll No</th>
              <th className="p-2 border">Name</th>
              <th className="p-2 border">ESE</th>
            </tr>
          </thead>
          <tbody>
            {grid.map((row, idx) => (
              <tr key={row.student._id} className="border-b">
                <td className="p-2 border text-center text-gray-500">{context.allocation?.paperCode}</td>
                <td className="p-2 border text-center">{row.student.regNo}</td>
                <td className="p-2 border">{row.student.name}</td>
                <td className="border p-1">
                  <input
                    type="number"
                    className="w-24 border rounded px-2 py-1 text-center"
                    value={row.obtained}
                    onChange={(e) => updateMark(idx, "obtained", e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {summary && (
        <div className="mt-5 bg-blue-50 rounded-lg overflow-hidden text-sm">
          <div className="grid grid-cols-2 border-b border-blue-100">
            <div className="p-2.5 font-medium text-gray-700">Total number of Students Appeared</div>
            <div className="p-2.5 text-center font-semibold">{summary.appeared}</div>
          </div>
          <div className="grid grid-cols-2 border-b border-blue-100">
            <div className="p-2.5 font-medium text-gray-700">Number of Students Scored above Threshold Value</div>
            <div className="p-2.5 text-center font-semibold">{summary.attained}</div>
          </div>
          <div className="grid grid-cols-2 border-b border-blue-100">
            <div className="p-2.5 font-medium text-gray-700">Percentage of Students Scored above Threshold Value</div>
            <div className="p-2.5 text-center font-semibold">{summary.attainedPercent}%</div>
          </div>
          <div className="grid grid-cols-2">
            <div className="p-2.5 font-medium text-gray-700">Outcome Level Achieved on a Scale of 3</div>
            <div className="p-2.5 text-center font-semibold text-brand">{summary.outcomeLevel}</div>
          </div>
        </div>
      )}

      {message && <p className="text-sm text-brand mt-3">{message}</p>}

      <div className="flex justify-between mt-6">
        <button onClick={onBack} className="btn btn-ghost">← Back</button>
        <div className="flex gap-3">
          <button onClick={saveAll} disabled={saving} className="btn btn-accent">
            {saving ? "Saving..." : "Save Marks"}
          </button>
          <button onClick={onNext} className="btn btn-primary">
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
