import React, { useEffect, useState } from "react";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

function levelColor(v) {
  if (v >= 2.5) return "#16a34a";
  if (v >= 1.5) return "#f59e0b";
  if (v > 0) return "#ef4444";
  return "#94a3b8";
}

function levelLabel(v) {
  if (v >= 2.5) return "Attained";
  if (v >= 1.5) return "Partially Attained";
  if (v > 0) return "Below Target";
  return "No Data";
}

export default function StepReport({ context, onBack }) {
  const [result, setResult] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState("");
  const { staff } = useAuth();
  const allocationId = context.allocation?._id;

  useEffect(() => {
    if (!allocationId) return;
    api.get(`/attainment/${allocationId}`).then((res) => setResult(res.data));
  }, [allocationId]);

  async function markComplete() {
    setCompleting(true);
    setCompleteError("");
    try {
      const res = await api.post(`/attainment/${allocationId}/complete`);
      setResult(res.data);
    } catch (err) {
      setCompleteError(err.response?.data?.message || "Failed to mark as complete");
    } finally {
      setCompleting(false);
    }
  }

  if (!result) return <div className="p-8 text-center text-gray-500">Loading report...</div>;

  const chartData = [...result.poAttainment, ...result.psoAttainment].map((d) => ({
    name: d.po || d.pso,
    Observed: d.value,
    Expected: d.expected,
  }));

  return (
    <div className="bg-white rounded-xl shadow-card p-6 mt-4 print:shadow-none print:p-0" id="report-print-area">
      <div className="hidden print:flex justify-between text-[10px] text-gray-400 mb-2">
        <span>Report ID: {allocationId}</span>
        <span>Generated: {new Date().toLocaleString()}</span>
      </div>
      <div className="flex items-center justify-center gap-4 mb-5 pb-5 border-b-2 border-primary">
        <img src="/college-logo.webp" alt="College logo" className="h-20 w-20 object-contain shrink-0" />
        <div className="text-center">
          <h1 className="font-display font-bold text-lg text-gray-900">Bishop Heber College</h1>
          <p className="text-[11px] text-gray-500">(Affiliated to Bharathidasan University)</p>
          <p className="text-[11px] text-gray-500">Nationally Reaccredited by NAAC at 'A++' Grade · Tiruchirappalli – 620017, Tamil Nadu</p>
        </div>
      </div>

      <div className="text-center mb-6">
        <h2 className="font-display text-xl font-bold text-brand tracking-tight">Course-wise Programme Outcome (PO) & PSO Attainment</h2>
        {result.isCompleted && (
          <span className="inline-flex items-center gap-1.5 mt-2 bg-green-50 text-green-700 border border-green-200 text-xs font-semibold px-3 py-1 rounded-full">
            ✓ Marked Complete{result.completedAt ? ` on ${new Date(result.completedAt).toLocaleDateString()}` : ""}
          </span>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-x-8 gap-y-1 text-sm bg-gray-50 border-l-4 border-primary rounded-r-lg p-4 mb-6">
        <div><span className="font-semibold text-gray-700">Semester:</span> {context.allocation?.semester}</div>
        <div><span className="font-semibold text-gray-700">Section:</span> {context.batchLabel || "-"}</div>
        <div><span className="font-semibold text-gray-700">Course Title:</span> {context.allocation?.paperName}</div>
        <div><span className="font-semibold text-gray-700">Course Code:</span> {context.allocation?.paperCode}</div>
        <div><span className="font-semibold text-gray-700">Course Type:</span> {context.allocation?.paperType}</div>
        {/* Auto-fetched from the logged-in staff — no manual typing, per the ERP staff profile */}
        <div><span className="font-semibold text-gray-700">Course Teacher:</span> {staff?.salute} {staff?.name}</div>
      </div>

      <h3 className="font-semibold text-gray-700 mb-2">Observed vs Expected Attainment</h3>
      <p className="text-xs text-gray-500 mb-3">
        Expected is the strongest correlation (High/Medium/Low → 3/2/1) any Course Outcome claims for that PO/PSO in your matrix.
        Where the green line dips below the blue one, that PO/PSO fell short of what the matrix targets.
      </p>
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="name" fontSize={12} />
          <YAxis domain={[0, 3]} ticks={[0, 1, 1.5, 2, 2.5, 3]} fontSize={12} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="Expected" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} />
          <Line type="monotone" dataKey="Observed" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>

      <h3 className="font-semibold text-gray-700 mt-8 mb-2">Attainment Table</h3>
      <div className="overflow-x-auto">
        <table className="pro-table">
          <thead>
            <tr className="bg-primary text-white">
              <th className="p-2 border">Outcome</th>
              <th className="p-2 border">Expected</th>
              <th className="p-2 border">Observed</th>
              <th className="p-2 border">Remark</th>
            </tr>
          </thead>
          <tbody>
            {result.poAttainment.map((p) => (
              <tr key={p.po} className="text-center border-b">
                <td className="p-2 border font-medium">{p.po}</td>
                <td className="p-2 border text-blue-600 font-medium">{p.expected.toFixed(2)}</td>
                <td className="p-2 border font-semibold" style={{ color: levelColor(p.value) }}>{p.value.toFixed(2)}</td>
                <td className="p-2 border text-xs font-medium" style={{ color: levelColor(p.value) }}>{levelLabel(p.value)}</td>
              </tr>
            ))}
            {result.psoAttainment.map((p) => (
              <tr key={p.pso} className="text-center border-b bg-indigo-50/40">
                <td className="p-2 border font-medium">{p.pso}</td>
                <td className="p-2 border text-blue-600 font-medium">{p.expected.toFixed(2)}</td>
                <td className="p-2 border font-semibold" style={{ color: levelColor(p.value) }}>{p.value.toFixed(2)}</td>
                <td className="p-2 border text-xs font-medium" style={{ color: levelColor(p.value) }}>{levelLabel(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 text-xs text-gray-500 flex gap-4 justify-center flex-wrap">
        <span><span className="inline-block w-3 h-0.5 bg-blue-600 align-middle mr-1"></span>Expected Attainment</span>
        <span><span className="inline-block w-3 h-0.5 bg-green-600 align-middle mr-1"></span>Observed Attainment</span>
        <span className="mx-2">|</span>
        <span><span className="inline-block w-3 h-3 bg-green-600 rounded-sm mr-1"></span>Level 3 (≥2.5)</span>
        <span><span className="inline-block w-3 h-3 bg-amber-500 rounded-sm mr-1"></span>Level 2 (≥1.5)</span>
        <span><span className="inline-block w-3 h-3 bg-red-500 rounded-sm mr-1"></span>Level 1 (&gt;0)</span>
      </div>

      <div className="mt-10 pt-8 grid grid-cols-2 gap-8 text-sm print:mt-14">
        <div className="border-t border-gray-300 pt-2 text-center text-gray-600">
          {staff?.salute} {staff?.name}
          <div className="text-xs text-gray-400">Course Teacher</div>
        </div>
        <div className="border-t border-gray-300 pt-2 text-center text-gray-600">
          &nbsp;
          <div className="text-xs text-gray-400">HOD / Coordinator</div>
        </div>
      </div>

      {completeError && <p className="text-sm text-red-600 mt-4 text-center">{completeError}</p>}

      <div className="flex justify-between items-center mt-8 print:hidden">
        <button onClick={onBack} className="btn btn-ghost">← Back</button>
        <div className="flex gap-3">
          <button onClick={() => window.print()} className="bg-white border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg hover:bg-gray-50">
            Print / Export PDF
          </button>
          <button
            onClick={markComplete}
            disabled={completing}
            className={`px-6 py-2.5 rounded-lg font-medium transition ${
              result.isCompleted
                ? "bg-green-100 text-green-700 hover:bg-green-200"
                : "bg-green-600 text-white hover:bg-green-700"
            } disabled:opacity-50`}
          >
            {completing ? "Saving..." : result.isCompleted ? "✓ Completed — Re-save" : "Mark as Complete"}
          </button>
        </div>
      </div>
    </div>
  );
}