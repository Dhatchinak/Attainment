import React, { useEffect, useState } from "react";
import api from "../../api/axios";

export default function StepConsolidated({ context, onNext, onBack }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const allocationId = context.allocation?._id;

  useEffect(() => {
    if (!allocationId) return;
    let cancelled = false;

    async function autoCompute() {
      setLoading(true);
      setError("");
      try {
        // Always compute on entry so this screen immediately reflects the latest
        // matrix, threshold, ESE and CIA data. No extra Compute/Recompute click.
        const res = await api.post(`/attainment/${allocationId}/compute`, {});
        if (!cancelled) setResult(res.data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || "Failed to compute attainment automatically");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    autoCompute();
    return () => { cancelled = true; };
  }, [allocationId]);

  return (
    <div className="bg-white rounded-xl shadow-card p-6 mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-brand mb-1">Consolidated CO Attainment</h2>
          <p className="text-sm text-gray-500">
            Calculated automatically from the latest CIA, ESE and threshold values using the reference Excel formula.
          </p>
        </div>
        <span className={`status-chip ${error ? "" : "status-success"}`}>
          {loading ? "Calculating..." : error ? "Needs attention" : "✓ Up to date"}
        </span>
      </div>

      {loading && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-4 flex items-center gap-3 text-sm text-gray-700 mb-5">
          <span className="inline-block h-5 w-5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          Computing consolidated CO and PO/PSO attainment automatically…
        </div>
      )}

      {error && <p className="alert-error mb-5">{error}</p>}

      {result?.coAttainment?.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="pro-table">
              <thead>
                <tr className="bg-green-600 text-white">
                  <th className="p-2 border">Course Outcome</th>
                  <th className="p-2 border">Internal</th>
                  <th className="p-2 border">External</th>
                  <th className="p-2 border">Weighted CO</th>
                </tr>
              </thead>
              <tbody>
                {result.coAttainment.map((c) => (
                  <tr key={c.co} className="text-center border-b">
                    <td className="p-2 border font-medium">{c.co}</td>
                    <td className="p-2 border">{Number(c.internal).toFixed(2)}</td>
                    <td className="p-2 border">{Number(c.external).toFixed(2)}</td>
                    <td className="p-2 border font-semibold text-brand">{Number(c.weight).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-semibold">
                  <td className="p-2 border text-right" colSpan={3}>Weighted CO Average</td>
                  <td className="p-2 border text-center text-brand">{Number(result.weightedAverage).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-5 text-xs text-gray-500">
            <div>Internal weight: {result.internalWeight}% · External weight: {result.externalWeight}%</div>
            <div>Marks threshold: {result.thresholdMarksPercent}% · Target: {result.targetPercent}%</div>
          </div>

          <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-600">
            PO/PSO formula: <strong>Expected = average of mapped CO correlation values</strong>; <strong>Observed = Expected × Weighted CO Average ÷ 3</strong>.
          </div>
        </>
      )}

      <div className="flex justify-between mt-6">
        <button onClick={onBack} className="btn btn-ghost">← Back</button>
        <button onClick={onNext} disabled={loading || !result || !!error} className="btn btn-primary">
          View PO/PSO Report →
        </button>
      </div>
    </div>
  );
}
