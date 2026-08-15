import React, { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";

function fmt(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function evidenceText(items = []) {
  if (!items.length) return "No mapped evidence";
  return items.map((item) => `${item.source} ${fmt(item.level)}`).join(" + ");
}

export default function StepConsolidated({ context, onNext, onBack, questionWise = true }) {
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
        const res = await api.post(`/attainment/${allocationId}/compute`, {});
        if (!cancelled) setResult(res.data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || "Failed to calculate attainment");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    autoCompute();
    return () => { cancelled = true; };
  }, [allocationId]);

  const actualQuestionWise = result ? result.workflowMode !== "legacy" : questionWise;
  const weights = useMemo(() => {
    if (actualQuestionWise) {
      return {
        main: Number(result?.formulaWeights?.mainInternalWeight ?? 22.5),
        innovative: Number(result?.formulaWeights?.innovativeWeight ?? 2.5),
        cia: Number(result?.internalWeight ?? 25),
        ese: Number(result?.formulaWeights?.externalWeight ?? result?.externalWeight ?? 75),
      };
    }
    return {
      main: 0,
      innovative: 0,
      cia: Number(result?.formulaWeights?.internalWeight ?? result?.internalWeight ?? 25),
      ese: Number(result?.formulaWeights?.externalWeight ?? result?.externalWeight ?? 75),
    };
  }, [result, actualQuestionWise]);

  const activitySummary = result?.ciaActivitySummary || result?.ciaComponentSummary || [];
  const stepNumber = actualQuestionWise ? 8 : 6;

  return (
    <section className="workflow-panel">
      <div className="section-heading-row">
        <div>
          <span className="section-kicker">STEP {String(stepNumber).padStart(2, "0")} · AUTOMATIC CALCULATION</span>
          <h2>Consolidated CO Attainment — {context.allocation?.paperCode}</h2>
          <p>
            {actualQuestionWise
              ? "The system combines verified T1 questions, T2 questions, CIA activities and the unchanged ERP ESE result."
              : "This older academic year uses the existing component-total CIA method. CIA component attainment is combined with the unchanged ERP ESE result."}
          </p>
        </div>
        <span className={`status-chip ${error ? "status-warning" : "status-success"}`}>
          {loading ? "Calculating…" : error ? "Needs attention" : "✓ Calculated"}
        </span>
      </div>

      {actualQuestionWise ? (
        <div className="grid lg:grid-cols-4 gap-3 mb-5">
          <div className="metric-box"><span>Main CIA Weight</span><strong>{fmt(weights.main, 1)}%</strong><small>T1 / T2 + regular activities</small></div>
          <div className="metric-box"><span>Innovative Weight</span><strong>{fmt(weights.innovative, 1)}%</strong><small>Innovative kept separate</small></div>
          <div className="metric-box"><span>ESE Weight</span><strong>{fmt(weights.ese, 1)}%</strong><small>Existing ESE — unchanged</small></div>
          <div className="metric-box"><span>Overall CO Average</span><strong>{loading ? "…" : fmt(result?.weightedAverage)}</strong><small>Final paper level / 3</small></div>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-3 mb-5">
          <div className="metric-box"><span>CIA Weight</span><strong>{fmt(weights.cia, 1)}%</strong><small>Legacy component-total CIA</small></div>
          <div className="metric-box"><span>ESE Weight</span><strong>{fmt(weights.ese, 1)}%</strong><small>ERP ESE — unchanged</small></div>
          <div className="metric-box"><span>Overall CO Average</span><strong>{loading ? "…" : fmt(result?.weightedAverage)}</strong><small>Final paper level / 3</small></div>
        </div>
      )}

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 mb-5">
        <div className="flex gap-3 items-start">
          <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shrink-0">i</div>
          <div className="text-sm text-slate-700">
            <strong className="text-slate-900">How each CO is calculated</strong>
            {actualQuestionWise ? (
              <>
                <p className="mt-1 leading-6">
                  Each T1/T2 question gets an attainment level. Questions mapped to the same CO are averaged. Seminar/Assignment are included only in their mapped COs, Innovative is kept separate, and ESE is added with its configured weight.
                </p>
                <div className="mt-2 font-mono text-[12px] rounded-lg bg-white border border-blue-100 px-3 py-2 overflow-x-auto">
                  Final CO = (Main CIA × {fmt(weights.main, 1)}%) + (Innovative × {fmt(weights.innovative, 1)}%) + (ESE × {fmt(weights.ese, 1)}%)
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 leading-6">
                  Each legacy CIA component is converted to a level from the class threshold/target. Components covering the same CO are averaged, then combined with the ESE outcome level.
                </p>
                <div className="mt-2 font-mono text-[12px] rounded-lg bg-white border border-blue-100 px-3 py-2 overflow-x-auto">
                  Final CO = (CIA × {fmt(weights.cia, 1)}%) + (ESE × {fmt(weights.ese, 1)}%)
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 flex items-center gap-3 text-sm text-slate-700 mb-5">
          <span className="inline-block h-5 w-5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          Checking the available evidence and calculating the CO values…
        </div>
      )}

      {error && (
        <div className="alert-error mb-5">
          <strong>Calculation cannot continue.</strong><br />{error}
        </div>
      )}

      {result?.coAttainment?.length > 0 && (
        <>
          <div className="mb-2 flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold text-slate-900">CO Calculation Breakdown</h3>
              <p className="text-xs text-slate-500 mt-1">Staff can see exactly where every final CO value came from.</p>
            </div>
            <span className="text-xs text-slate-500">All values are attainment levels out of 3</span>
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
                    <td className="font-bold text-slate-900">{c.co}</td>
                    <td>{c.t1 == null ? <span className="text-slate-300">—</span> : fmt(c.t1)}</td>
                    <td>{c.t2 == null ? <span className="text-slate-300">—</span> : fmt(c.t2)}</td>
                    <td><strong>{fmt(c.mainInternal)}</strong><div className="text-[10px] text-slate-400 mt-0.5 max-w-[220px] mx-auto">{evidenceText(c.mainEvidence)}</div></td>
                    <td><strong>{fmt(c.innovative)}</strong><div className="text-[10px] text-slate-400 mt-0.5 max-w-[180px] mx-auto">{evidenceText(c.innovativeEvidence)}</div></td>
                    <td>{fmt(c.external)}</td>
                    <td><span className="inline-flex min-w-[64px] justify-center rounded-lg bg-blue-50 text-blue-700 font-bold px-2.5 py-1.5">{fmt(c.weight)}</span></td>
                  </tr>
                ) : (
                  <tr key={c.co}>
                    <td className="font-bold text-slate-900">{c.co}</td>
                    <td>{fmt(c.internal)}</td>
                    <td>{fmt(c.external)}</td>
                    <td><span className="inline-flex min-w-[64px] justify-center rounded-lg bg-blue-50 text-blue-700 font-bold px-2.5 py-1.5">{fmt(c.weight)}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <td colSpan={actualQuestionWise ? 6 : 3} className="!text-right">Overall CO Attainment Average</td>
                  <td className="text-brand text-base">{fmt(result.weightedAverage)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {actualQuestionWise ? (
            <div className="grid xl:grid-cols-3 gap-4 mt-5">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">T1 Question-wise</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(result.t1QuestionSummary?.coSummary || []).map((row) => <span key={row.co} className="status-chip status-neutral">{row.co}: {fmt(row.outcomeLevel)}</span>)}
                  {!result.t1QuestionSummary?.coSummary?.length && <span className="text-sm text-slate-400">No mapped CO values</span>}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">T2 Question-wise</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(result.t2QuestionSummary?.coSummary || []).map((row) => <span key={row.co} className="status-chip status-neutral">{row.co}: {fmt(row.outcomeLevel)}</span>)}
                  {!result.t2QuestionSummary?.coSummary?.length && <span className="text-sm text-slate-400">No mapped CO values</span>}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">CIA Activities</div>
                <div className="mt-2 space-y-1.5 text-sm">
                  {activitySummary.map((row) => <div key={row.key} className="flex items-center justify-between gap-3"><span className="text-slate-600">{row.label}</span><strong>{fmt(row.outcomeLevel)}</strong></div>)}
                  {!activitySummary.length && <span className="text-slate-400">No activity values</span>}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mt-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Legacy CIA Component Levels</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(result.ciaComponentSummary || []).map((row) => (
                  <div key={row.key} className="rounded-lg bg-white border border-slate-200 px-3 py-2 flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-600">{row.label}</span>
                    <strong className="text-brand">{fmt(row.outcomeLevel)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600 leading-5">
            <strong>PO/PSO calculation used in the final report:</strong> Expected = average of the non-zero CO mapping correlation values. Observed = Expected × Overall CO Attainment Average ÷ 3.
          </div>
        </>
      )}

      <div className="workflow-actions">
        <button onClick={onBack} className="btn btn-ghost">← Back</button>
        <button onClick={onNext} disabled={loading || !result || !!error} className="btn btn-primary">Next: Final Report →</button>
      </div>
    </section>
  );
}
