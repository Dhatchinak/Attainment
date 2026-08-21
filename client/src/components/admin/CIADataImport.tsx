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
  const [workbookImports, setWorkbookImports] = useState([]);
  const [academicYears, setAcademicYears] = useState(["2025-2026"]);
  const [academicYear, setAcademicYear] = useState("2025-2026");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadState, setUploadState] = useState({ active: false, percent: 0, stage: "", sheet: "" });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [verifyTarget, setVerifyTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [{ data }, workbookResponse, yearResponse] = await Promise.all([
        api.get("/cia-question/admin/department-imports"),
        api.get("/cia-question/admin/workbook-imports"),
        api.get("/meta/academic-years"),
      ]);
      setImports(data.imports || []);
      setWorkbookImports(workbookResponse.data.imports || []);
      const years = [...new Set(["2025-2026", ...(yearResponse.data || []).map((item) => item.year).filter(Boolean)])].sort().reverse();
      setAcademicYears(years);
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

  function chooseFile(event) {
    setMessage("");
    setError("");
    const file = event.target.files?.[0] || null;
    if (file && file.size > 100 * 1024 * 1024) {
      event.target.value = "";
      setSelectedFile(null);
      setError(`${file.name} is larger than the 100 MB college-workbook upload limit.`);
      return;
    }
    setSelectedFile(file);
  }

  async function waitForWorkbook(importId) {
    let failures = 0;
    while (true) {
      try {
        const { data } = await api.get(`/cia-question/admin/workbook-imports/${importId}`);
        failures = 0;
        setUploadState({
          active: data.status === "PROCESSING",
          percent: data.progress?.percent || 0,
          stage: data.progress?.stage || "Processing workbook",
          sheet: data.progress?.currentSheet || "",
        });
        if (data.status !== "PROCESSING") return data;
      } catch (err) {
        failures += 1;
        if (failures >= 5) throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  async function uploadCollegeWorkbook() {
    if (!selectedFile) {
      setError("Choose the college CIA master workbook first.");
      return;
    }

    setMessage("");
    setError("");
    setUploadState({ active: true, percent: 0, stage: "Uploading college workbook", sheet: "" });
    const form = new FormData();
    form.append("file", selectedFile);
    form.append("academicYear", academicYear);
    try {
      const { data } = await api.post("/cia-question/import-college", form, {
        onUploadProgress: (event) => {
          const percent = event.total ? Math.min(15, Math.round((event.loaded / event.total) * 15)) : 5;
          setUploadState({ active: true, percent, stage: "Uploading college workbook", sheet: selectedFile.name });
        },
      });
      const finished = await waitForWorkbook(data.importId);
      const counts = finished.counts || {};
      if (finished.status === "FAILED") {
        throw new Error(finished.issues?.find((issue) => issue.severity === "critical")?.message || "College CIA import failed.");
      }
      setMessage(`${academicYear} CIA master imported: ${counts.departments || 0} departments, ${(counts.questionRows || 0).toLocaleString()} question rows and ${(counts.activityRows || 0).toLocaleString()} CIA total/activity rows stored. ${counts.mappingMissing ? `${counts.mappingMissing} dataset(s) need CO-mapping review.` : "All mappings are ready for department verification."}`);
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) {
      const payload = err.response?.data;
      setError(payload?.error || payload?.message || err.message || "College CIA workbook import failed.");
    } finally {
      setUploadState((current) => ({ ...current, active: false }));
    }
  }

  return (
    <div className="space-y-5">
      <section className="card-surface cia-import-hero">
        <div className="cia-import-heading">
          <div>
            <span className="section-kicker">COLLEGE-WIDE CIA MASTER IMPORT</span>
            <h2 className="font-display text-2xl font-bold text-slate-900 mt-1">CIA Master Workbook Migration & Verification</h2>
            <p className="text-sm text-slate-500 mt-2 max-w-3xl leading-6">
              Upload one complete academic-year workbook. ODD and EVEN sheets, all departments, every paper, T1/T2 question marks,
              CIA totals and activities are streamed, validated and separated into department-safe MongoDB records automatically.
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
            <strong>2025–2026 College CIA master workbook</strong>
            <span>The supplied 58 MB structure is supported, including MAJOR, PARTII, Actuarial and MBA sheets. Maximum file size: 100 MB.</span>
          </div>
          <div className="grid md:grid-cols-[220px_1fr_auto] gap-3 items-end">
            <div><label className="block text-xs font-semibold text-slate-600 mb-1">Academic Year</label><select className="input-field w-full" value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} disabled={uploadState.active}>{academicYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></div>
            <div><label className="block text-xs font-semibold text-slate-600 mb-1">College CIA Workbook</label><input ref={fileRef} type="file" accept=".xlsx,.xlsm" onChange={chooseFile} disabled={uploadState.active} className="input-field w-full" /></div>
            <button onClick={uploadCollegeWorkbook} disabled={uploadState.active || !selectedFile} className="btn btn-primary min-w-[230px]">
              {uploadState.active ? "Validating & Storing…" : "Import College CIA Workbook"}
            </button>
          </div>
          {selectedFile && !uploadState.active && (
            <div className="cia-file-list">
              <span>✓ {selectedFile.name} · {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · Academic Year {academicYear}</span>
            </div>
          )}
          {uploadState.active && <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4" role="status" aria-live="polite">
            <div className="flex justify-between gap-3 text-xs text-blue-900"><strong>{uploadState.stage || "Processing workbook"}</strong><strong>{uploadState.percent || 0}%</strong></div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${Math.max(2, uploadState.percent || 0)}%` }} /></div>
            <p className="mt-2 text-xs text-blue-700">{uploadState.sheet ? `Current sheet: ${uploadState.sheet}` : "Preparing streamed workbook validation…"}</p>
          </div>}
        </div>

        <div className="cia-verification-note mt-4">
          <strong>Accuracy rule:</strong>
          <span>
            Source marks and supplied totals are stored unchanged. Duplicate rows are retained in audit fields and de-duplicated only for calculation.
            Missing CO mappings are never invented: affected datasets remain marked <b>Review Required</b> until corrected.
          </span>
        </div>

        {workbookImports[0] && <div className="mt-4 grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="metric-box"><span>Latest Workbook</span><strong>{workbookImports[0].academicYear}</strong><small>{workbookImports[0].status}</small></div>
          <div className="metric-box"><span>Question Rows</span><strong>{(workbookImports[0].counts?.questionRows || 0).toLocaleString()}</strong><small>ODD + EVEN T1/T2</small></div>
          <div className="metric-box"><span>CIA Total Rows</span><strong>{(workbookImports[0].counts?.activityRows || 0).toLocaleString()}</strong><small>MAJOR + PARTII</small></div>
          <div className="metric-box"><span>Duplicates</span><strong>{(workbookImports[0].counts?.duplicates || 0).toLocaleString()}</strong><small>Audited and de-duplicated</small></div>
          <div className="metric-box"><span>Mapping Review</span><strong>{(workbookImports[0].counts?.mappingMissing || 0).toLocaleString()}</strong><small>Datasets not calculation-ready</small></div>
        </div>}

        {message && <p className="alert-success mt-4">✓ {message}</p>}
        {error && <p className="alert-error mt-4">{error}</p>}
      </section>

      <section className="card-surface p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <span className="section-kicker">IMPORTED DEPARTMENTS</span>
            <h3 className="font-display text-lg font-bold text-slate-900 mt-1">Department Verification Queue</h3>
            <p className="text-xs text-slate-500 mt-1">The college master workbook is automatically split into one controlled record per department and academic year.</p>
          </div>
          <button onClick={load} disabled={loading} className="btn btn-ghost">{loading ? "Refreshing…" : "Refresh"}</button>
        </div>

        {loading ? <div className="loading-state">Loading department CIA imports…</div> : imports.length === 0 ? (
          <div className="dashboard-empty">
            <div className="dashboard-empty-icon">CIA</div>
            <h3>No college CIA data imported</h3>
            <p>Upload the complete academic-year master workbook above. Every detected department will appear here for review.</p>
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
                    {item.mappingMissingCount > 0 && <span className="is-bad">{item.mappingMissingCount} mapping review</span>}
                    {item.duplicateRowCount > 0 && <span className="is-warn">{item.duplicateRowCount} duplicate rows audited</span>}
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
  const mappingReview = info?.mappingStatus && info.mappingStatus !== "COMPLETE";
  return (
    <span className={`status-chip ${invalid || mappingReview ? "status-danger" : inferred ? "status-warning" : "status-success"}`}>
      {info?.questionCount || 0} Q · {info?.studentRows || 0} rows
      {mappingReview ? ` · ${info.mappingStatus} mapping` : invalid ? ` · ${invalid} issue${invalid === 1 ? "" : "s"}` : inferred ? ` · ${inferred} inferred` : ""}
      {info?.duplicateRows ? ` · ${info.duplicateRows} duplicate` : ""}
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
