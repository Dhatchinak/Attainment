import React, { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";

function calculateSummary(grid, eseMaxMarks, thresholdPercent, targetPercent) {
  const enteredMarks = grid
    .map((row) => row.obtained)
    .filter((value) => value !== "" && value !== null && value !== undefined)
    .map(Number);

  // Only marks inside the configured paper maximum are valid for attainment.
  // This prevents an old/wrong ESE maximum (for example 50 while marks are
  // actually out of 75) from silently producing a false 100% attainment.
  const validMarks = enteredMarks.filter(
    (mark) => Number.isFinite(mark) && mark >= 0 && mark <= eseMaxMarks
  );
  const invalidCount = enteredMarks.length - validMarks.length;

  const appeared = validMarks.length;
  const attained = validMarks.filter((mark) => (mark / eseMaxMarks) * 100 >= thresholdPercent).length;
  const attainedPercent = appeared > 0 ? Number(((attained / appeared) * 100).toFixed(2)) : 0;
  const outcomeLevel = targetPercent > 0
    ? Math.min(3, Number(((attainedPercent / targetPercent) * 3).toFixed(2)))
    : 0;

  return { appeared, attained, attainedPercent, outcomeLevel, invalidCount };
}

export default function StepESE({ context, onNext, onBack }) {
  const [grid, setGrid] = useState([]);
  const [eseMaxMarks, setEseMaxMarks] = useState(75);
  const [thresholdPercent, setThresholdPercent] = useState(50);
  const [targetPercent, setTargetPercent] = useState(70);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const allocationId = context.allocation?._id;

  function load() {
    setLoading(true);
    setError("");
    api.get(`/ese/${allocationId}`)
      .then((res) => {
        setGrid(res.data.grid || []);
        setEseMaxMarks(Number(res.data.eseMaxMarks) || 75);
        setThresholdPercent(Number(res.data.thresholdMarksPercent) || 0);
        setTargetPercent(Number(res.data.targetPercent) || 0);
      })
      .catch((err) => setError(err.response?.data?.message || "Failed to load ESE marks"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (allocationId) load();
    // eslint-disable-next-line
  }, [allocationId]);

  function updateMark(idx, value) {
    setMessage("");
    setError("");
    if (value !== "" && Number(value) > eseMaxMarks) {
      setError(`ESE mark cannot be greater than ${eseMaxMarks}.`);
    }
    setGrid((current) => {
      const copy = [...current];
      copy[idx] = { ...copy[idx], obtained: value, max: eseMaxMarks };
      return copy;
    });
  }

  const summary = useMemo(
    () => calculateSummary(grid, eseMaxMarks, thresholdPercent, targetPercent),
    [grid, eseMaxMarks, thresholdPercent, targetPercent]
  );

  const thresholdMark = useMemo(
    () => Number(((eseMaxMarks * thresholdPercent) / 100).toFixed(2)),
    [eseMaxMarks, thresholdPercent]
  );

  function validateGrid() {
    const invalid = grid.find((row) => {
      if (row.obtained === "" || row.obtained === null || row.obtained === undefined) return false;
      const mark = Number(row.obtained);
      return !Number.isFinite(mark) || mark < 0 || mark > eseMaxMarks;
    });
    if (invalid) {
      setError(`Enter ESE marks only between 0 and ${eseMaxMarks}.`);
      return false;
    }
    return true;
  }

  async function saveAll({ goNext = false } = {}) {
    if (!validateGrid()) return false;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const entries = grid.map((row) => ({
        studentId: row.student._id,
        obtained: row.obtained,
      }));
      await api.post(`/ese/${allocationId}/bulk`, { entries });
      setMessage("ESE marks saved successfully.");
      if (goNext) onNext();
      return true;
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save marks");
      return false;
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
    setMessage("");
    setError("");
    try {
      const res = await api.post(`/ese/${allocationId}/upload`, form, { headers: { "Content-Type": "multipart/form-data" } });
      const extra = res.data.skipped ? `, ${res.data.skipped} skipped` : "";
      setMessage(`Uploaded: ${res.data.updated} updated${extra}.`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Upload failed");
    } finally {
      setSaving(false);
      e.target.value = "";
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Loading ESE sheet...</div>;

  return (
    <div className="bg-white rounded-xl shadow-card p-6 mt-4">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand">ESE Marks Entry — {context.allocation?.paperCode}</h2>
          <p className="text-sm text-gray-500 mt-1">Enter the obtained mark only. The paper maximum and threshold are applied automatically.</p>
        </div>
        <label className="text-sm bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg cursor-pointer">
          Bulk Upload (Excel)
          <input type="file" accept=".xlsx,.xls,.csv" onChange={uploadExcel} className="hidden" />
        </label>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <div className="rounded-lg border bg-gray-50 px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-gray-500">ESE Maximum</div>
          <div className="text-xl font-bold text-brand mt-1">{eseMaxMarks}</div>
        </div>
        <div className="rounded-lg border bg-gray-50 px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-gray-500">Threshold</div>
          <div className="text-xl font-bold text-brand mt-1">{thresholdPercent}% <span className="text-sm font-medium text-gray-500">= {thresholdMark}/{eseMaxMarks}</span></div>
        </div>
        <div className="rounded-lg border bg-gray-50 px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-gray-500">Target Students</div>
          <div className="text-xl font-bold text-brand mt-1">{targetPercent}%</div>
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        Excel columns: <code>Roll No</code>, <code>Name</code> (optional/reference), <code>ESE</code>. A <code>Max</code> column is optional, but if supplied it must be {eseMaxMarks}.
      </p>

      <div className="overflow-x-auto">
        <table className="pro-table">
          <thead>
            <tr className="bg-blue-600 text-white">
              <th className="p-2 border">Paper code</th>
              <th className="p-2 border">Roll No</th>
              <th className="p-2 border">Name</th>
              <th className="p-2 border">ESE / {eseMaxMarks}</th>
            </tr>
          </thead>
          <tbody>
            {grid.map((row, idx) => {
              const numericMark = row.obtained === "" ? null : Number(row.obtained);
              const invalid = numericMark !== null && (!Number.isFinite(numericMark) || numericMark < 0 || numericMark > eseMaxMarks);
              return (
                <tr key={row.student._id} className="border-b">
                  <td className="p-2 border text-center text-gray-500">{context.allocation?.paperCode}</td>
                  <td className="p-2 border text-center">{row.student.regNo}</td>
                  <td className="p-2 border">{row.student.name}</td>
                  <td className="border p-1 text-center">
                    <input
                      type="number"
                      min="0"
                      max={eseMaxMarks}
                      step="0.01"
                      className={`w-28 border rounded px-2 py-1 text-center ${invalid ? "border-red-500 bg-red-50" : ""}`}
                      value={row.obtained}
                      onChange={(e) => updateMark(idx, e.target.value)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 bg-blue-50 rounded-lg overflow-hidden text-sm">
        <div className="grid grid-cols-2 border-b border-blue-100">
          <div className="p-2.5 font-medium text-gray-700">Total number of Students Appeared</div>
          <div className="p-2.5 text-center font-semibold">{summary.appeared}</div>
        </div>
        <div className="grid grid-cols-2 border-b border-blue-100">
          <div className="p-2.5 font-medium text-gray-700">
            Students above Threshold Value
            <span className="block text-xs font-normal text-gray-500 mt-0.5">
              Mark ≥ {thresholdMark} out of {eseMaxMarks} ({thresholdPercent}%)
            </span>
          </div>
          <div className="p-2.5 text-center font-semibold">{summary.attained}</div>
        </div>
        <div className="grid grid-cols-2 border-b border-blue-100">
          <div className="p-2.5 font-medium text-gray-700">Percentage of Students above Threshold</div>
          <div className="p-2.5 text-center font-semibold">{summary.attainedPercent}%</div>
        </div>
        <div className="grid grid-cols-2">
          <div className="p-2.5 font-medium text-gray-700">Outcome Level Achieved on a Scale of 3</div>
          <div className="p-2.5 text-center font-semibold text-brand">{summary.outcomeLevel}</div>
        </div>
      </div>

      {summary.invalidCount > 0 && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>{summary.invalidCount} invalid ESE mark{summary.invalidCount > 1 ? "s" : ""} found.</strong>{" "}
          These marks are outside 0–{eseMaxMarks} and are not included in the attainment calculation.
          Correct the ESE maximum in Step 3 or correct the marks before saving.
        </div>
      )}

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      {message && <p className="text-sm text-brand mt-3">{message}</p>}

      <div className="flex justify-between mt-6">
        <button onClick={onBack} className="btn btn-ghost">← Back</button>
        <div className="flex gap-3">
          <button onClick={() => saveAll()} disabled={saving} className="btn btn-accent">
            {saving ? "Saving..." : "Save Marks"}
          </button>
          <button onClick={() => saveAll({ goNext: true })} disabled={saving} className="btn btn-primary">
            {saving ? "Saving..." : "Save & Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
