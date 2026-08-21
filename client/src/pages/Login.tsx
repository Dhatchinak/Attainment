import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

const STAFF_PREFIX = "BHC-STE-00";

export default function Login() {
  const [staffDigits, setStaffDigits] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();

  function updateStaffDigits(value) {
    setStaffDigits(String(value || "").replace(/\D/g, "").slice(0, 3));
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    if (staffDigits.length !== 3) {
      setError("Enter the last 3 digits of your Staff ID.");
      return;
    }

    setLoading(true);
    try {
      const fullStaffId = `${STAFF_PREFIX}${staffDigits}`;
      const res = await api.post("/auth/login", { staff_id: fullStaffId });
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
              <div className="flex rounded-xl border border-slate-300 bg-white overflow-hidden focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition">
                <div className="px-3.5 flex items-center bg-slate-50 border-r border-slate-200 text-sm font-semibold text-slate-600 select-none whitespace-nowrap">
                  {STAFF_PREFIX}
                </div>
                <input
                  autoFocus
                  inputMode="numeric"
                  pattern="[0-9]{3}"
                  maxLength={3}
                  value={staffDigits}
                  onChange={(e) => updateStaffDigits(e.target.value)}
                  placeholder="460"
                  className="min-w-0 flex-1 px-3.5 py-3 outline-none text-base font-semibold tracking-[0.18em] text-slate-900"
                  required
                />
              </div>
              <p className="text-xs text-slate-400 mt-1.5">Enter only the last 3 digits. Example: 460 → {STAFF_PREFIX}460</p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <button disabled={loading} className="btn btn-primary w-full py-2.5">
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>

          <div className="mt-6 text-center flex justify-center gap-4">
            <Link to="/department-login" className="text-xs text-gray-400 hover:text-brand">
              Department Login
            </Link>
            <Link to="/admin-login" className="text-xs text-gray-400 hover:text-brand">
              Administrator Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
