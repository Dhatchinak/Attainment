import React, { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";

function batchKey(batch) {
  return [batch.admissionYear, batch.degree, batch.course, batch.year, batch.section].join("::");
}

export default function AcademicDataMigration() {
  const [batches, setBatches] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [cia, setCia] = useState(true);
  const [ese, setEse] = useState(true);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selected = useMemo(() => batches.find((batch) => batchKey(batch) === selectedKey), [batches, selectedKey]);

  async function load(refresh = false) {
    setLoading(true); setError("");
    try {
      const { data } = await api.get("/manual-attainment/admin/migration-options", { params: refresh ? { refresh: 1 } : {} });
      setBatches(data.batches || []); setAcademicYears(data.academicYears || []); setJobs(data.jobs || []);
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

  async function migrate() {
    if (!selected || !academicYear || (!cia && !ese)) { setError("Select a batch, academic year and at least CIA or ESE."); return; }
    setMigrating(true); setError(""); setMessage("");
    try {
      const { data } = await api.post("/manual-attainment/admin/migrate", {
        ...selected, academicYear, dataTypes: [cia && "CIA", ese && "ESE"].filter(Boolean),
      });
      setMessage(`${data.status}: ${data.migrated.students} students, ${data.migrated.cia} CIA rows and ${data.migrated.ese} ESE rows saved in MongoDB.`);
      await load(false);
    } catch (requestError) { setError(requestError.response?.data?.error || requestError.response?.data?.message || "Migration failed."); }
    finally { setMigrating(false); }
  }

  return <div className="space-y-5">
    <div className="card-surface p-5">
      <div className="flex justify-between gap-4 flex-wrap"><div><h2 className="font-display text-lg font-bold">CIA / ESE One-Time Migration</h2><p className="text-sm text-gray-500 mt-1">Admin fetches the selected batch once. Staff attainment then reads only the saved MongoDB copy.</p></div><button className="btn btn-ghost" disabled={loading || migrating} onClick={() => load(true)}>↻ Refresh Student Directory</button></div>
      <div className="rounded-xl border border-blue-200 bg-blue-50 text-blue-800 text-sm p-4 mt-4"><strong>Section-safe migration:</strong> admission batch, programme, study year and section are stored on every report. NIL/Aided and Section A are never combined.</div>
      <div className="grid md:grid-cols-2 gap-4 mt-5">
        <div><label className="block text-sm font-medium mb-1">Exact Batch / Class</label><select className="input-field w-full" value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} disabled={loading}>{batches.map((batch) => <option key={batchKey(batch)} value={batchKey(batch)}>{batch.admissionYear} · {batch.course} · Year {batch.year} · {batch.section} ({batch.studentCount} students)</option>)}</select></div>
        <div><label className="block text-sm font-medium mb-1">Academic Year</label><select className="input-field w-full" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} disabled={loading || !academicYears.length}>{academicYears.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
      </div>
      <div className="mt-4"><p className="text-sm font-medium mb-2">Data to migrate</p><div className="flex gap-5"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cia} onChange={(e) => setCia(e.target.checked)} /> CIA marks</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ese} onChange={(e) => setEse(e.target.checked)} /> ESE marks</label></div></div>
      {message && <p className="alert-success mt-4">{message}</p>}{error && <p className="alert-error mt-4">{error}</p>}
      <button className="btn btn-primary mt-5" disabled={migrating || loading || !selected} onClick={migrate}>{migrating ? "Fetching and saving all students..." : "Migrate Selected Batch to MongoDB"}</button>
      <p className="text-xs text-gray-400 mt-2">Migration can take several minutes. Re-running is safe: matching student/paper/year records are updated, not duplicated.</p>
    </div>
    <div className="card-surface p-5"><h3 className="font-display font-bold">Migration History</h3><div className="table-shell mt-4"><table className="pro-table"><thead><tr><th>Date</th><th>Academic Year</th><th className="!text-left">Batch Scope</th><th>Type</th><th>Status</th><th>Saved / Failed</th></tr></thead><tbody>{jobs.map((job) => <tr key={job._id}><td>{new Date(job.createdAt).toLocaleString()}</td><td>{job.academicYear}</td><td className="!text-left">{job.scope?.admissionYear} · {job.scope?.course} · Year {job.scope?.year} · {job.scope?.section}</td><td>{job.scope?.dataTypes?.join(" + ")}</td><td><span className={`badge ${job.status === "SUCCESS" ? "bg-emerald-50 text-emerald-700" : job.status === "FAILED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{job.status}</span></td><td>{job.counts?.updated || 0} / {job.counts?.failed || 0}</td></tr>)}{!jobs.length && <tr><td colSpan={6} className="py-10 text-center text-gray-400">No batch migration has been run.</td></tr>}</tbody></table></div></div>
  </div>;
}
