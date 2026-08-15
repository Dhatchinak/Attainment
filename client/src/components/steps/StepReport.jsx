import React, { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import {
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function fmt(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function attainmentRatio(observed, expected) {
  if (!expected || expected <= 0) return 0;
  return observed / expected;
}

function levelColor(observed, expected) {
  if (!expected || expected <= 0) return "#64748b";
  const ratio = attainmentRatio(observed, expected);
  if (ratio >= 1) return "#15803d";
  if (ratio >= 0.7) return "#b45309";
  return "#b91c1c";
}

function levelLabel(observed, expected) {
  if (!expected || expected <= 0) return "No mapping";
  const ratio = attainmentRatio(observed, expected);
  if (ratio >= 1) return "Attained";
  if (ratio >= 0.7) return "Partially Attained";
  return "Below Target";
}

function outcomeKey(row) {
  return row.po || row.pso || "";
}

export default function StepReport({ context, onBack, questionWise = true }) {
  const [result, setResult] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [outcomeRemarks, setOutcomeRemarks] = useState({});
  const [remarksSaved, setRemarksSaved] = useState("");
  const [savingRemarks, setSavingRemarks] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState("");
  const [chartType, setChartType] = useState("bar");
  const { staff } = useAuth();
  const allocationId = context.allocation?._id;

  useEffect(() => {
    if (!allocationId) return;
    setCompleteError("");
    api.get(`/attainment/${allocationId}`)
      .then((res) => {
        setResult(res.data);
        setRemarks(res.data.remarks || "");
        setOutcomeRemarks(res.data.outcomeRemarks || {});
      })
      .catch((err) => setCompleteError(err.response?.data?.message || "Could not load the final report"));
  }, [allocationId]);

  const actualQuestionWise = result?.workflowMode ? result.workflowMode === "question_wise" : questionWise;
  const chartData = useMemo(() => {
    if (!result) return [];
    return [...(result.poAttainment || []), ...(result.psoAttainment || [])].map((d) => ({
      name: d.po || d.pso,
      Observed: Number(d.value) || 0,
      Expected: Number(d.expected) || 0,
    }));
  }, [result]);

  const allOutcomes = useMemo(
    () => result ? [...(result.poAttainment || []), ...(result.psoAttainment || [])] : [],
    [result]
  );

  function updateOutcomeRemark(key, value) {
    setOutcomeRemarks((current) => ({ ...current, [key]: String(value || "").slice(0, 500) }));
    setRemarksSaved("");
  }

  async function saveRemarks({ silent = false } = {}) {
    setSavingRemarks(true);
    setCompleteError("");
    if (!silent) setRemarksSaved("");
    try {
      const res = await api.patch(`/attainment/${allocationId}/remarks`, { remarks, outcomeRemarks });
      setResult(res.data);
      setRemarks(res.data.remarks || "");
      setOutcomeRemarks(res.data.outcomeRemarks || {});
      if (!silent) setRemarksSaved("Remarks saved successfully.");
      return true;
    } catch (err) {
      setCompleteError(err.response?.data?.message || "Failed to save remarks");
      return false;
    } finally {
      setSavingRemarks(false);
    }
  }

  async function markComplete() {
    setCompleting(true);
    setCompleteError("");
    try {
      const saved = await saveRemarks({ silent: true });
      if (!saved) return;
      const res = await api.post(`/attainment/${allocationId}/complete`);
      setResult(res.data);
      setRemarks(res.data.remarks || remarks);
      setOutcomeRemarks(res.data.outcomeRemarks || outcomeRemarks);
    } catch (err) {
      setCompleteError(err.response?.data?.message || "Failed to mark as complete");
    } finally {
      setCompleting(false);
    }
  }

  if (!result) {
    return (
      <div className="workflow-panel">
        {completeError ? <p className="alert-error">{completeError}</p> : <div className="loading-state">Loading final attainment report...</div>}
      </div>
    );
  }

  const mainWeight = Number(result.formulaWeights?.mainInternalWeight ?? 22.5);
  const innovativeWeight = Number(result.formulaWeights?.innovativeWeight ?? 2.5);
  const ciaWeight = Number(result.formulaWeights?.internalWeight ?? result.internalWeight ?? 25);
  const eseWeight = Number(result.formulaWeights?.externalWeight ?? result.externalWeight ?? 75);

  return (
    <section className="workflow-panel report-workspace" id="report-print-area">
      <div className="hidden print:flex justify-between text-[10px] text-slate-400 mb-2">
        <span>Report ID: {allocationId}</span>
        <span>Generated: {new Date().toLocaleString()}</span>
      </div>

      <div className="report-college-header">
        <img src="/college-logo.webp" alt="College logo" className="h-20 w-20 object-contain shrink-0" />
        <div>
          <h1>Bishop Heber College (Autonomous)</h1>
          <p>Nationally Reaccredited by NAAC at A++ Grade · Tiruchirappalli – 620017</p>
          <div className="report-title-line">Course-wise CO-PO-PSO Attainment Report</div>
        </div>
      </div>

      <div className="report-title-row">
        <div>
          <span className="section-kicker">FINAL ATTAINMENT REPORT</span>
          <h2>{context.allocation?.paperCode} · {context.allocation?.paperName}</h2>
          <p>{actualQuestionWise ? "Question-wise CIA workflow" : "Legacy component-total CIA workflow"} · Academic Year {context.academicYearLabel || "—"}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end print:hidden">
          <span className={`status-chip ${result.isCompleted ? "status-success" : "status-warning"}`}>
            {result.isCompleted ? "✓ Completed" : "Pending completion"}
          </span>
        </div>
      </div>

      <div className="report-info-grid">
        <div><span>Course Code</span><strong>{context.allocation?.paperCode || "—"}</strong></div>
        <div><span>Course Title</span><strong>{context.allocation?.paperName || "—"}</strong></div>
        <div><span>Semester</span><strong>{context.allocation?.semester || "—"}</strong></div>
        <div><span>Batch</span><strong>{context.admissionYear || context.batchLabel || "—"}</strong></div>
        <div><span>Academic Year</span><strong>{context.academicYearLabel || "—"}</strong></div>
        <div><span>Course Teacher</span><strong>{staff?.salute} {staff?.name}</strong></div>
      </div>

      {result.coAttainment?.length > 0 && (
        <div className="report-section-card">
          <div className="report-section-heading">
            <div>
              <h3>Course Outcome Attainment</h3>
              <p>{actualQuestionWise ? "Question-wise CIA evidence + ESE" : "Legacy CIA component totals + ESE"}</p>
            </div>
            <div className="report-kpi"><span>Overall CO Average</span><strong>{fmt(result.weightedAverage)} / 3</strong></div>
          </div>

          <div className="table-shell">
            <table className="pro-table">
              <thead>
                {actualQuestionWise ? (
                  <tr><th>CO</th><th>T1 Avg</th><th>T2 Avg</th><th>Main CIA</th><th>Innovative</th><th>ESE</th><th>Final CO</th></tr>
                ) : (
                  <tr><th>CO</th><th>CIA</th><th>ESE</th><th>Final CO</th></tr>
                )}
              </thead>
              <tbody>
                {result.coAttainment.map((c) => actualQuestionWise ? (
                  <tr key={c.co}>
                    <td className="font-semibold">{c.co}</td>
                    <td>{c.t1 == null ? "—" : fmt(c.t1)}</td>
                    <td>{c.t2 == null ? "—" : fmt(c.t2)}</td>
                    <td>{fmt(c.mainInternal ?? c.internal)}</td>
                    <td>{fmt(c.innovative ?? 0)}</td>
                    <td>{fmt(c.external)}</td>
                    <td className="font-bold text-brand">{fmt(c.weight)}</td>
                  </tr>
                ) : (
                  <tr key={c.co}>
                    <td className="font-semibold">{c.co}</td>
                    <td>{fmt(c.internal)}</td>
                    <td>{fmt(c.external)}</td>
                    <td className="font-bold text-brand">{fmt(c.weight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="report-formula-note">
            {actualQuestionWise
              ? <>Final CO = Main CIA {fmt(mainWeight, 1)}% + Innovative {fmt(innovativeWeight, 1)}% + ESE {fmt(eseWeight, 1)}%.</>
              : <>Final CO = CIA {fmt(ciaWeight, 1)}% + ESE {fmt(eseWeight, 1)}%.</>}
          </div>
        </div>
      )}

      <div className="report-section-card">
        <div className="report-section-heading">
          <div>
            <h3>Observed vs Expected PO / PSO Attainment</h3>
            <p>Expected is derived from the CO mapping matrix. Observed = Expected × Overall CO Average ÷ 3.</p>
          </div>
          <div className="report-chart-toggle print:hidden" role="group" aria-label="Chart type">
            <button type="button" onClick={() => setChartType("bar")} className={chartType === "bar" ? "active" : ""}>Bar Chart</button>
            <button type="button" onClick={() => setChartType("radar")} className={chartType === "radar" ? "active" : ""}>Radar Chart</button>
          </div>
        </div>

        <div className="report-chart-shell">
          <ResponsiveContainer width="100%" height={390}>
            {chartType === "radar" ? (
              <RadarChart data={chartData} outerRadius="76%">
                <PolarGrid />
                <PolarAngleAxis dataKey="name" fontSize={11} />
                <PolarRadiusAxis domain={[0, 3]} tickCount={4} fontSize={10} />
                <Tooltip />
                <Legend />
                <Radar name="Expected" dataKey="Expected" stroke="#2563eb" fill="#2563eb" fillOpacity={0.13} />
                <Radar name="Observed" dataKey="Observed" stroke="#16a34a" fill="#16a34a" fillOpacity={0.16} />
              </RadarChart>
            ) : (
              <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" fontSize={11} interval={0} />
                <YAxis domain={[0, 3]} ticks={[0, 1, 2, 3]} fontSize={11} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Expected" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Observed" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      <div className="report-section-card">
        <div className="report-section-heading">
          <div>
            <h3>PO / PSO Attainment Table & Remarks</h3>
            <p>Add a short outcome-wise remark/action for PO1 through PSO2. These remarks are saved in MongoDB and printed with the report.</p>
          </div>
          <button onClick={() => saveRemarks()} disabled={savingRemarks} className="btn btn-ghost print:hidden">
            {savingRemarks ? "Saving..." : "Save All Remarks"}
          </button>
        </div>

        <div className="table-shell">
          <table className="pro-table report-outcome-table">
            <thead>
              <tr>
                <th>Outcome</th>
                <th>Expected</th>
                <th>Observed</th>
                <th>Result</th>
                <th className="!text-left min-w-[300px]">Remarks / Action Taken</th>
              </tr>
            </thead>
            <tbody>
              {allOutcomes.map((row) => {
                const key = outcomeKey(row);
                const isPso = Boolean(row.pso);
                return (
                  <tr key={key} className={isPso ? "bg-indigo-50/40" : ""}>
                    <td className="font-semibold">{key}</td>
                    <td className="text-blue-700 font-medium">{fmt(row.expected)}</td>
                    <td className="font-semibold" style={{ color: levelColor(row.value, row.expected) }}>{fmt(row.value)}</td>
                    <td><span className="text-xs font-semibold" style={{ color: levelColor(row.value, row.expected) }}>{levelLabel(row.value, row.expected)}</span></td>
                    <td className="!text-left">
                      <input
                        value={outcomeRemarks[key] || ""}
                        onChange={(e) => updateOutcomeRemark(key, e.target.value)}
                        maxLength={500}
                        placeholder={`Add ${key} remark / action...`}
                        className="report-outcome-remark-input print:hidden"
                      />
                      <span className="hidden print:block text-xs text-slate-700 whitespace-pre-wrap">{outcomeRemarks[key] || "—"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {remarksSaved && <div className="mt-3 text-xs font-medium text-emerald-600 print:hidden">✓ {remarksSaved}</div>}
      </div>

      <div className="report-section-card">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div>
            <h3 className="font-semibold text-slate-800">General Course Remarks / Action Taken</h3>
            <p className="text-xs text-slate-500 print:hidden">Use this for an overall course-level observation in addition to the PO/PSO row remarks.</p>
          </div>
          <span className="text-xs text-slate-400 print:hidden">{remarks.length}/2000</span>
        </div>
        <textarea
          value={remarks}
          onChange={(e) => { setRemarks(e.target.value.slice(0, 2000)); setRemarksSaved(""); }}
          placeholder="Example: Additional problem-solving and remedial activities will be planned for outcomes below target."
          rows={4}
          className="report-remarks-input print:hidden"
        />
        <div className="hidden print:block min-h-[68px] whitespace-pre-wrap text-sm text-slate-700 border-t border-slate-200 pt-3">
          {remarks || "No general remarks recorded."}
        </div>
      </div>

      <div className="report-legend-row">
        <span><strong>Attained:</strong> Observed ≥ Expected</span>
        <span><strong>Partially Attained:</strong> ≥ 70% of Expected</span>
        <span><strong>Below Target:</strong> &lt; 70% of Expected</span>
      </div>

      <div className="report-signatures">
        <div>{staff?.salute} {staff?.name}<small>Course Teacher</small></div>
        <div>&nbsp;<small>HOD / Coordinator</small></div>
      </div>

      {completeError && <p className="alert-error mt-4 text-center">{completeError}</p>}

      <div className="flex justify-between items-center mt-8 print:hidden gap-3 flex-wrap">
        <button onClick={onBack} className="btn btn-ghost">← Back</button>
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => window.print()} className="btn btn-ghost">Print / Export PDF</button>
          <button onClick={() => saveRemarks()} disabled={savingRemarks} className="btn btn-secondary">
            {savingRemarks ? "Saving..." : "Save Remarks"}
          </button>
          <button
            onClick={markComplete}
            disabled={completing || savingRemarks}
            className={result.isCompleted ? "btn btn-ghost !text-emerald-700 !border-emerald-200" : "btn btn-primary"}
          >
            {completing ? "Saving..." : result.isCompleted ? "✓ Completed — Re-save" : "Mark as Complete"}
          </button>
        </div>
      </div>
    </section>
  );
}
