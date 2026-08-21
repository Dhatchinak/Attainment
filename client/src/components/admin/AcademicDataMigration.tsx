import React, { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import AdminMarksEditor from "./AdminMarksEditor";

function courseLabel(course) {
  const text = String(course || "");
  if (/AVIATION/i.test(text) && /B\.?SC/i.test(text)) return "Aviation (B.Sc.)";
  if (/AVIATION/i.test(text) && /BBA/i.test(text)) return "Aviation (BBA)";
  return text;
}

function batchKey(batch) {
  return [batch.admissionYear, batch.degree, batch.course, batch.year, batch.section].join("::");
}

function coverageMeta(status) {
  if (status === "COMPLETE") return { label: "Complete", cls: "bg-emerald-50 text-emerald-700" };
  if (status === "REVIEW") return { label: "Review Required", cls: "bg-amber-50 text-amber-700" };
  if (status === "PARTIAL") return { label: "Partial", cls: "bg-orange-50 text-orange-700" };
  return { label: "Missing", cls: "bg-red-50 text-red-700" };
}

function SourcePart({ label, value }) {
  const ready = value?.verified && (!value.mappingStatus || value.mappingStatus === "COMPLETE");
  return <span className={`text-[10px] font-bold ${!value ? "text-red-600" : ready ? "text-emerald-700" : "text-amber-700"}`}>{label}: {!value ? "Missing" : `${value.students || 0}${ready ? " ✓" : " · Review"}`}</span>;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function estimatedTime(progress) {
  if (!progress?.startedAt || !progress.percent || progress.percent >= 100) return "";
  const elapsed = Math.max(1, (Date.now() - progress.startedAt) / 1000);
  const remaining = Math.round((elapsed * (100 - progress.percent)) / progress.percent);
  if (remaining < 60) return `About ${remaining} sec remaining`;
  return `About ${Math.ceil(remaining / 60)} min remaining`;
}

export default function AcademicDataMigration() {
  const [batches, setBatches] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [cia, setCia] = useState(true);
  const [ese, setEse] = useState(true);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("selected");
  const [progress, setProgress] = useState(null);
  const [editing, setEditing] = useState(null);
  const [detailView, setDetailView] = useState("history");
  const [availabilityYear, setAvailabilityYear] = useState("ALL");
  const [availabilityTerm, setAvailabilityTerm] = useState("ALL");
  const [ciaFilter, setCiaFilter] = useState("ALL");
  const [eseFilter, setEseFilter] = useState("ALL");
  const [availabilitySearch, setAvailabilitySearch] = useState("");

  const selected = useMemo(() => batches.find((batch) => batchKey(batch) === selectedKey), [batches, selectedKey]);
  const filteredAvailability = useMemo(() => availability.filter((item) => {
    const text = `${item.course} ${item.paperCode} ${item.paperTitle} ${item.staffName} ${item.admissionYear}`.toLowerCase();
    return (availabilityYear === "ALL" || item.academicYear === availabilityYear) &&
      (availabilityTerm === "ALL" || item.term === availabilityTerm) &&
      (ciaFilter === "ALL" || item.ciaStatus === ciaFilter) &&
      (eseFilter === "ALL" || item.eseStatus === eseFilter) &&
      (!availabilitySearch.trim() || text.includes(availabilitySearch.trim().toLowerCase()));
  }), [availability, availabilityYear, availabilityTerm, ciaFilter, eseFilter, availabilitySearch]);
  const availabilitySummary = useMemo(() => ({
    total: filteredAvailability.length,
    ciaComplete: filteredAvailability.filter((item) => item.ciaStatus === "COMPLETE").length,
    ciaReview: filteredAvailability.filter((item) => item.ciaStatus === "REVIEW" || item.ciaStatus === "PARTIAL").length,
    ciaMissing: filteredAvailability.filter((item) => item.ciaStatus === "MISSING").length,
    eseMissing: filteredAvailability.filter((item) => item.eseStatus !== "COMPLETE").length,
  }), [filteredAvailability]);

  async function load(refresh = false) {
    setLoading(true); setError("");
    try {
      const { data } = await api.get("/manual-attainment/admin/migration-options", { params: refresh ? { refresh: 1 } : {} });
      setBatches(data.batches || []); setAcademicYears(data.academicYears || []); setJobs(data.jobs || []); setAvailability(data.availability || []);
      if (!selectedKey && data.batches?.length) setSelectedKey(batchKey(data.batches[0]));
    } catch (requestError) { setError(requestError.response?.data?.message || "Could not load migration batches."); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(false); }, []);

  useEffect(() => {
    if (!selected) return;
    const start = Number(selected.admissionYear) + Math.max(0, Number(selected.year || 1) - 1);
    const suggested = `${start}-${start + 1}`;
    setAcademicYear(academicYears.includes(suggested) ? suggested : (academicYears[0] || suggested));
  }, [selectedKey, selected, academicYears]);

  async function waitForMigration(jobId, onProgress) {
    let temporaryFailures = 0;
    while (true) {
      try {
        const { data } = await api.get(`/manual-attainment/admin/migration-jobs/${jobId}`);
        temporaryFailures = 0;
        onProgress(data);
        if (data.status !== "RUNNING") return data;
      } catch (requestError) {
        temporaryFailures += 1;
        if (temporaryFailures >= 5) throw requestError;
      }
      await delay(1000);
    }
  }

  async function startMigration(batch, onProgress) {
    const { data } = await api.post("/manual-attainment/admin/migrate", {
      ...batch, academicYear, dataTypes: [cia && "CIA", ese && "ESE"].filter(Boolean),
    });
    return waitForMigration(data.jobId, onProgress);
  }

  async function migrate() {
    if (!selected || !academicYear || (!cia && !ese)) { setError("Select a batch, academic year and at least CIA or ESE."); return; }
    setMigrating(true); setError(""); setMessage("");
    try {
      const startedAt = Date.now();
      const job = await startMigration(selected, (current) => {
        setProgress({ ...current.progress, startedAt, label: `${courseLabel(selected.course)} · ${selected.section}` });
      });
      const result = job.scope?.result || {};
      setMessage(`${job.status}: ${result.students || 0} students, ${result.cia || 0} CIA rows and ${result.ese || 0} ESE rows saved in MongoDB.`);
      await load(false);
    } catch (requestError) { setError(requestError.response?.data?.error || requestError.response?.data?.message || "Migration failed."); }
    finally { setMigrating(false); setProgress(null); }
  }

  async function migrateAll() {
    if (!academicYear || (!cia && !ese)) { setError("Select an academic year and at least CIA or ESE."); return; }
    setMigrating(true); setError(""); setMessage("");
    let completed = 0, failed = 0;
    const startedAt = Date.now();
    const academicStart = Number(String(academicYear).slice(0, 4));
    const eligibleBatches = batches.filter((batch) => {
      const duration = batch.degree === "PG" ? 2 : 3;
      return academicStart >= Number(batch.admissionYear) && academicStart < Number(batch.admissionYear) + duration;
    });
    if (!eligibleBatches.length) { setMigrating(false); setError(`No detected batch belongs to ${academicYear}.`); return; }
    for (let index = 0; index < eligibleBatches.length; index += 1) {
      const batch = eligibleBatches[index];
      try {
        const job = await startMigration(batch, (current) => {
          const batchPercent = current.progress?.percent || 0;
          const overallPercent = Math.round(((index + batchPercent / 100) / eligibleBatches.length) * 100);
          setProgress({
            ...current.progress,
            percent: overallPercent,
            startedAt,
            label: `Batch ${index + 1} of ${eligibleBatches.length}: ${courseLabel(batch.course)} · ${batch.section}`,
          });
        });
        if (job.status === "SUCCESS" || job.status === "PARTIAL") completed += 1;
        else failed += 1;
      } catch (_) { failed += 1; }
    }
    setProgress(null); setMessage(`All-batch migration finished: ${completed} batches saved, ${failed} batches failed or had no ${academicYear} records.`);
    setMigrating(false); await load(false);
  }

  return <div className="space-y-5">
    <div className="card-surface p-5">
      <div className="flex justify-between gap-4 flex-wrap"><div><h2 className="font-display text-lg font-bold">CIA / ESE One-Time Migration</h2><p className="text-sm text-gray-500 mt-1">Admin fetches the selected batch once. Staff attainment then reads only the saved MongoDB copy.</p></div><button className="btn btn-ghost" disabled={loading || migrating} onClick={() => load(true)}>↻ Refresh Student Directory</button></div>
      <div className="rounded-xl border border-blue-200 bg-blue-50 text-blue-800 text-sm p-4 mt-4"><strong>Section-safe migration:</strong> admission batch, programme, study year and section are stored on every report. NIL/Aided and Section A are never combined.</div>
      <div className="grid md:grid-cols-2 gap-4 mt-5">
        <div><label className="block text-sm font-medium mb-1">Exact Batch / Class</label><select className="input-field w-full" value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} disabled={loading || mode === "all"}>{batches.map((batch) => <option key={batchKey(batch)} value={batchKey(batch)}>{batch.admissionYear} · {courseLabel(batch.course)} · Year {batch.year} · {batch.section} ({batch.studentCount} students)</option>)}</select></div>
        <div><label className="block text-sm font-medium mb-1">Academic Year</label><select className="input-field w-full" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} disabled={loading || !academicYears.length}>{academicYears.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
      </div>
      <div className="mt-4"><p className="text-sm font-medium mb-2">Data to migrate</p><div className="flex gap-5"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cia} onChange={(e) => setCia(e.target.checked)} /> CIA marks</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ese} onChange={(e) => setEse(e.target.checked)} /> ESE marks</label></div></div>
      <div className="mt-4 flex gap-2"><button className={`badge px-4 py-2 ${mode === "selected" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`} onClick={() => setMode("selected")}>Selected Batch</button><button className={`badge px-4 py-2 ${mode === "all" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`} onClick={() => setMode("all")}>All Batches</button></div>
      {message && <p className="alert-success mt-4">{message}</p>}{error && <p className="alert-error mt-4">{error}</p>}
      <button className="btn btn-primary mt-5" disabled={migrating || loading || (mode === "selected" && !selected)} onClick={mode === "all" ? migrateAll : migrate}>{migrating ? "Fetching and saving..." : mode === "all" ? "Migrate All Batches to MongoDB" : "Migrate Selected Batch to MongoDB"}</button>
      {migrating && progress && <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4" role="status" aria-live="polite">
        <div className="flex items-center justify-between gap-3 text-sm"><strong className="text-blue-900">{progress.label || "Migrating academic data"}</strong><strong className="text-blue-700">{progress.percent || 0}%</strong></div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${Math.max(2, progress.percent || 0)}%` }} /></div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-blue-700"><span>{progress.message || "Migration is running"}{progress.total ? ` · ${progress.processed || 0}/${progress.total} students` : ""}</span><span>{estimatedTime(progress)}</span></div>
        <p className="mt-2 text-xs text-blue-600">You can keep this page open. CIA/ESE records are saved in checkpoints while migration continues.</p>
      </div>}
      <p className="text-xs text-gray-400 mt-2">Migration can take several minutes. Re-running is safe: matching student/paper/year records are updated, not duplicated.</p>
    </div>
    <div className="card-surface p-2 flex gap-2 w-fit"><button className={`btn ${detailView === "history" ? "btn-primary" : "btn-ghost"}`} onClick={() => setDetailView("history")}>Migration History</button><button className={`btn ${detailView === "availability" ? "btn-primary" : "btn-ghost"}`} onClick={() => setDetailView("availability")}>CIA / ESE Availability by Paper</button></div>
    {detailView === "history" && <div className="card-surface p-5"><h3 className="font-display font-bold">Migration History</h3><p className="text-sm text-gray-500 mt-1">Latest batch migration jobs, saved record counts and failures.</p><div className="table-shell mt-4"><table className="pro-table"><thead><tr><th>Date</th><th>Academic Year</th><th className="!text-left">Batch Scope</th><th>Type</th><th>Status</th><th>Saved / Failed</th></tr></thead><tbody>{jobs.map((job) => <tr key={job._id}><td>{new Date(job.createdAt).toLocaleString()}</td><td>{job.academicYear}</td><td className="!text-left">{job.scope?.admissionYear} Batch · {courseLabel(job.scope?.course)} · Year {job.scope?.year} · {job.scope?.section}</td><td>{job.scope?.dataTypes?.join(" + ")}</td><td><span className={`badge ${job.status === "SUCCESS" ? "bg-emerald-50 text-emerald-700" : job.status === "FAILED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{job.status}</span></td><td>{job.counts?.updated || 0} / {job.counts?.failed || 0}</td></tr>)}{!jobs.length && <tr><td colSpan={6} className="py-10 text-center text-gray-400">No batch migration has been run.</td></tr>}</tbody></table></div></div>}
    {detailView === "availability" && <div className="card-surface p-5">
      <div><h3 className="font-display font-bold">CIA / ESE Availability Control</h3><p className="text-sm text-gray-500 mt-1">Accurate paper-level coverage from the college CIA workbook, verified mark entry and ESE migration. Green means complete; amber requires review; orange is partial; red is missing.</p></div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3 mt-5">
        <div className="metric-box"><span>Visible Papers</span><strong>{availabilitySummary.total}</strong><small>After current filters</small></div>
        <div className="metric-box"><span>CIA Complete</span><strong className="text-emerald-700">{availabilitySummary.ciaComplete}</strong><small>Verified source or full entry</small></div>
        <div className="metric-box"><span>CIA Review / Partial</span><strong className="text-amber-700">{availabilitySummary.ciaReview}</strong><small>Imported but not fully ready</small></div>
        <div className="metric-box"><span>CIA Missing</span><strong className="text-red-700">{availabilitySummary.ciaMissing}</strong><small>No usable CIA source</small></div>
        <div className="metric-box"><span>ESE Pending</span><strong className="text-red-700">{availabilitySummary.eseMissing}</strong><small>Partial or missing ESE</small></div>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3 mt-4">
        <select className="input-field" value={availabilityYear} onChange={(event) => setAvailabilityYear(event.target.value)}><option value="ALL">All Academic Years</option>{academicYears.map((year) => <option key={year} value={year}>{year}</option>)}</select>
        <select className="input-field" value={availabilityTerm} onChange={(event) => setAvailabilityTerm(event.target.value)}><option value="ALL">ODD + EVEN</option><option value="ODD">ODD Term</option><option value="EVEN">EVEN Term</option></select>
        <select className="input-field" value={ciaFilter} onChange={(event) => setCiaFilter(event.target.value)}><option value="ALL">All CIA Statuses</option><option value="COMPLETE">CIA Complete</option><option value="REVIEW">CIA Review Required</option><option value="PARTIAL">CIA Partial</option><option value="MISSING">CIA Missing</option></select>
        <select className="input-field" value={eseFilter} onChange={(event) => setEseFilter(event.target.value)}><option value="ALL">All ESE Statuses</option><option value="COMPLETE">ESE Complete</option><option value="PARTIAL">ESE Partial</option><option value="MISSING">ESE Missing</option></select>
        <input className="input-field" value={availabilitySearch} onChange={(event) => setAvailabilitySearch(event.target.value)} placeholder="Paper, class or staff…" />
      </div>
      <div className="table-shell mt-4"><table className="pro-table"><thead><tr><th>Year / Batch</th><th className="!text-left">Class / Paper</th><th className="!text-left">CIA Source & Readiness</th><th>ESE Coverage</th><th className="!text-left">Allocated Staff</th><th>Action</th></tr></thead><tbody>
        {filteredAvailability.map((item, index) => {
          const ciaMeta = coverageMeta(item.ciaStatus);
          const eseMeta = coverageMeta(item.eseStatus);
          return <tr key={`${item.academicYear}-${item.batchId}-${item.paperCode}-${index}`}>
            <td><strong>{item.academicYear}</strong><div className="text-xs text-gray-500 mt-1">{item.admissionYear ? `${item.admissionYear} Batch` : "Batch —"} · {item.term || "—"}</div></td>
            <td className="!text-left"><strong>{courseLabel(item.course)} · {item.studyYear ? `Year ${item.studyYear} · ` : ""}{item.section === "NIL" ? "Aided (NIL)" : `Section ${item.section}`}</strong><div className="text-xs text-gray-500">{item.paperCode} — {item.paperTitle} · Semester {item.semester}</div><div className="text-[10px] text-gray-400 mt-1">Roster: {item.students || 0} students</div></td>
            <td className="!text-left"><span className={`badge ${ciaMeta.cls}`}>{ciaMeta.label}</span><div className="flex flex-wrap gap-2 mt-2"><SourcePart label="T1" value={item.ciaSource?.t1} /><SourcePart label="T2" value={item.ciaSource?.t2} /><SourcePart label="Activities" value={item.ciaSource?.activities} /></div>{item.ciaStudents > 0 && <div className="text-[10px] text-blue-700 mt-1">Verified/manual CIA: {item.ciaStudents}/{item.students || item.ciaStudents}</div>}{item.ciaApiStudents > 0 && item.ciaStudents === 0 && <div className="text-[10px] text-gray-400 mt-1">Legacy API totals: {item.ciaApiStudents} · not calculation-ready</div>}</td>
            <td><span className={`badge ${eseMeta.cls}`}>{eseMeta.label}</span><div className="text-[10px] text-gray-500 mt-2">{item.eseStudents || 0}/{item.students || item.eseStudents || 0} students stored</div></td>
            <td className="!text-left">{item.allocationId ? <div><strong>{item.staffName || "Assigned Staff"}</strong>{item.staffDesignation && <div className="text-xs text-gray-500">{item.staffDesignation}</div>}</div> : <span className="text-xs text-gray-400">Not allocated</span>}</td>
            <td>{item.allocationId ? <button className="table-action" onClick={() => setEditing(item)}>Edit Marks</button> : "—"}</td>
          </tr>;
        })}
        {!filteredAvailability.length && <tr><td colSpan={6} className="py-10 text-center text-gray-400">No papers match the selected CIA/ESE filters.</td></tr>}
      </tbody></table></div>
    </div>}
    {editing && <AdminMarksEditor record={editing} onClose={() => setEditing(null)} />}
  </div>;
}
