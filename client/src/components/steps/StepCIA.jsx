import React, { useEffect, useState } from "react";
import api from "../../api/axios";

export default function StepCIA({ context, onNext, onBack }) {
  const [components, setComponents] = useState([]);
  const [grid, setGrid] = useState([]);
  const [componentSummary, setComponentSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const allocationId = context.allocation?._id;

  function load() {
    setLoading(true);
    setError("");
    api
      .get(`/cia/${allocationId}`)
      .then((res) => {
        setComponents(res.data.components);
        setGrid(res.data.grid);
        setComponentSummary(res.data.componentSummary);
      })
      .catch((err) => setError(err.response?.data?.message || "Failed to load CIA sheet"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (allocationId) load();
    // eslint-disable-next-line
  }, [allocationId]);

  function updateMark(studentIdx, key, field, value) {
    const comp = components.find((c) => c.key === key);
    setGrid((g) => {
      const copy = [...g];
      const entry = { ...copy[studentIdx] };
      const existing = entry.componentMarks[key] || {};
      entry.componentMarks = {
        ...entry.componentMarks,
        [key]: {
          ...existing,
          [field]: Number(value) || 0,
          // Manual typing only ever sets "obtained" — make sure max is never left
          // blank/zero, or the summary stats below will silently ignore this entry.
          max: existing.max || comp?.maxMarks || 0,
        },
      };
      copy[studentIdx] = entry;
      return copy;
    });
  }

  async function saveAll() {
    setSaving(true);
    setMessage("");
    try {
      // Guarantee every component mark carries a valid max — whether it was just
      // typed, loaded from an older record that predates this fix, or anything
      // in between — by falling back to the component's configured maxMarks.
      const entries = grid.map((g) => {
        const fixedComponentMarks = {};
        components.forEach((c) => {
          const existing = g.componentMarks?.[c.key];
          const hasValue = existing && existing.obtained !== undefined && existing.obtained !== null && existing.obtained !== "";
          if (hasValue) {
            fixedComponentMarks[c.key] = {
              obtained: Number(existing.obtained) || 0,
              max: Number(existing.max) || c.maxMarks || 0,
            };
          }
        });
        return { studentId: g.student._id, componentMarks: fixedComponentMarks };
      });
      await api.post(`/cia/${allocationId}/bulk`, { entries });
      setMessage("CIA marks saved successfully.");
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
      const res = await api.post(`/cia/${allocationId}/upload`, form, { headers: { "Content-Type": "multipart/form-data" } });
      setMessage(`Uploaded: ${res.data.updated} updated, ${res.data.skipped} skipped`);
      load();
    } catch (err) {
      setMessage(err.response?.data?.message || "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Loading CIA sheet...</div>;

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-card p-6 mt-4">
        <p className="text-amber-600">{error}</p>
        <button onClick={onBack} className="mt-4 text-gray-500 px-4 py-2">← Back</button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-card p-6 mt-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-brand">Continuous Internal Assessment (CIA) Mark Entry</h2>
        <label className="text-sm bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg cursor-pointer">
          Bulk Upload (Excel)
          <input type="file" accept=".xlsx,.xls,.csv" onChange={uploadExcel} className="hidden" />
        </label>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Excel columns expected: <code>Roll No</code>, <code>Name</code> (for reference), then one column per component:{" "}
        {components.map((c) => <code key={c.key} className="mr-1">{c.key}</code>)}
      </p>

      <div className="overflow-x-auto">
        <table className="pro-table">
          <thead>
            <tr className="bg-blue-600 text-white">
              <th className="p-2 border">Paper Code</th>
              <th className="p-2 border">Roll No</th>
              <th className="p-2 border">Name</th>
              {components.map((c) => <th key={c.key} className="p-2 border">{c.label}</th>)}
            </tr>
            <tr className="bg-blue-50 text-xs text-gray-600">
              <th className="border"></th>
              <th className="border"></th>
              <th className="border"></th>
              {components.map((c) => (
                <th key={c.key} className="p-1 border font-normal">CO{c.coStart}-CO{c.coEnd}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, idx) => (
              <tr key={row.student._id} className="border-b">
                <td className="p-2 border text-center text-gray-500">{context.allocation?.paperCode}</td>
                <td className="p-2 border text-center">{row.student.regNo}</td>
                <td className="p-2 border">{row.student.name}</td>
                {components.map((c) => (
                  <td key={c.key} className="border p-1">
                    <input
                      type="number"
                      className="w-16 border rounded px-1 py-0.5 text-center"
                      value={row.componentMarks?.[c.key]?.obtained ?? ""}
                      onChange={(e) => updateMark(idx, c.key, "obtained", e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {componentSummary.length > 0 && (
        <div className="overflow-x-auto mt-5">
          <table className="pro-table">
            <thead>
              <tr className="bg-blue-50">
                <th className="p-2 border text-left"></th>
                {components.map((c) => <th key={c.key} className="p-2 border">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-2 border font-medium">Total number of Students Appeared</td>
                {componentSummary.map((c) => <td key={c.key} className="p-2 border text-center">{c.appeared}</td>)}
              </tr>
              <tr>
                <td className="p-2 border font-medium">Number of Students Scored above Threshold Value</td>
                {componentSummary.map((c) => <td key={c.key} className="p-2 border text-center">{c.attained}</td>)}
              </tr>
              <tr>
                <td className="p-2 border font-medium">Percentage of Students Scored above Threshold Value</td>
                {componentSummary.map((c) => <td key={c.key} className="p-2 border text-center">{c.attainedPercent}%</td>)}
              </tr>
              <tr>
                <td className="p-2 border font-medium">Outcome Level Achieved on a Scale of 3</td>
                {componentSummary.map((c) => <td key={c.key} className="p-2 border text-center font-semibold text-brand">{c.outcomeLevel}</td>)}
              </tr>
            </tbody>
          </table>
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