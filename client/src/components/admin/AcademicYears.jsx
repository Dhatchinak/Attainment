import React, { useEffect, useState } from "react";
import api from "../../api/axios";

export default function AcademicYears() {
  const [years, setYears] = useState([]);
  const [year, setYear] = useState("");

  function load() {
    api.get("/admin/academic-years").then((res) => setYears(res.data));
  }
  useEffect(load, []);

  async function add() {
    if (!year.trim()) return;
    await api.post("/admin/academic-years", { year: year.trim() });
    setYear("");
    load();
  }

  async function toggle(y) {
    await api.patch(`/admin/academic-years/${y._id}`, { isActive: !y.isActive });
    load();
  }

  async function remove(id) {
    if (!confirm("Delete this academic year?")) return;
    await api.delete(`/admin/academic-years/${id}`);
    load();
  }

  return (
    <div className="bg-white rounded-xl shadow-card p-6">
      <h2 className="text-lg font-semibold text-brand mb-4">Academic Years</h2>
      <div className="flex gap-3 mb-5">
        <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="e.g. 2025-2026" className="border rounded-lg px-3 py-2 flex-1" />
        <button onClick={add} className="bg-primary text-white px-5 py-2 rounded-lg">Add</button>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="bg-gray-100"><th className="p-2 text-left">Year</th><th className="p-2">Status</th><th className="p-2">Actions</th></tr></thead>
        <tbody>
          {years.map((y) => (
            <tr key={y._id} className="border-b">
              <td className="p-2">{y.year}</td>
              <td className="p-2 text-center">
                <button onClick={() => toggle(y)} className={`text-xs px-3 py-1 rounded-full ${y.isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>
                  {y.isActive ? "Active" : "Inactive"}
                </button>
              </td>
              <td className="p-2 text-center">
                <button onClick={() => remove(y._id)} className="text-red-500 text-xs hover:underline">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
