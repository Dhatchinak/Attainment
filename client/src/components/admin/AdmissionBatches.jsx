import React, { useEffect, useState } from "react";
import api from "../../api/axios";

const emptyForm = { degree: "UG", admissionYear: new Date().getFullYear(), label: "", isActive: true };

export default function AdmissionBatches() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const res = await api.get("/admin/admission-batches");
    setRows(res.data);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (!form.degree || !form.admissionYear) return setMessage("Degree and admission year are required.");
    const payload = { ...form, admissionYear: Number(form.admissionYear), label: form.label || `${form.admissionYear} Batch` };
    if (editingId) await api.patch(`/admin/admission-batches/${editingId}`, payload);
    else await api.post("/admin/admission-batches", payload);
    setEditingId("");
    setForm(emptyForm);
    setMessage("Batch saved successfully.");
    load();
  }

  function edit(row) {
    setEditingId(row._id);
    setForm({ degree: row.degree, admissionYear: row.admissionYear, label: row.label, isActive: row.isActive });
    setMessage("");
  }

  async function toggle(row) {
    await api.patch(`/admin/admission-batches/${row._id}`, { isActive: !row.isActive });
    load();
  }

  async function remove(row) {
    if (!confirm(`Delete ${row.label}?`)) return;
    await api.delete(`/admin/admission-batches/${row._id}`);
    load();
  }

  return (
    <div className="bg-white rounded-xl shadow-card p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-brand">Admission Batch Management</h2>
        <p className="text-sm text-gray-500 mt-1">These batches appear in the staff manual attainment selection. API-detected batches can also be edited or disabled here.</p>
      </div>

      <div className="grid md:grid-cols-5 gap-3 mb-4">
        <select className="input-field" value={form.degree} onChange={(e) => setForm({ ...form, degree: e.target.value })}>
          <option value="UG">UG</option><option value="PG">PG</option>
        </select>
        <input className="input-field" type="number" min="2000" max="2100" placeholder="Admission year" value={form.admissionYear} onChange={(e) => setForm({ ...form, admissionYear: e.target.value })} />
        <input className="input-field md:col-span-2" placeholder="Label, e.g. 2024 Batch" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        <button className="btn btn-primary" onClick={save}>{editingId ? "Update Batch" : "Add Batch"}</button>
      </div>
      {editingId && <button className="text-sm text-gray-500 mb-4" onClick={() => { setEditingId(""); setForm(emptyForm); }}>Cancel editing</button>}
      {message && <p className="text-sm text-green-700 mb-4">{message}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-100"><th className="p-2 text-left">Batch</th><th className="p-2">Degree</th><th className="p-2">Source</th><th className="p-2">Status</th><th className="p-2">Actions</th></tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row._id} className="border-b">
              <td className="p-2 font-medium">{row.label}</td><td className="p-2 text-center">{row.degree}</td><td className="p-2 text-center capitalize">{row.source?.replace("_", " ")}</td>
              <td className="p-2 text-center"><button onClick={() => toggle(row)} className={`px-2.5 py-1 rounded-full text-xs ${row.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{row.isActive ? "Active" : "Inactive"}</button></td>
              <td className="p-2 text-center space-x-3"><button onClick={() => edit(row)} className="text-blue-600">Edit</button><button onClick={() => remove(row)} className="text-red-500">Delete</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
