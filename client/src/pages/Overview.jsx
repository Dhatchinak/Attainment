import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

const STATUS_META = {
  completed: {
    label: "Completed",
    badgeClass: "bg-teal-50 text-teal-700 border border-teal-100",
    buttonLabel: "View / Edit",
    buttonClass: "btn-primary",
    icon: "✓",
  },
  in_progress: {
    label: "Resume",
    badgeClass: "bg-amber-50 text-amber-700 border border-amber-100",
    buttonLabel: "Resume",
    buttonClass: "btn-accent",
    icon: "⏳",
  },
  not_started: {
    label: "Not started",
    badgeClass: "bg-slate-50 text-slate-500 border border-slate-100",
    buttonLabel: "Start",
    buttonClass: "btn-primary",
    icon: "▶",
  },
};

const STEP_ORDER = ["matrixLocked", "settingsSet", "studentsUploaded", "eseEntered", "ciaEntered", "computed"];

const SEMESTERS = Array.from({ length: 8 }, (_, i) => i + 1);

export default function Overview() {
  const { staff, logout } = useAuth();
  const navigate = useNavigate();

  const [academicYears, setAcademicYears] = useState([]);
  const [academicYear, setAcademicYear] = useState("");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const [deptItems, setDeptItems] = useState(null);
  const [deptLoading, setDeptLoading] = useState(false);
  const [deptError, setDeptError] = useState("");

  useEffect(() => {
    api.get("/meta/academic-years").then((res) => {
      setAcademicYears(res.data);
      // Default to the most recent active year so the list isn't empty on first load.
      if (res.data.length > 0) setAcademicYear(res.data[0]._id);
    });
  }, []);

  const loadOverview = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .get("/attainment/overview", { params: academicYear ? { academicYear } : {} })
      .then((res) => setItems(res.data))
      .catch(() => setError("Failed to load your classes."))
      .finally(() => setLoading(false));
  }, [academicYear]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!staff?.isHOD || !academicYear) {
      setDeptItems(null);
      return;
    }
    setDeptLoading(true);
    setDeptError("");
    api
      .get("/attainment/department-overview", { params: { academicYear } })
      .then((res) => setDeptItems(res.data))
      .catch(() => setDeptError("Failed to load your department's attainment overview."))
      .finally(() => setDeptLoading(false));
  }, [staff?.isHOD, academicYear]);

  function doLogout() {
    logout();
    navigate("/login");
  }

  function openAllocation(item) {
    navigate("/dashboard", {
      state: {
        academicYear: item.academicYear?._id,
        programme: item.batch?.programme,
        batch: item.batch?._id,
        batchLabel: item.batch?.displayName,
        allocation: item.allocation,
        completed: item.status === "completed",
        initialStep: item.resumeStep,
        progress: item.progress,
      },
    });
  }

  function startFresh() {
    // No context — lets the staff pick Academic Year / Programme / Semester /
    // Batch / Paper manually (e.g. a brand-new class not synced yet).
    navigate("/dashboard", { state: null });
  }

  // Pulls this staff's classes straight from the ERP for the selected academic
  // year, across every semester (class_attend doesn't carry a semester number,
  // so we sweep 1-8 the same way the manual "Select Course" flow does one at a time).
  async function syncClassesForYear() {
    if (!academicYear) return;
    setSyncing(true);
    setSyncMessage("");
    try {
      await Promise.allSettled(
        SEMESTERS.map((semester) => api.post("/meta/sync-my-classes", { academicYear, semester }))
      );
      setSyncMessage("Synced your classes from the ERP for this academic year.");
      loadOverview();
    } catch {
      setSyncMessage("Sync finished with some errors — showing whatever was found.");
      loadOverview();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-[1380px] mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-white border border-gray-100 flex items-center justify-center p-0.5 shrink-0">
              <img src="/college-logo.webp" alt="College logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="font-display font-semibold text-base tracking-tight text-gray-900">
                CO-PO-PSO Attainment Portal
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {staff?.salute} {staff?.name} · {staff?.designation} · {staff?.department_name}
                {staff?.isHOD && (
                  <span className="badge bg-indigo-50 text-indigo-600 border border-indigo-100 ml-2">HOD</span>
                )}
              </p>
            </div>
          </div>
          <button onClick={doLogout} className="btn btn-ghost">
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-[1380px] mx-auto px-5 py-7">
        <div className="card-flat p-4 mb-6 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
            <select
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="input-field min-w-[160px]"
            >
              <option value="">-- All years --</option>
              {academicYears.map((y) => (
                <option key={y._id} value={y._id}>
                  {y.year}
                </option>
              ))}
            </select>
          </div>
          <button onClick={syncClassesForYear} disabled={!academicYear || syncing} className="btn btn-accent">
            {syncing ? "Fetching classes..." : "Fetch my classes for this year"}
          </button>
          <button onClick={startFresh} className="btn btn-ghost ml-auto">
            + Select another class manually
          </button>
        </div>
        {syncMessage && <p className="text-sm text-emerald-600 -mt-4 mb-6">{syncMessage}</p>}

        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display text-xl font-bold text-gray-900 tracking-tight">Your Classes</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Pick up any class right where you left off, or start a fresh one.
            </p>
          </div>
        </div>

        {loading && <div className="p-8 text-center text-gray-500">Loading your classes...</div>}
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {!loading && !error && items.length === 0 && (
          <div className="card-flat p-8 text-center mb-8">
            <p className="text-gray-600 mb-4">
              No classes found for this selection yet. Pick an Academic Year above and click{" "}
              <strong>"Fetch my classes for this year"</strong>, or select one manually.
            </p>
            <button onClick={startFresh} className="btn btn-primary">
              Select Manually
            </button>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="flex gap-3 mb-6 flex-wrap">
            <span className="badge bg-teal-50 text-teal-700 border border-teal-100">
              ✓ {items.filter((i) => i.status === "completed").length} Completed
            </span>
            <span className="badge bg-amber-50 text-amber-700 border border-amber-100">
              ⏳ {items.filter((i) => i.status === "in_progress").length} In progress
            </span>
            <span className="badge bg-slate-50 text-slate-500 border border-slate-100">
              ▶ {items.filter((i) => i.status === "not_started").length} Not started
            </span>
          </div>
        )}

        {Object.entries(
          items.reduce((groups, item) => {
            const sem = item.allocation.semester ?? "—";
            (groups[sem] = groups[sem] || []).push(item);
            return groups;
          }, {})
        )
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([sem, semItems]) => (
            <section key={sem} className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-xs font-bold tracking-wide text-gray-400 uppercase">Semester {sem}</h3>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {semItems.map((item) => {
                  const meta = STATUS_META[item.status] || STATUS_META.not_started;
                  const stepsDone = STEP_ORDER.filter((k) => item.progress?.[k]).length;
                  const pct = Math.round((stepsDone / STEP_ORDER.length) * 100);
                  return (
                    <div
                      key={item.allocation._id}
                      className="card-flat p-4 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-display font-semibold text-gray-900 leading-tight tracking-tight">
                            {item.allocation.paperCode}
                          </h3>
                          <span className={`badge ${meta.badgeClass} shrink-0`}>
                            {meta.icon} {meta.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-1 line-clamp-2">{item.allocation.paperName}</p>
                        <p className="text-xs text-gray-400">
                          {item.batch?.displayName}
                          {item.academicYear?.year ? ` · ${item.academicYear.year}` : ""}
                        </p>
                      </div>
                      <div className="mt-4">
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-3">
                          <div
                            className={`h-full rounded-full transition-all ${
                              item.status === "completed" ? "bg-teal-500" : "bg-brand"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <button onClick={() => openAllocation(item)} className={`btn ${meta.buttonClass} w-full`}>
                          {meta.buttonLabel}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

        {staff?.isHOD && (
          <div className="card-flat p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              Department Attainment Overview
              <span className="badge bg-indigo-50 text-indigo-600 border border-indigo-100 ml-2">
                {deptItems?.department_name || staff?.department_name}
              </span>
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Every class in your department for the selected academic year, and how far each staff member has
              progressed.
            </p>

            {deptLoading && <div className="p-6 text-center text-gray-500">Loading department overview...</div>}
            {deptError && <p className="text-sm text-red-600">{deptError}</p>}

            {!deptLoading && !deptError && deptItems && (
              <>
                <div className="flex gap-3 mb-4 flex-wrap">
                  <span className="badge bg-teal-50 text-teal-700 border border-teal-100">
                    ✓ Completed: {deptItems.items.filter((i) => i.status === "completed").length}
                  </span>
                  <span className="badge bg-amber-50 text-amber-700 border border-amber-100">
                    ⏳ In progress: {deptItems.items.filter((i) => i.status === "in_progress").length}
                  </span>
                  <span className="badge bg-slate-50 text-slate-500 border border-slate-100">
                    ▶ Not started: {deptItems.items.filter((i) => i.status === "not_started").length}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="py-2 pr-4">Staff</th>
                        <th className="py-2 pr-4">Paper</th>
                        <th className="py-2 pr-4">Class</th>
                        <th className="py-2 pr-4">Semester</th>
                        <th className="py-2 pr-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deptItems.items.map((item) => {
                        const meta = STATUS_META[item.status] || STATUS_META.not_started;
                        return (
                          <tr key={item.allocation._id} className="border-b last:border-0">
                            <td className="py-2 pr-4">{item.staff?.name}</td>
                            <td className="py-2 pr-4">
                              {item.allocation.paperCode} · {item.allocation.paperName}
                            </td>
                            <td className="py-2 pr-4">{item.batch?.displayName || "-"}</td>
                            <td className="py-2 pr-4">{item.allocation.semester}</td>
                            <td className="py-2 pr-4">
                              <span className={`badge ${meta.badgeClass}`}>
                                {meta.icon} {meta.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {deptItems.items.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-gray-400">
                            No classes found for this department in this academic year.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}