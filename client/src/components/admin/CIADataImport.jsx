import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../api/axios";

function departmentTitle(name) {
  const value = String(name || "").trim();
  if (!value) return "Department";
  return /^department\s+of\s+/i.test(value) ? value : `Department of ${value}`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function statusMeta(status, criticalCount = 0) {
  if (status === "VERIFIED") return { label: "Verified", cls: "dept-status is-verified" };
  if (status === "VERIFIED_WITH_ISSUES") return { label: "Verified · Issues Pending", cls: "dept-status is-warning" };
  if (status === "BLOCKED") return { label: "Action Required", cls: "dept-status is-blocked" };
  return criticalCount > 0
    ? { label: "Ready · Issues Detected", cls: "dept-status is-warning" }
    : { label: "Ready to Verify", cls: "dept-status is-ready" };
}

export default function CIADataImport() {
  const fileRef = useRef(null);
  const [imports, setImports] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadState, setUploadState] = useState({ active: false, current: 0, total: 0, file: "" });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [verifyTarget, setVerifyTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/cia-question/admin/department-imports");
      setImports(data.imports || []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load department CIA imports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => ({
    departments: new Set(imports.map((item) => item.departmentKey)).size,
    verified: imports.filter((item) => String(item.status || "").startsWith("VERIFIED")).length,
    ready: imports.filter((item) => item.status === "READY").length,
    issues: imports.reduce((sum, item) => sum + Number(item.criticalCount || 0), 0),
  }), [imports]);

  function chooseFiles(event) {
    setMessage("");
    setError("");
    const files = Array.from(event.target.files || []);
    const oversized = files.find((file) => file.size > 20 * 1024 * 1024);
    if (oversized) {
      event.target.value = "";
      setSelectedFiles([]);
      setError(`${oversized.name} is larger than the 20 MB application upload limit.`);
      return;
    }
    setSelectedFiles(files);
  }

  async function uploadAll() {
    if (!selectedFiles.length) {
      setError("Choose one or more department CIA Excel workbooks first.");
      return;
    }

    setMessage("");
    setError("");
    setUploadState({ active: true, current: 0, total: selectedFiles.length, file: "" });
    const successes = [];
    const failures = [];

    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      setUploadState({ active: true, current: index + 1, total: selectedFiles.length, file: file.name });
      const form = new FormData();
      form.append("file", file);
      try {
        const { data } = await api.post("/cia-question/import", form);
        successes.push(`${departmentTitle(data.departmentName)} (${(data.academicYears || []).join(", ") || "year detected"})`);
      } catch (err) {
        const status = err.response?.status;
        const payload = err.response?.data;
        let detail = payload?.error || payload?.message || "";
        if (status === 413) {
          detail = `${file.name} was rejected by the web server because of its upload-size limit.`;
        } else if (!err.response) {
          detail = "Backend did not respond. Check that the server is running and MongoDB is reachable.";
        }
        failures.push(`${file.name}: ${detail || `Import failed (HTTP ${status || "unknown"})`}${payload?.stage ? ` — ${payload.stage}` : ""}`);
      }
    }

    setUploadState({ active: false, current: 0, total: 0, file: "" });
    setSelectedFiles([]);
    if (fileRef.current) fileRef.current.value = "";
    if (successes.length) setMessage(`${successes.length} department workbook(s) imported. Open each department summary and verify it once.`);
    if (failures.length) setError(failures.join(" | "));
    await load();
  }

  return (
    <div className="space-y-5">
      <section className="card-surface cia-import-hero">
        <div className="cia-import-heading">
          <div>
            <span className="section-kicker">DEPARTMENT-WISE CIA CONTROL</span>
            <h2 className="font-display text-2xl font-bold text-slate-900 mt-1">CIA Data Import & Verification</h2>
            <p className="text-sm text-slate-500 mt-2 max-w-3xl leading-6">
              Upload one or many department CIA workbooks together. The system analyses every paper, T1/T2 question mapping,
              class/section source rows and CIA activities. Admin verifies the whole department once — no paper-by-paper confirmation.
            </p>
          </div>
          <span className="readonly-badge">ADMIN ONLY</span>
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-6">
          <div className="metric-box"><span>Departments</span><strong>{summary.departments}</strong><small>Imported department sources</small></div>
          <div className="metric-box"><span>Verified</span><strong>{summary.verified}</strong><small>Ready for staff workflow</small></div>
          <div className="metric-box"><span>Ready</span><strong>{summary.ready}</strong><small>Waiting for one-click approval</small></div>
          <div className="metric-box"><span>Source Issues</span><strong>{summary.issues}</strong><small>Affected datasets still pending</small></div>
        </div>

        <div className="cia-upload-box mt-5">
          <div className="cia-upload-copy">
            <strong>Bulk department upload</strong>
            <span>Select English, Computer Science, Commerce and other department workbooks at the same time. Each file is imported and verified independently.</span>
          </div>
          <div className="cia-upload-actions">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple onChange={chooseFiles} className="input-field" />
            <button onClick={uploadAll} disabled={uploadState.active || !selectedFiles.length} className="btn btn-primary min-w-[210px]">
              {uploadState.active ? `Importing ${uploadState.current}/${uploadState.total}…` : selectedFiles.length > 1 ? `Import ${selectedFiles.length} Workbooks` : "Import Workbook"}
            </button>
          </div>
          {selectedFiles.length > 0 && !uploadState.active && (
            <div className="cia-file-list">
              {selectedFiles.map((file) => <span key={`${file.name}-${file.size}`}>✓ {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span>)}
            </div>
          )}
          {uploadState.active && <div className="cia-upload-progress">Processing: <strong>{uploadState.file}</strong></div>}
        </div>

        <div className="cia-verification-note mt-4">
          <strong>New verification rule:</strong>
          <span>
            Inferred question/activity maximums are shown as warnings, not separate confirmation tasks. If system validation has no critical errors,
            <b> Verify Entire Department</b> accepts those inferred values in one action and unlocks T1, T2 and Activities for staff.
          </span>
        </div>

        {message && <p className="alert-success mt-4">✓ {message}</p>}
        {error && <p className="alert-error mt-4">{error}</p>}
      </section>

      <section className="card-surface p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <span className="section-kicker">IMPORTED DEPARTMENTS</span>
            <h3 className="font-display text-lg font-bold text-slate-900 mt-1">Department Verification Queue</h3>
            <p className="text-xs text-slate-500 mt-1">One card = one department + academic year. Re-importing a department automatically resets its verification.</p>
          </div>
          <button onClick={load} disabled={loading} className="btn btn-ghost">{loading ? "Refreshing…" : "Refresh"}</button>
        </div>

        {loading ? <div className="loading-state">Loading department CIA imports…</div> : imports.length === 0 ? (
          <div className="dashboard-empty">
            <div className="dashboard-empty-icon">CIA</div>
            <h3>No department CIA data imported</h3>
            <p>Choose one or more department workbooks above. After import, each department appears here for a single admin verification.</p>
          </div>
        ) : (
          <div className="dept-import-grid">
            {imports.map((item) => {
              const status = statusMeta(item.status, item.criticalCount);
              const warningText = item.warningCount > 0 ? `${item.warningCount} warning${item.warningCount === 1 ? "" : "s"}` : "No warnings";
              return (
                <article key={item._id} className={`dept-import-card ${String(item.status || "").startsWith("VERIFIED") ? "is-verified" : item.status === "BLOCKED" ? "is-blocked" : ""}`}>
                  <div className="dept-card-top">
                    <div className="dept-card-icon">{String(item.departmentName || "D").trim().charAt(0).toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <span className="dept-card-eyebrow">{item.academicYear}</span>
                      <h4>{departmentTitle(item.departmentName)}</h4>
                      <p title={item.sourceFileName}>{item.sourceFileName || "Imported CIA workbook"}</p>
                    </div>
                    <span className={status.cls}>{status.label}</span>
                  </div>

                  <div className="dept-card-metrics">
                    <div><span>Papers</span><strong>{item.paperCount || 0}</strong></div>
                    <div><span>Classes</span><strong>{item.classCount || 0}</strong></div>
                    <div><span>Students</span><strong>{(item.studentCount || 0).toLocaleString()}</strong></div>
                    <div><span>T1/T2 Sets</span><strong>{item.questionSetCount || 0}</strong></div>
                  </div>

                  <div className="dept-validation-strip">
                    <span className={item.criticalCount ? "is-bad" : "is-good"}>{item.criticalCount ? `✕ ${item.criticalCount} critical` : "✓ No critical errors"}</span>
                    <span className={item.warningCount ? "is-warn" : "is-good"}>{item.warningCount ? `⚠ ${warningText}` : "✓ No warnings"}</span>
                  </div>

                  {String(item.status || "").startsWith("VERIFIED") ? (
                    <div className={item.status === "VERIFIED_WITH_ISSUES" ? "dept-warning-line" : "dept-verified-line"}>
                      ✓ Verified by <strong>{item.verifiedBy || "Admin"}</strong> · {formatDate(item.verifiedAt)}
                      {item.status === "VERIFIED_WITH_ISSUES" ? ` · ${item.criticalCount || 0} affected source issue(s) remain pending.` : ""}
                    </div>
                  ) : item.status === "READY" ? (
                    <div className={item.criticalCount > 0 ? "dept-warning-line" : "dept-ready-line"}>
                      {item.criticalCount > 0
                        ? `${item.criticalCount} source issue(s) detected. One-click verification will unlock every valid dataset and leave only affected papers pending.`
                        : "System validation passed. Review the department summary once and approve all CIA source data."}
                    </div>
                  ) : (
                    <div className="dept-blocked-line">Workbook-level problems must be corrected before this department can be processed.</div>
                  )}

                  <div className="dept-card-actions">
                    <button onClick={() => setDetailId(item._id)} className="btn btn-ghost">View Department Data</button>
                    <button
                      onClick={() => setVerifyTarget(item)}
                      disabled={String(item.status || "").startsWith("VERIFIED") || item.status === "BLOCKED"}
                      className="btn btn-primary"
                    >
                      {String(item.status || "").startsWith("VERIFIED") ? "Department Verified" : item.status === "BLOCKED" ? "Verification Blocked" : "Verify Entire Department"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {detailId && <DepartmentDetail importId={detailId} onClose={() => setDetailId(null)} />}
      {verifyTarget && (
        <VerifyDepartmentModal
          item={verifyTarget}
          onClose={() => setVerifyTarget(null)}
          onVerified={async (msg) => {
            setVerifyTarget(null);
            setMessage(msg);
            setError("");
            await load();
          }}
        />
      )}
    </div>
  );
}

function DepartmentDetail({ importId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    api.get(`/cia-question/admin/department-imports/${importId}`)
      .then(({ data: payload }) => setData(payload))
      .catch((err) => setError(err.response?.data?.message || "Unable to open department data"))
      .finally(() => setLoading(false));
  }, [importId]);

  return (
    <div className="admin-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="admin-modal-panel !max-w-7xl">
        <div className="admin-modal-header">
          <div>
            <span className="section-kicker">DEPARTMENT CIA REVIEW</span>
            <h3>{departmentTitle(data?.departmentName)}</h3>
            <p>{data?.academicYear || "—"} · Imported {formatDate(data?.importedAt)} · Version {data?.version || 1}</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost !px-3">✕</button>
        </div>

        {loading ? <div className="loading-state">Loading department source summary…</div> : error ? <p className="alert-error">{error}</p> : (
          <>
            <div className="grid sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
              <div className="metric-box"><span>Papers</span><strong>{data?.paperCount || 0}</strong><small>ODD/EVEN paper sets</small></div>
              <div className="metric-box"><span>Classes</span><strong>{data?.classCount || 0}</strong><small>Course + section sources</small></div>
              <div className="metric-box"><span>Students</span><strong>{(data?.studentCount || 0).toLocaleString()}</strong><small>Distinct register numbers</small></div>
              <div className="metric-box"><span>T1/T2 Sets</span><strong>{data?.questionSetCount || 0}</strong><small>Question-wise datasets</small></div>
              <div className="metric-box"><span>Question Rows</span><strong>{(data?.questionRows || 0).toLocaleString()}</strong><small>Stored exam rows</small></div>
              <div className="metric-box"><span>Activity Sets</span><strong>{data?.activitySetCount || 0}</strong><small>Seminar / assignment / innovative</small></div>
            </div>

            {(data?.issues || []).length > 0 && (
              <div className="dept-issue-panel mb-5">
                <div className="dept-issue-heading">
                  <strong>System validation</strong>
                  <span>{data.criticalCount || 0} critical · {data.warningCount || 0} warning</span>
                </div>
                <div className="dept-issue-list">
                  {(data.issues || []).map((issue, index) => (
                    <div key={`${issue.code}-${index}`} className={issue.severity === "critical" ? "is-critical" : "is-warning"}>
                      <span>{issue.severity === "critical" ? "✕" : "⚠"}</span>
                      <p><strong>{issue.paperCode ? `${issue.paperCode}${issue.exam ? ` · ${issue.exam}` : ""}` : issue.code}</strong>{issue.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="table-shell max-h-[55vh] overflow-auto">
              <table className="pro-table">
                <thead>
                  <tr>
                    <th className="!text-left">Paper / Class Source</th>
                    <th>Term</th>
                    <th>T1</th>
                    <th>T2</th>
                    <th>Activities</th>
                    <th>Staff In-charge</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.papers || []).map((paper) => (
                    <tr key={`${paper.paperCode}-${paper.term}`}>
                      <td className="!text-left">
                        <strong className="text-slate-800">{paper.paperCode}</strong>
                        <div className="text-[11px] text-slate-500 mt-1 max-w-[310px]">{(paper.classes || []).join(" · ") || "Class resolved later from selected allocation"}</div>
                      </td>
                      <td>{paper.term}</td>
                      <td>{paper.t1 ? <DatasetPill info={paper.t1} /> : <span className="status-chip status-danger">Missing</span>}</td>
                      <td>{paper.t2 ? <DatasetPill info={paper.t2} /> : <span className="status-chip status-danger">Missing</span>}</td>
                      <td>{paper.activities ? <span className="status-chip status-neutral">{paper.activities.componentCount} components · {paper.activities.studentRows} rows</span> : <span className="status-chip status-danger">Missing</span>}</td>
                      <td className="text-xs">{(paper.staffNames || []).join(", ") || "—"}</td>
                      <td><span className={paper.status === "READY" ? "status-chip status-success" : "status-chip status-danger"}>{paper.status === "READY" ? "Ready" : "Issue"}</span></td>
                    </tr>
                  ))}
                  {!data?.papers?.length && <tr><td colSpan={7} className="py-9 text-slate-400">No paper datasets found for this department import.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-5">
              <button onClick={onClose} className="btn btn-ghost">Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DatasetPill({ info }) {
  const inferred = Number(info?.inferredCount || 0);
  const invalid = Number(info?.invalidMaxCount || 0) + Number(info?.invalidCoCount || 0) + (Number(info?.studentRows || 0) === 0 ? 1 : 0);
  return (
    <span className={`status-chip ${invalid ? "status-danger" : inferred ? "status-warning" : "status-success"}`}>
      {info?.questionCount || 0} Q · {info?.studentRows || 0} rows
      {invalid ? ` · ${invalid} issue${invalid === 1 ? "" : "s"}` : inferred ? ` · ${inferred} inferred` : ""}
    </span>
  );
}

function VerifyDepartmentModal({ item, onClose, onVerified }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function verify() {
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post(`/cia-question/admin/department-imports/${item._id}/verify`);
      await onVerified(data.message || `${departmentTitle(item.departmentName)} verified.`);
    } catch (err) {
      setError(err.response?.data?.message || "Department verification failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="admin-modal-panel !max-w-2xl">
        <div className="admin-modal-header">
          <div>
            <span className="section-kicker">ONE-CLICK DEPARTMENT VERIFICATION</span>
            <h3>Verify {departmentTitle(item.departmentName)}?</h3>
            <p>{item.academicYear} · Version {item.version || 1}</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost !px-3">✕</button>
        </div>

        <div className="verify-dept-summary">
          <div><span>Papers</span><strong>{item.paperCount || 0}</strong></div>
          <div><span>Classes</span><strong>{item.classCount || 0}</strong></div>
          <div><span>Students</span><strong>{(item.studentCount || 0).toLocaleString()}</strong></div>
          <div><span>Warnings accepted</span><strong>{item.warningCount || 0}</strong></div>
        </div>

        <div className="cia-verification-note mt-4">
          <strong>What this one click does</strong>
          <span>
            Confirms every imported T1/T2 question mapping and accepts the system-inferred question/activity maximums for this department.
            After this, allocated staff can verify their own class-scoped T1, T2 and CIA Activities. This does <b>not</b> verify attainment on behalf of staff.
          </span>
        </div>

        {(item.warningCount > 0 || item.criticalCount > 0) && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-5">
            ⚠ {item.warningCount || 0} warning(s) will be accepted.
            {item.criticalCount > 0 ? ` ${item.criticalCount} affected source issue(s) cannot be auto-resolved; those paper datasets will remain pending while valid papers are unlocked.` : ""}
            {" "}<strong>View Department Data</strong> shows exactly which papers are affected.
          </div>
        )}
        {error && <p className="alert-error mt-4">{error}</p>}

        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} disabled={saving} className="btn btn-ghost">Cancel</button>
          <button onClick={verify} disabled={saving} className="btn btn-primary">{saving ? "Verifying Department…" : "Verify Entire Department"}</button>
        </div>
      </div>
    </div>
  );
}
