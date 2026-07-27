import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [staffId, setStaffId] = useState("");
  const [dob, setDob] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { staff_id: staffId.trim(), dob });
      login(res.data.token, res.data.staff, false);
      navigate("/overview");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.4] [background-image:radial-gradient(circle,rgba(37,99,235,0.06)_1px,transparent_1px)] [background-size:26px_26px] pointer-events-none" />
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden relative border border-gray-100">
        <div className="bg-gradient-to-r from-brand to-brand-dark px-8 py-8 text-center text-white">
          <div className="mx-auto mb-3 w-20 h-20 rounded-2xl bg-white flex items-center justify-center p-1 shadow-lg">
            <img src="/college-logo.webp" alt="College logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-xl font-display font-bold tracking-wide">CO-PO-PSO Attainment Portal</h1>
          <p className="text-xs text-white/70 mt-1">Staff Login</p>
        </div>

        <div className="px-8 py-8">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Staff ID</label>
              <input
                autoFocus
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                placeholder="e.g. BHC-STE-00466"
                className="w-full input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full input-field"
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button disabled={loading} className="btn btn-primary w-full py-2.5">
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/admin-login" className="text-xs text-gray-400 hover:text-brand">
              Administrator Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
