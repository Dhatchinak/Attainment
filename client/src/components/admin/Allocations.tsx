import React, { useEffect, useState } from "react";
import api from "../../api/axios";

export default function Allocations() {
  const [years, setYears] = useState([]);
  const [batches, setBatches] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [form, setForm] = useState({
    staff_id: "", batch: "", academicYear: "", semester: 1, paperCode: "", paperName: "", paperType: "Theory", credits: 0,
  });
  const [staffPreview, setStaffPreview] = useState(null);
  const [error, setError] = useState("");

  function load() {
    api.get("/admin/academic-years").then((res) => setYears(res.data));
    api.get("/admin/batches").then((res) => setBatches(res.data));
    api.get("/admin/allocations").then((res) => setAllocations(res.data));
  }
  useEffect(load, []);

  async function lookupStaff() {
    if (!form.staff_id.trim()) return;
    try {
      const res = await api.get(`/admin/staff-lookup/${form.staff_id.trim()}`);
      setStaffPreview(res.data);
      setError("");
    } catch (err) {
      setStaffPreview(null);
      setError("Staff ID not found in ERP");
    }
  }

  async function add() {
    setError("");
    if (!form.staff_id || !form.batch || !form.academicYear || !form.paperCode || !form.paperName) {
      return setError("Fill all required fields");
    }
    try {
      await api.post("/admin/allocations", form);
      setForm({ ...form, paperCode: "", paperName: "" });
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to allocate");
    }
  }

  async function remove(id) {
    if (!confirm("Delete this allocation?")) return;
    await api.delete(`/admin/allocations/${id}`);
    load();
  }

  return (
    <div className="bg-white rounded-xl shadow-card p-6">
      <h2 className="text-lg font-semibold text-brand mb-4">Course Allocations (Staff ⇄ Batch ⇄ Paper)</h2>

      <div className="grid md:grid-cols-4 gap-3 mb-2">
        <div className="flex gap-1">
          <input placeholder="Staff ID" value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })} className="border rounded-lg px-2 py-2 flex-1" />
          <button onClick={lookupStaff} className="bg-gray-200 px-3 rounded-lg text-sm">Check</button>
        </div>
        <select value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} className="border rounded-lg px-2 py-2">
          <option value="">Batch</option>
          {batches.map((b) => <option key={b._id} value={b._id}>{b.displayName}</option>)}
        </select>
        <select value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} className="border rounded-lg px-2 py-2">
          <option value="">Academic Year</option>
          {years.map((y) => <option key={y._id} value={y._id}>{y.year}</option>)}
        </select>
        <input type="number" placeholder="Semester" value={form.semester} onChange={(e) => setForm({ ...form, semester: Number(e.target.value) })} className="border rounded-lg px-2 py-2" />
      </div>

      {staffPreview && (
        <p className="text-xs text-green-700 mb-2">Found: {staffPreview.name} — {staffPreview.designation} ({staffPreview.department_name})</p>
      )}

      <div className="grid md:grid-cols-5 gap-3 mb-5">
        <input placeholder="Paper Code" value={form.paperCode} onChange={(e) => setForm({ ...form, paperCode: e.target.value })} className="border rounded-lg px-2 py-2" />
        <input placeholder="Paper Name" value={form.paperName} onChange={(e) => setForm({ ...form, paperName: e.target.value })} className="border rounded-lg px-2 py-2" />
        <input
          placeholder="Paper Type e.g. Core V, Allied IV"
          list="paperTypeSuggestions"
          value={form.paperType}
          onChange={(e) => setForm({ ...form, paperType: e.target.value })}
          className="border rounded-lg px-2 py-2"
        />
        <datalist id="paperTypeSuggestions">
          {["Theory", "Practical", "Core", "Allied", "Elective", "Language", "Project", "Skill Based"].map((t) => <option key={t} value={t} />)}
        </datalist>
        <input type="number" placeholder="Credits" value={form.credits} onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })} className="border rounded-lg px-2 py-2" />
        <button onClick={add} className="bg-primary text-white rounded-lg px-3 py-2">Allocate</button>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <table className="w-full text-sm">
        <thead><tr className="bg-gray-100"><th className="p-2 text-left">Staff ID</th><th className="p-2">Batch</th><th className="p-2">Sem</th><th className="p-2">Paper</th><th className="p-2">Type</th><th className="p-2">Actions</th></tr></thead>
        <tbody>
          {allocations.map((a) => (
            <tr key={a._id} className="border-b">
              <td className="p-2">{a.staff_id}</td>
              <td className="p-2 text-center">{a.batch?.displayName}</td>
              <td className="p-2 text-center">{a.semester}</td>
              <td className="p-2 text-center">{a.paperCode} — {a.paperName}</td>
              <td className="p-2 text-center">{a.paperType}</td>
              <td className="p-2 text-center"><button onClick={() => remove(a._id)} className="text-red-500 text-xs hover:underline">Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
