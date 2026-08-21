import React, { useEffect, useState } from "react";
import api from "../../api/axios";

export default function Batches() {
  const [years, setYears] = useState([]);
  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState({ programme: "PG", course: "", year: "", section: "", academicYear: "", department_code: "", totalSemesters: 2 });

  function load() {
    api.get("/admin/academic-years").then((res) => setYears(res.data));
    api.get("/admin/batches").then((res) => setBatches(res.data));
  }
  useEffect(load, []);

  async function add() {
    if (!form.course || !form.year || !form.section || !form.academicYear) return alert("Fill all required fields");
    await api.post("/admin/batches", form);
    setForm({ ...form, course: "", year: "", section: "" });
    load();
  }

  async function remove(id) {
    if (!confirm("Delete this batch?")) return;
    await api.delete(`/admin/batches/${id}`);
    load();
  }

  return (
    <div className="bg-white rounded-xl shadow-card p-6">
      <h2 className="text-lg font-semibold text-brand mb-4">Batches / Classes</h2>

      <div className="grid md:grid-cols-6 gap-3 mb-5">
        <select value={form.programme} onChange={(e) => setForm({ ...form, programme: e.target.value })} className="border rounded-lg px-2 py-2">
          <option value="UG">UG</option>
          <option value="PG">PG</option>
        </select>
        <input placeholder="Course e.g. MSC CS" value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} className="border rounded-lg px-2 py-2" />
        <input placeholder="Year e.g. I" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="border rounded-lg px-2 py-2" />
        <input placeholder="Section e.g. A" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} className="border rounded-lg px-2 py-2" />
        <select value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} className="border rounded-lg px-2 py-2">
          <option value="">Academic Year</option>
          {years.map((y) => <option key={y._id} value={y._id}>{y.year}</option>)}
        </select>
        <button onClick={add} className="bg-primary text-white rounded-lg px-3 py-2">Add Batch</button>
      </div>

      <table className="w-full text-sm">
        <thead><tr className="bg-gray-100"><th className="p-2 text-left">Display Name</th><th className="p-2">Programme</th><th className="p-2">Academic Year</th><th className="p-2">Actions</th></tr></thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b._id} className="border-b">
              <td className="p-2 font-medium">{b.displayName}</td>
              <td className="p-2 text-center">{b.programme}</td>
              <td className="p-2 text-center">{b.academicYear?.year}</td>
              <td className="p-2 text-center"><button onClick={() => remove(b._id)} className="text-red-500 text-xs hover:underline">Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
