import React, { useEffect, useState } from "react";
import api from "../../api/axios";

export default function UploadStudents() {
  const [batches, setBatches] = useState([]);
  const [batch, setBatch] = useState("");
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");
  const [students, setStudents] = useState([]);

  const [single, setSingle] = useState({ regNo: "", name: "", email: "", phone: "" });
  const [singleMessage, setSingleMessage] = useState("");

  useEffect(() => {
    api.get("/admin/batches").then((res) => setBatches(res.data));
  }, []);

  useEffect(() => {
    if (batch) api.get(`/students/by-batch/${batch}`).then((res) => setStudents(res.data));
  }, [batch]);

  function selectedAcademicYear() {
    const selected = batches.find((b) => b._id === batch);
    return selected?.academicYear?._id || selected?.academicYear;
  }

  async function addSingle() {
    setSingleMessage("");
    if (!batch) return setSingleMessage("Select a batch first.");
    if (!single.regNo || !single.name) return setSingleMessage("Reg No and Name are required.");
    try {
      await api.post("/students/single-add", {
        ...single,
        batch,
        academicYear: selectedAcademicYear(),
      });
      setSingleMessage(`Added ${single.name}.`);
      setSingle({ regNo: "", name: "", email: "", phone: "" });
      const reload = await api.get(`/students/by-batch/${batch}`);
      setStudents(reload.data);
    } catch (err) {
      setSingleMessage(err.response?.data?.message || "Failed to add student");
    }
  }

  async function upload() {
    if (!batch || !file) return setMessage("Select a batch and a file first.");
    const form = new FormData();
    form.append("file", file);
    form.append("batch", batch);
    form.append("academicYear", selectedAcademicYear());
    try {
      const res = await api.post("/students/bulk-upload", form, { headers: { "Content-Type": "multipart/form-data" } });
      setMessage(`Created: ${res.data.created}, Updated: ${res.data.updated}, Skipped: ${res.data.skipped}`);
      const reload = await api.get(`/students/by-batch/${batch}`);
      setStudents(reload.data);
    } catch (err) {
      setMessage(err.response?.data?.message || "Upload failed");
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-card p-6">
      <h2 className="text-lg font-semibold text-brand mb-4">Students</h2>

      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-600 mb-1">Batch</label>
        <select value={batch} onChange={(e) => setBatch(e.target.value)} className="border rounded-lg px-3 py-2 min-w-[220px]">
          <option value="">Select Batch</option>
          {batches.map((b) => <option key={b._id} value={b._id}>{b.displayName}</option>)}
        </select>
      </div>

      {/* Single student */}
      <div className="border rounded-xl p-4 mb-6 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Add a single student</h3>
        <div className="flex flex-wrap gap-3">
          <input placeholder="Reg No" value={single.regNo} onChange={(e) => setSingle({ ...single, regNo: e.target.value })} className="border rounded-lg px-3 py-2 w-40" />
          <input placeholder="Name" value={single.name} onChange={(e) => setSingle({ ...single, name: e.target.value })} className="border rounded-lg px-3 py-2 w-56" />
          <input placeholder="Email (optional)" value={single.email} onChange={(e) => setSingle({ ...single, email: e.target.value })} className="border rounded-lg px-3 py-2 w-56" />
          <input placeholder="Phone (optional)" value={single.phone} onChange={(e) => setSingle({ ...single, phone: e.target.value })} className="border rounded-lg px-3 py-2 w-40" />
          <button onClick={addSingle} className="bg-primary text-white px-5 py-2 rounded-lg">Add Student</button>
        </div>
        {singleMessage && <p className="text-sm text-gray-700 mt-2">{singleMessage}</p>}
      </div>

      {/* Bulk upload */}
      <div className="border rounded-xl p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Bulk upload (Excel)</h3>
        <p className="text-xs text-gray-500 mb-3">Expected columns: <code>regNo, name, email, phone</code></p>
        <div className="flex flex-wrap gap-3">
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files[0])} className="border rounded-lg px-3 py-2" />
          <button onClick={upload} className="bg-accent text-white px-5 py-2 rounded-lg">Upload</button>
        </div>
        {message && <p className="text-sm text-green-700 mt-2">{message}</p>}
      </div>

      {students.length > 0 && (
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-100"><th className="p-2 text-left">Reg No</th><th className="p-2 text-left">Name</th><th className="p-2 text-left">Email</th></tr></thead>
          <tbody>
            {students.map((s) => (
              <tr key={s._id} className="border-b">
                <td className="p-2">{s.regNo}</td>
                <td className="p-2">{s.name}</td>
                <td className="p-2 text-gray-500">{s.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

