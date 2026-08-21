import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

const labels = { completed: "Completed", in_progress: "In Progress", not_started: "Not Started" };

export default function DepartmentDashboard() {
  const { staff: department, logout } = useAuth();
  const navigate = useNavigate();
  const [years, setYears] = useState([]);
  const [year, setYear] = useState("");
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("live");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/department/academic-years").then(({ data: available }) => {
      setYears(available || []);
      setYear(available?.includes("2025-2026") ? "2025-2026" : (available?.[0] || ""));
    }).catch(() => setError("Could not load academic years.")).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!year) return;
    setLoading(true); setError("");
    api.get("/department/records", { params: { academicYear: year } })
      .then(({ data: records }) => setData(records))
      .catch((requestError) => setError(requestError.response?.data?.message || "Could not load department records."))
      .finally(() => setLoading(false));
  }, [year]);

  function signOut() { logout(); navigate("/department-login"); }
  const summary = data?.summary || {};

  return <div className="min-h-screen bg-slate-50">
    <header className="bg-gradient-to-r from-cyan-900 to-blue-950 text-white shadow-lg"><div className="max-w-7xl mx-auto px-5 py-5 flex items-center justify-between gap-4">
      <div><p className="text-xs uppercase tracking-widest text-cyan-200">Department Attainment</p><h1 className="text-xl font-display font-bold">{data?.department?.departmentName || department?.departmentName || "Department Dashboard"}</h1><p className="text-xs text-white/60 mt-1">Read-only HOD view · {data?.department?.departmentCode || department?.departmentCode}</p></div>
      <button className="btn bg-white/10 hover:bg-white/20 text-white" onClick={signOut}>Logout</button>
    </div></header>
    <main className="max-w-7xl mx-auto p-5 space-y-5">
      <div className="card-surface p-4 flex items-center justify-between gap-4 flex-wrap"><div><h2 className="font-display font-bold">Academic records</h2><p className="text-sm text-gray-500">Only records mapped to this department are visible.</p></div><label className="text-sm font-medium">Academic Year <select className="input-field ml-2" value={year} onChange={(e) => setYear(e.target.value)}>{years.map((item) => <option key={item}>{item}</option>)}</select></label></div>
      {error && <p className="alert-error">{error}</p>}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{[
        ["Current Classes", summary.liveTotal || 0], ["Completed", summary.completed || 0], ["In Progress", summary.inProgress || 0], ["Not Started", summary.notStarted || 0], ["Historical", summary.historicalTotal || 0],
      ].map(([label, value]) => <div className="card-surface p-4" key={label}><p className="text-xs text-gray-500">{label}</p><p className="text-2xl font-bold text-slate-800 mt-1">{value}</p></div>)}</div>
      <div className="card-surface overflow-hidden"><div className="flex border-b"><button onClick={() => setTab("live")} className={`px-5 py-3 text-sm font-semibold ${tab === "live" ? "text-blue-700 border-b-2 border-blue-600" : "text-gray-500"}`}>Current Attainment ({data?.live?.length || 0})</button><button onClick={() => setTab("historical")} className={`px-5 py-3 text-sm font-semibold ${tab === "historical" ? "text-blue-700 border-b-2 border-blue-600" : "text-gray-500"}`}>Migrated Archive ({data?.historical?.length || 0})</button></div>
        {loading ? <div className="loading-state py-12">Loading department records...</div> : <div className="table-shell border-0 rounded-none"><table className="pro-table"><thead>{tab === "live" ? <tr><th className="!text-left">Paper</th><th>Staff</th><th>Class</th><th>Semester</th><th>Status</th><th>Details</th></tr> : <tr><th className="!text-left">Course</th><th>Professor</th><th>Batch / Section</th><th>Semester</th><th>Outcomes</th><th>Details</th></tr>}</thead>
          <tbody>{tab === "live" ? data?.live?.map((item) => <tr key={item.allocation._id}><td className="!text-left"><strong>{item.allocation.paperCode}</strong><div className="text-xs text-gray-500">{item.allocation.paperName}</div></td><td>{item.staff.name}</td><td>{item.batch?.displayName || item.batch?.name || "—"}</td><td>{item.allocation.semester}</td><td><span className="badge bg-blue-50 text-blue-700">{labels[item.status] || item.status}</span></td><td><button className="table-action" onClick={() => setSelected({ type: "live", item })}>View</button></td></tr>) : data?.historical?.map((item) => <tr key={item._id}><td className="!text-left"><strong>{item.courseCode}</strong><div className="text-xs text-gray-500">{item.courseTitle}</div></td><td>{item.professorName || "—"}</td><td>{item.batch || "—"} / {item.section || "—"}</td><td>{item.semester}</td><td>{item.outcomes?.length || 0}</td><td><button className="table-action" onClick={() => setSelected({ type: "historical", item })}>View</button></td></tr>)}
          {!(tab === "live" ? data?.live?.length : data?.historical?.length) && <tr><td colSpan={6} className="py-12 text-center text-gray-400">No {tab === "live" ? "current" : "historical"} records for {year || "this academic year"}.</td></tr>}</tbody></table></div>}
      </div>
    </main>
    {selected && <div className="fixed inset-0 bg-slate-950/50 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}><div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}><div className="flex justify-between gap-3"><div><h3 className="font-display text-lg font-bold">{selected.type === "live" ? selected.item.allocation.paperName : selected.item.courseTitle}</h3><p className="text-sm text-gray-500">Expected and observed attainment details</p></div><button className="table-action" onClick={() => setSelected(null)}>Close</button></div><div className="table-shell mt-5"><table className="pro-table"><thead><tr><th>Outcome</th><th>Expected</th><th>Observed</th></tr></thead><tbody>{(selected.type === "historical" ? selected.item.outcomes : [...(selected.item.poAttainment || []), ...(selected.item.psoAttainment || [])]).map((outcome, index) => <tr key={outcome.outcome || outcome.po || outcome.pso || index}><td>{outcome.outcome || outcome.po || outcome.pso || `Outcome ${index + 1}`}</td><td>{outcome.expected ?? outcome.target ?? "—"}</td><td>{outcome.observed ?? outcome.attainment ?? outcome.value ?? "—"}</td></tr>)}</tbody></table></div></div></div>}
  </div>;
}
