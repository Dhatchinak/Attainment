import React, { useEffect, useState, useCallback } from "react";
import api from "../../api/axios";

const STATUS_META = {
  completed: { label: "Completed", badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-200", icon: "✓" },
  in_progress: { label: "In progress", badgeClass: "bg-amber-50 text-amber-700 border border-amber-200", icon: "⏳" },
  not_started: { label: "Not started", badgeClass: "bg-gray-100 text-gray-500 border border-gray-200", icon: "▶" },
};

export default function AttainmentRecords() {
  const [years, setYears] = useState([]);
  const [academicYear, setAcademicYear] = useState("");
  const [departmentCode, setDepartmentCode] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/admin/academic-years").then((res) => setYears(res.data));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const params = {};
    if (academicYear) params.academicYear = academicYear;
    if (departmentCode) params.department_code = departmentCode;
    api
      .get("/admin/attainment-records", { params })
      .then((res) => {
        setSummary(res.data.summary);
        setItems(res.data.items);
      })
      .catch(() => setError("Failed to load attainment records"))
      .finally(() => setLoading(false));
  }, [academicYear, departmentCode]);

  useEffect(load, [load]);

  const departments = [...new Set(items.map((i) => i.staff.department_code).filter(Boolean))];

  const visible = items.filter((i) => {
    if (statusFilter && i.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const hay = `${i.staff.name} ${i.allocation.paperCode} ${i.allocation.paperName} ${i.batch?.displayName || ""}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });

  function downloadCSV() {
    const poKeys = [...new Set(visible.flatMap((i) => (i.poAttainment || []).map((p) => p.po)))].sort();
    const psoKeys = [...new Set(visible.flatMap((i) => (i.psoAttainment || []).map((p) => p.pso)))].sort();
    const header = [
      "Staff", "Department", "Paper Code", "Paper Name", "Class", "Semester", "Academic Year", "Status",
      "Weighted Average", ...poKeys, ...psoKeys,
    ];
    const rows = visible.map((i) => {
      const poMap = new Map((i.poAttainment || []).map((p) => [p.po, p.value.toFixed(2)]));
      const psoMap = new Map((i.psoAttainment || []).map((p) => [p.pso, p.value.toFixed(2)]));
      return [
        i.staff.name,
        i.staff.department_name || i.staff.department_code || "",
        i.allocation.paperCode,
        i.allocation.paperName,
        i.batch?.displayName || "",
        i.allocation.semester,
        i.academicYear?.year || "",
        (STATUS_META[i.status] || STATUS_META.not_started).label,
        i.weightedAverage != null ? i.weightedAverage.toFixed(2) : "",
        ...poKeys.map((k) => poMap.get(k) || ""),
        ...psoKeys.map((k) => psoMap.get(k) || ""),
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attainment-full-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card-surface p-5">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h2 className="font-display text-lg font-bold text-gray-900 tracking-tight">Attainment Records — College-wide</h2>
        <button onClick={downloadCSV} disabled={visible.length === 0} className="btn btn-primary shrink-0">
          ⬇ Download Full Attainment (CSV)
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Every staff, every paper, every class — with live CO-PO-PSO attainment progress.
      </p>

      <div className="flex flex-wrap gap-4 mb-5">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Academic Year</label>
          <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} className="input-field">
            <option value="">All years</option>
            {years.map((y) => (
              <option key={y._id} value={y._id}>{y.year}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
          <select value={departmentCode} onChange={(e) => setDepartmentCode(e.target.value)} className="input-field">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field">
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="in_progress">In progress</option>
            <option value="not_started">Not started</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Staff, paper code, paper name, class..."
            className="input-field w-full"
          />
        </div>
      </div>

      {summary && (
        <div className="flex gap-3 mb-5 flex-wrap">
          <span className="badge bg-gray-100 text-gray-700 border border-gray-200">Total: {summary.total}</span>
          <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">✓ Completed: {summary.completed}</span>
          <span className="badge bg-amber-50 text-amber-700 border border-amber-200">⏳ In progress: {summary.in_progress}</span>
          <span className="badge bg-gray-100 text-gray-500 border border-gray-200">▶ Not started: {summary.not_started}</span>
        </div>
      )}

      {loading && <div className="p-8 text-center text-gray-500">Loading attainment records...</div>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-4">Staff</th>
                <th className="py-2 pr-4">Department</th>
                <th className="py-2 pr-4">Paper</th>
                <th className="py-2 pr-4">Class</th>
                <th className="py-2 pr-4">Semester</th>
                <th className="py-2 pr-4">Academic Year</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const meta = STATUS_META[item.status] || STATUS_META.not_started;
                return (
                  <tr key={item.allocation._id} className="border-b last:border-0 odd:bg-gray-50/50 hover:bg-brand-50/40 transition-colors">
                    <td className="py-2 pr-4">{item.staff.name}</td>
                    <td className="py-2 pr-4">{item.staff.department_name || item.staff.department_code || "-"}</td>
                    <td className="py-2 pr-4">{item.allocation.paperCode} · {item.allocation.paperName}</td>
                    <td className="py-2 pr-4">{item.batch?.displayName || "-"}</td>
                    <td className="py-2 pr-4">{item.allocation.semester}</td>
                    <td className="py-2 pr-4">{item.academicYear?.year || "-"}</td>
                    <td className="py-2 pr-4">
                      <span className={`badge ${meta.badgeClass}`}>{meta.icon} {meta.label}</span>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-gray-400">
                    No records match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}