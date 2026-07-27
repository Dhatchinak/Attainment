import React, { useEffect, useState } from "react";
import api from "../../api/axios";

export default function StepConsolidated({ context, onNext, onBack }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const allocationId = context.allocation?._id;

  useEffect(() => {
    if (!allocationId) return;
    api.get(`/attainment/${allocationId}`).then((res) => setResult(res.data)).catch(() => {});
  }, [allocationId]);

  async function compute() {
    setLoading(true);
    setError("");
    try {
      const res = await api.post(`/attainment/${allocationId}/compute`, {});
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to compute attainment");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-card p-6 mt-4">
      <h2 className="text-lg font-semibold text-brand mb-1">Consolidated CO Attainment</h2>
      <p className="text-sm text-gray-500 mb-5">
        Internal comes from the CIA components, External from the ESE score. Weight is the two combined per your
        threshold-step ratio.
      </p>

      <button onClick={compute} disabled={loading} className="btn btn-accent mb-5">
        {loading ? "Computing..." : "Compute / Recompute Attainment"}
      </button>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {result?.coAttainment?.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="pro-table">
              <thead>
                <tr className="bg-green-600 text-white">
                  <th className="p-2 border">Course Outcome</th>
                  <th className="p-2 border">Internal</th>
                  <th className="p-2 border">External</th>
                  <th className="p-2 border">Weight</th>
                </tr>
              </thead>
              <tbody>
                {result.coAttainment.map((c) => (
                  <tr key={c.co} className="text-center border-b">
                    <td className="p-2 border font-medium">{c.co}</td>
                    <td className="p-2 border">{c.internal.toFixed(2)}</td>
                    <td className="p-2 border">{c.external.toFixed(2)}</td>
                    <td className="p-2 border font-semibold text-brand">{c.weight.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-semibold">
                  <td className="p-2 border text-right" colSpan={3}>Weighted Average</td>
                  <td className="p-2 border text-center text-brand">{result.weightedAverage.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-5 text-xs text-gray-500">
            <div>Internal weight: {result.internalWeight}% · External weight: {result.externalWeight}%</div>
            <div>Marks threshold: {result.thresholdMarksPercent}% · Target: {result.targetPercent}%</div>
          </div>
        </>
      )}

      <div className="flex justify-between mt-6">
        <button onClick={onBack} className="btn btn-ghost">← Back</button>
        <button onClick={onNext} disabled={!result} className="btn btn-primary">
          View PO/PSO Report →
        </button>
      </div>
    </div>
  );
}
