import React, { useCallback, useEffect, useState } from "react";
import api from "../../api/axios";

function value(value) {
  return value == null ? "—" : Number(value).toFixed(2);
}

export default function HistoricalAttainmentArchive() {
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [meta, setMeta] = useState({ total: 0, archivedVersions: 0, years: [], departments: [], sections: [] });
  const [filters, setFilters] = useState({ academicYear: "", department: "", section: "", semester: "", search: "" });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const loadMeta = useCallback(() => {
    api.get("/admin/historical-attainment/meta").then((res) => setMeta(res.data));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const params = { page, limit: 25 };
    Object.entries(filters).forEach(([key, current]) => { if (current) params[key] = current; });
    api.get("/admin/historical-attainment", { params })
      .then((res) => setResult(res.data))
      .catch(() => setError("Could not load the historical archive."))
      .finally(() => setLoading(false));
  }, [filters, page]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { load(); }, [load]);

  function changeFilter(key, current) {
    setPage(1);
    setFilters((previous) => ({ ...previous, [key]: current }));
  }

  async function importFile() {
    if (!file) return;
    setImporting(true);
    setMessage("");
    setError("");
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await api.post("/admin/historical-attainment/import", form);
      setMessage(`Imported ${data.imported} rows: ${data.inserted} new, ${data.updated} updated, ${data.historicalVersions} archived duplicate/version rows.`);
      setFile(null);
      loadMeta();
      load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Historical import failed.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="card-surface p-5">
        <div className="flex items-start justify-between gap-5 flex-wrap">
          <div>
            <span className="section-kicker">READ-ONLY LEGACY DATA</span>
            <h2 className="font-display text-lg font-bold text-gray-900 mt-1">Historical Attainment Archive</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-3xl">Completed records from the previous PHP/MySQL portal. They remain separate from live CO calculations because the legacy format uses PO1–PO9 and PSO1–PSO4.</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <label className="btn btn-ghost cursor-pointer">
              {file ? file.name : "Choose legacy JSON"}
              <input type="file" accept="application/json,.json" className="hidden" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </label>
            <button onClick={importFile} disabled={!file || importing} className="btn btn-primary">{importing ? "Migrating..." : "Migrate to MongoDB"}</button>
          </div>
        </div>
        {message && <p className="alert-success mt-4">{message}</p>}
        {error && <p className="alert-error mt-4">{error}</p>}
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="metric-box"><span>Current Records</span><strong>{meta.total}</strong><small>Latest completed version</small></div>
        <div className="metric-box"><span>Older Versions</span><strong>{meta.archivedVersions}</strong><small>Preserved, hidden by default</small></div>
        <div className="metric-box"><span>Academic Years</span><strong>{meta.years.length}</strong><small>{meta.years.join(", ") || "No data"}</small></div>
        <div className="metric-box"><span>Departments</span><strong>{meta.departments.length}</strong><small>College-wide archive</small></div>
      </section>

      <section className="card-surface p-5">
        <div className="grid md:grid-cols-5 gap-3 mb-5">
          <select className="input-field" value={filters.academicYear} onChange={(e) => changeFilter("academicYear", e.target.value)}><option value="">All academic years</option>{meta.years.map((year) => <option key={year}>{year}</option>)}</select>
          <select className="input-field" value={filters.department} onChange={(e) => changeFilter("department", e.target.value)}><option value="">All departments</option>{meta.departments.map((department) => <option key={department}>{department}</option>)}</select>
          <select className="input-field" value={filters.semester} onChange={(e) => changeFilter("semester", e.target.value)}><option value="">All semesters</option>{[1, 2, 3, 4, 5, 6].map((semester) => <option key={semester} value={semester}>Semester {semester}</option>)}</select>
          <select className="input-field" value={filters.section} onChange={(e) => changeFilter("section", e.target.value)}><option value="">All sections</option>{meta.sections.map((section) => <option key={section}>{section}</option>)}</select>
          <input className="input-field" value={filters.search} onChange={(e) => changeFilter("search", e.target.value)} placeholder="Course, staff or batch..." />
        </div>

        <div className="flex justify-between items-center gap-3 mb-3 text-sm text-gray-500"><span>{result.total} matching completed record{result.total === 1 ? "" : "s"}</span><span>Page {page} of {result.totalPages}</span></div>
        {loading ? <div className="loading-state">Loading historical attainment...</div> : (
          <div className="table-shell">
            <table className="pro-table">
              <thead><tr><th>Year</th><th className="!text-left">Department / Class</th><th className="!text-left">Course</th><th className="!text-left">Professor</th><th>Semester</th><th>Outcomes</th><th>View</th></tr></thead>
              <tbody>
                {result.items.map((item) => <tr key={item._id}>
                  <td>{item.academicYear}</td>
                  <td className="!text-left"><strong>{item.department}</strong><div className="text-xs text-slate-500">Batch {item.batch} · {item.section === "NIL" ? "Aided (NIL)" : `Section ${item.section}`}</div></td>
                  <td className="!text-left"><strong>{item.courseCode}</strong><div className="text-xs text-slate-500">{item.courseTitle}</div></td>
                  <td className="!text-left">{item.professorName || "—"}</td>
                  <td>{item.semester}</td>
                  <td>{item.poCount} PO · {item.psoCount} PSO</td>
                  <td><button className="table-action" onClick={() => setSelected(item)}>Details</button></td>
                </tr>)}
                {!result.items.length && <tr><td colSpan={7} className="py-10 text-center text-gray-400">No historical records match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4"><button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="btn btn-ghost" disabled={page >= result.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div>
      </section>

      {selected && <div className="fixed inset-0 z-50 bg-slate-950/45 p-4 grid place-items-center" onClick={() => setSelected(null)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-auto p-6" onClick={(event) => event.stopPropagation()}>
          <div className="flex justify-between gap-4 mb-5"><div><span className="section-kicker">COMPLETED LEGACY RECORD</span><h3 className="font-display text-xl font-bold mt-1">{selected.courseCode} · {selected.courseTitle}</h3><p className="text-sm text-gray-500 mt-1">{selected.department} · {selected.academicYear} · Semester {selected.semester} · {selected.professorName}</p></div><button className="btn btn-ghost" onClick={() => setSelected(null)}>Close</button></div>
          <div className="table-shell"><table className="pro-table"><thead><tr><th>Outcome</th><th>Expected</th><th>Observed</th></tr></thead><tbody>{selected.outcomes.map((outcome) => <tr key={outcome.outcome}><td><strong>{outcome.outcome}</strong></td><td>{value(outcome.expected)}</td><td>{value(outcome.observed)}</td></tr>)}</tbody></table></div>
          <p className="text-xs text-gray-400 mt-4">Legacy record ID {selected.legacyId} · Version {selected.version}. “—” means the previous system stored no mapped value.</p>
        </div>
      </div>}
    </div>
  );
}
