import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

export default function AdminLogin() {
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/admin-login", { adminId, password });
      login(res.data.token, null, true);
      navigate("/admin");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-slate-100 px-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.4] [background-image:radial-gradient(circle,rgba(15,23,42,0.05)_1px,transparent_1px)] [background-size:26px_26px] pointer-events-none" />
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden relative border border-gray-100">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-8 py-7 text-center">
          <div className="mx-auto mb-3 w-16 h-16 rounded-2xl bg-white flex items-center justify-center p-1 shadow-lg">
            <img src="/college-logo.webp" alt="College logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-lg font-display font-bold">Administrator Login</h1>
        </div>
        <form onSubmit={submit} className="px-8 py-8 space-y-4">
          <input
            value={adminId}
            onChange={(e) => setAdminId(e.target.value)}
            placeholder="Admin ID"
            className="w-full input-field"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full input-field"
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={loading} className="btn w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white">
            {loading ? "Signing in..." : "Login"}
          </button>
          <Link to="/login" className="block text-center text-xs text-gray-400 hover:text-slate-700 mt-2">
            ← Back to Staff Login
          </Link>
        </form>
      </div>
    </div>
  );
}
