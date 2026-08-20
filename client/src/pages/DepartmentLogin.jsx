import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

export default function DepartmentLogin() {
  const [departments, setDepartments] = useState([]);
  const [departmentCode, setDepartmentCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    api.get("/auth/departments")
      .then(({ data }) => {
        setDepartments(data || []);
        if (data?.length) setDepartmentCode(data[0].departmentCode);
      })
      .catch(() => setError("Could not load department accounts."))
      .finally(() => setLoadingDepartments(false));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/department-login", { departmentCode, password });
      login(data.token, data.department, false, "department");
      navigate("/department");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Department login failed.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cyan-50 via-white to-blue-50 px-4">
    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
      <div className="bg-gradient-to-r from-cyan-800 to-blue-900 px-8 py-8 text-center text-white">
        <div className="mx-auto mb-3 w-16 h-16 rounded-2xl bg-white flex items-center justify-center p-1 shadow-lg"><img src="/college-logo.webp" alt="College logo" className="w-full h-full object-contain" /></div>
        <h1 className="text-xl font-display font-bold">Department Attainment Portal</h1>
        <p className="text-xs text-white/70 mt-1">HOD / Department Login</p>
      </div>
      <form onSubmit={submit} className="px-8 py-8 space-y-5">
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Department</label><select className="input-field w-full" value={departmentCode} onChange={(e) => setDepartmentCode(e.target.value)} disabled={loadingDepartments || !departments.length} required>
          {departments.map((department) => <option key={department.departmentCode} value={department.departmentCode}>{department.departmentCode} — {department.departmentName}</option>)}
        </select></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Department Password</label><input type="password" className="input-field w-full uppercase" value={password} onChange={(e) => setPassword(e.target.value.toUpperCase())} placeholder={departmentCode ? `${departmentCode}##` : "Code + 2 digits"} required /></div>
        {!loadingDepartments && !departments.length && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">No department account is active. Ask the administrator to open Department Logins and synchronize ERP departments.</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={loading || !departments.length} className="btn btn-primary w-full py-2.5">{loading ? "Signing in..." : "Login to Department"}</button>
        <div className="flex justify-center gap-4 text-xs text-gray-400"><Link to="/login" className="hover:text-brand">Staff Login</Link><Link to="/admin-login" className="hover:text-brand">Administrator Login</Link></div>
      </form>
    </div>
  </div>;
}
