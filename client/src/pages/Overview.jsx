import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import { isQuestionWiseAcademicYear } from "../utils/workflowMode";
import { downloadHodChecklistPdf } from "../utils/checklistPdf";

const STATUS_META = {
  completed: { label: "Completed", badgeClass: "status-success", buttonLabel: "View Report", icon: "✓" },
  in_progress: { label: "In Progress", badgeClass: "status-warning", buttonLabel: "Resume", icon: "↻" },
  not_started: { label: "Not Started", badgeClass: "status-neutral", buttonLabel: "Start", icon: "→" },
};

const QUESTION_STEP_ORDER = ["matrixLocked", "settingsSet", "eseEntered", "t1Verified", "t2Verified", "activitiesVerified", "computed"];
const LEGACY_STEP_ORDER = ["matrixLocked", "settingsSet", "eseEntered", "ciaEntered", "computed"];

const QUESTION_STEP_LABELS = {
  matrixLocked: "CO-PO-PSO Matrix",
  settingsSet: "Thresholds",
  eseEntered: "ESE Marks",
  t1Verified: "T1 Question-wise",
  t2Verified: "T2 Question-wise",
  activitiesVerified: "CIA Activities",
  computed: "CO Calculation",
};

const LEGACY_STEP_LABELS = {
  matrixLocked: "CO-PO-PSO Matrix",
  settingsSet: "Thresholds",
  eseEntered: "ESE Marks",
  ciaEntered: "CIA Marks",
  computed: "Consolidated CO",
};

function isQuestionWiseItem(item) {
  if (item?.workflowMode) return item.workflowMode === "question_wise";
  return isQuestionWiseAcademicYear(item?.academicYear?.year);
}

function workflowFor(item) {
  return isQuestionWiseItem(item)
    ? { mode: "Question-wise CIA", order: QUESTION_STEP_ORDER, labels: QUESTION_STEP_LABELS }
    : { mode: "Legacy CIA", order: LEGACY_STEP_ORDER, labels: LEGACY_STEP_LABELS };
}

function cleanCourseName(value = "") {
  return String(value)
    .replace(/^(UG|PG)-/i, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classLabel(batch) {
  if (!batch) return "Class not available";
  const course = cleanCourseName(batch.course || "");
  const year = batch.year ? `Year ${batch.year}` : "";
  const section = batch.section === "NIL" ? "Aided (NIL)" : batch.section ? `Section ${batch.section}` : "";
  const built = [year, course, section].filter(Boolean).join(" · ");
  return built || batch.displayName || "Class";
}

function batchYear(batch) {
  if (batch?.admissionYear) return String(batch.admissionYear);
  const match = String(batch?.displayName || "").match(/20\d{2}/);
  return match?.[0] || "—";
}

function yesNo(value) {
  return value ? "YES" : "NO";
}

function currentStage(item) {
  if (item?.status === "completed" || item?.progress?.completed) return "Completed";
  const workflow = workflowFor(item);
  const pendingKey = workflow.order.find((key) => !item?.progress?.[key]);
  return pendingKey ? workflow.labels[pendingKey] : "Final Report";
}

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
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [deptItems, setDeptItems] = useState(null);
  const [deptLoading, setDeptLoading] = useState(false);
  const [deptError, setDeptError] = useState("");
  const overviewRequestRef = useRef(0);
  const departmentRequestRef = useRef(0);

  useEffect(() => {
    let active = true;
    api.get("/meta/academic-years")
      .then((res) => {
        if (!active) return;
        const years = res.data || [];
        setAcademicYears(years);
        const preferred = years.find((year) => year.year === "2025-2026") || years[0];
        setAcademicYear(preferred?._id || "");
        if (!preferred) setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError("Failed to load academic years.");
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const selectedYear = academicYears.find((year) => year._id === academicYear);

  const loadOverview = useCallback(() => {
    if (!academicYear) {
      setItems([]);
      return;
    }
    const requestedYear = academicYear;
    const requestId = ++overviewRequestRef.current;
    setLoading(true);
    setError("");
    api
      .get("/attainment/overview", { params: { academicYear: requestedYear } })
      .then((res) => {
        if (requestId !== overviewRequestRef.current) return;
        const exactYearItems = (res.data || []).filter(
          (item) => String(item.academicYear?._id || "") === String(requestedYear)
        );
        setItems(exactYearItems);
      })
      .catch(() => {
        if (requestId === overviewRequestRef.current) setError("Failed to load your classes.");
      })
      .finally(() => {
        if (requestId === overviewRequestRef.current) setLoading(false);
      });
  }, [academicYear]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  useEffect(() => {
    if (!staff?.isHOD || !academicYear) {
      setDeptItems(null);
      return;
    }
    const requestedYear = academicYear;
    const requestId = ++departmentRequestRef.current;
    setDeptLoading(true);
    setDeptError("");
    api
      .get("/attainment/department-overview", { params: { academicYear: requestedYear } })
      .then((res) => {
        if (requestId !== departmentRequestRef.current) return;
        setDeptItems({
          ...res.data,
          items: (res.data?.items || []).filter(
            (item) => String(item.academicYear?._id || "") === String(requestedYear)
          ),
        });
      })
      .catch(() => {
        if (requestId === departmentRequestRef.current) setDeptError("Failed to load the department attainment overview.");
      })
      .finally(() => {
        if (requestId === departmentRequestRef.current) setDeptLoading(false);
      });
  }, [staff?.isHOD, academicYear]);

  const summary = useMemo(() => {
    const completed = items.filter((item) => item.status === "completed").length;
    const inProgress = items.filter((item) => item.status === "in_progress").length;
    const notStarted = items.filter((item) => item.status === "not_started").length;
    const semesters = new Set(items.map((item) => item.allocation?.semester).filter(Boolean)).size;
    const completion = items.length ? Math.round((completed / items.length) * 100) : 0;
    return { total: items.length, completed, inProgress, notStarted, semesters, pending: inProgress + notStarted, completion };
  }, [items]);

  const visibleItems = useMemo(() => items.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const text = [
      item.allocation?.paperCode,
      item.allocation?.paperName,
      classLabel(item.batch),
      batchYear(item.batch),
      item.allocation?.semester,
    ].join(" ").toLowerCase();
    return text.includes(q);
  }), [items, statusFilter, search]);

  const grouped = useMemo(() => Object.entries(
    visibleItems.reduce((groups, item) => {
      const semester = item.allocation?.semester ?? "—";
      (groups[semester] = groups[semester] || []).push(item);
      return groups;
    }, {})
  ).sort((a, b) => Number(a[0]) - Number(b[0])), [visibleItems]);

  function doLogout() {
    logout();
    navigate("/login");
  }

  function openAllocation(item) {
    navigate("/dashboard", {
      state: {
        academicYear: item.academicYear?._id,
        academicYearLabel: item.academicYear?.year,
        programme: item.batch?.programme,
        batch: item.batch?._id,
        batchLabel: classLabel(item.batch),
        admissionYear: item.batch?.admissionYear,
        allocation: item.allocation,
        completed: item.status === "completed",
        initialStep: item.resumeStep,
        progress: item.progress,
      },
    });
  }

  function addPreviousBatch() {
    navigate("/dashboard", { state: null });
  }

  async function syncClassesForYear() {
    if (!academicYear) return;
    setSyncing(true);
    setSyncMessage("");
    try {
      const { data } = await api.post("/meta/sync-my-classes", { academicYear });
      const removed = Number(data.duplicatesRemoved || 0) + Number(data.emptyDuplicateBatchesRemoved || 0);
      setSyncMessage(
        `Updated ${data.uniqueClassPapers || 0} unique class-paper${data.uniqueClassPapers === 1 ? "" : "s"}` +
        (removed ? ` and removed ${removed} duplicate record${removed === 1 ? "" : "s"}.` : ".")
      );
      loadOverview();
    } catch (err) {
      setSyncMessage(err.response?.data?.message || "Could not fetch your current ERP classes.");
    } finally {
      setSyncing(false);
    }
  }

  function downloadChecklist() {
    if (!items.length) return;
    const yearLabel = selectedYear?.year || "Academic Year";
    const staffName = [staff?.salute, staff?.name].filter(Boolean).join(" ");

    const sortedItems = items
      .slice()
      .sort((a, b) => {
        const classCompare = classLabel(a.batch).localeCompare(classLabel(b.batch));
        if (classCompare) return classCompare;
        return Number(a.allocation?.semester || 0) - Number(b.allocation?.semester || 0)
          || String(a.allocation?.paperCode || "").localeCompare(String(b.allocation?.paperCode || ""));
      });

    const classMap = new Map();
    sortedItems.forEach((item) => {
      const className = classLabel(item.batch);
      const key = `${className}::${batchYear(item.batch)}`;
      const current = classMap.get(key) || { className, total: 0, completed: 0, pending: 0 };
      current.total += 1;
      if (item.status === "completed") current.completed += 1;
      else current.pending += 1;
      classMap.set(key, current);
    });

    const classes = [...classMap.values()].map((row) => ({
      ...row,
      status: row.pending === 0 ? "COMPLETED" : `PENDING (${row.pending})`,
    }));

    const papers = sortedItems.map((item) => ({
      className: classLabel(item.batch),
      semester: item.allocation?.semester || "-",
      batch: batchYear(item.batch),
      paperCode: item.allocation?.paperCode || "",
      paperName: item.allocation?.paperName || "",
      method: isQuestionWiseItem(item) ? "Question-wise" : "Legacy",
      status: item.status === "completed" ? "COMPLETED" : "PENDING",
      stage: item.status === "completed" ? "Final Report completed" : currentStage(item),
    }));

    downloadHodChecklistPdf({
      academicYear: yearLabel,
      staffName,
      department: staff?.department_name || "",
      summary: {
        total: summary.total,
        completed: summary.completed,
        pending: summary.pending,
        completion: summary.completion,
      },
      classes,
      papers,
    });
  }

  return (
    <div className="min-h-screen">
      <header className="portal-header">
        <div className="max-w-[1420px] mx-auto px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-white border border-slate-200 p-0.5 shrink-0">
              <img src="/college-logo.webp" alt="College logo" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display font-bold text-base text-slate-900 tracking-tight">CO-PO-PSO Attainment Portal</h1>
              <p className="text-xs text-slate-500 truncate">
                {staff?.salute} {staff?.name} · {staff?.designation} · {staff?.department_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {staff?.isHOD && <span className="status-chip status-admin">HOD</span>}
            <button onClick={doLogout} className="btn btn-ghost">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-[1420px] mx-auto px-5 py-7">
        <section className="dashboard-hero">
          <div>
            <span className="dashboard-eyebrow">ACADEMIC ATTAINMENT WORKSPACE</span>
            <h2>Welcome, {staff?.salute} {staff?.name}</h2>
            <p>Track every assigned paper, continue pending work, and download the class-wise PDF completion checklist required for HOD submission.</p>
          </div>
          <div className="dashboard-year-card">
            <span>Working Academic Year</span>
            <select value={academicYear} onChange={(e) => {
              setItems([]);
              setDeptItems(null);
              setStatusFilter("all");
              setSearch("");
              setAcademicYear(e.target.value);
            }}>
              {academicYears.map((year) => <option key={year._id} value={year._id}>{year.year}</option>)}
            </select>
          </div>
        </section>

        <section className="dashboard-metrics">
          <div className="dashboard-metric"><span>Total Papers</span><strong>{summary.total}</strong><small>Assigned in {selectedYear?.year || "selected year"}</small></div>
          <div className="dashboard-metric dashboard-metric-success"><span>Completed</span><strong>{summary.completed}</strong><small>{summary.completion}% ready for HOD</small></div>
          <div className="dashboard-metric dashboard-metric-warning"><span>In Progress</span><strong>{summary.inProgress}</strong><small>Continue from the saved CIA stage</small></div>
          <div className="dashboard-metric"><span>Not Started</span><strong>{summary.notStarted}</strong><small>Attainment work not yet opened</small></div>
        </section>

        <section className="dashboard-toolbar">
          <div className="dashboard-toolbar-group">
            <button onClick={syncClassesForYear} disabled={!academicYear || syncing} className="btn btn-primary">
              {syncing ? "Syncing ERP..." : "↻ Sync Current Classes"}
            </button>
            <button onClick={addPreviousBatch} className="btn btn-ghost">＋ Add Previous Batch / Paper</button>
            <button onClick={downloadChecklist} disabled={!items.length} className="btn btn-ghost">↓ Download HOD Checklist (PDF)</button>
          </div>
          <div className="dashboard-filters">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search paper or class..." className="input-field" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field">
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In Progress</option>
              <option value="not_started">Not Started</option>
            </select>
          </div>
        </section>

        {syncMessage && <div className="alert-success mb-5">{syncMessage}</div>}
        {loading && <div className="loading-state">Loading your attainment dashboard...</div>}
        {error && <p className="alert-error mb-5">{error}</p>}

        {!loading && !error && items.length === 0 && (
          <section className="dashboard-empty">
            <div className="dashboard-empty-icon">◎</div>
            <h3>No papers are available for {selectedYear?.year || "this academic year"}</h3>
            <p>Sync your current ERP allocation, or add a previous admission batch/paper such as a 2020–2025 batch.</p>
            <div className="flex gap-3 justify-center flex-wrap mt-4">
              <button onClick={syncClassesForYear} className="btn btn-primary">Sync Current Classes</button>
              <button onClick={addPreviousBatch} className="btn btn-ghost">Add Previous Batch / Paper</button>
            </div>
          </section>
        )}

        {!loading && !error && items.length > 0 && visibleItems.length === 0 && (
          <div className="dashboard-empty py-10"><h3>No papers match the current filter.</h3></div>
        )}

        {!loading && !error && grouped.map(([semester, semesterItems]) => (
          <section key={semester} className="semester-section">
            <div className="semester-heading">
              <div>
                <span>SEMESTER</span>
                <strong>{semester}</strong>
              </div>
              <p>{semesterItems.length} paper{semesterItems.length === 1 ? "" : "s"}</p>
            </div>
            <div className="course-card-grid">
              {semesterItems.map((item) => {
                const meta = STATUS_META[item.status] || STATUS_META.not_started;
                const workflow = workflowFor(item);
                const stepsDone = workflow.order.filter((key) => item.progress?.[key]).length;
                const pct = item.status === "completed" ? 100 : Math.round((stepsDone / workflow.order.length) * 100);
                return (
                  <article key={item.allocation._id} className="course-progress-card">
                    <div className="course-card-topline">
                      <span className={`status-chip ${meta.badgeClass}`}>{meta.icon} {meta.label}</span>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <span className={`course-mode-chip ${isQuestionWiseItem(item) ? "is-question" : "is-legacy"}`}>{workflow.mode}</span>
                        <span className="course-sem-chip">Sem {item.allocation.semester}</span>
                      </div>
                    </div>
                    <div className="course-card-main">
                      <h3>{item.allocation.paperCode}</h3>
                      <p className="course-title">{item.allocation.paperName}</p>
                      <p className="course-class">{classLabel(item.batch)}</p>
                    </div>
                    <div className="course-meta-grid">
                      <div><span>Batch</span><strong>{batchYear(item.batch)}</strong></div>
                      <div><span>Academic Year</span><strong>{item.academicYear?.year || selectedYear?.year || "—"}</strong></div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 mb-3 flex items-center justify-between gap-3">
                      <span className="text-xs text-slate-500">Current Stage</span>
                      <strong className="text-xs text-slate-800 text-right">{currentStage(item)}</strong>
                    </div>
                    <div className="course-progress-row">
                      <div className="course-progress-label"><span>Workflow Progress</span><strong>{pct}%</strong></div>
                      <div className="course-progress-track"><div style={{ width: `${pct}%` }} /></div>
                    </div>
                    <button onClick={() => openAllocation(item)} className="btn btn-primary w-full">{meta.buttonLabel} →</button>
                  </article>
                );
              })}
            </div>
          </section>
        ))}

        {staff?.isHOD && (
          <section className="hod-overview-card">
            <div className="section-heading-row mb-4">
              <div>
                <span className="section-kicker">HOD VIEW</span>
                <h2>Department Completion Monitor</h2>
                <p>Live attainment status for all staff and papers in {deptItems?.department_name || staff?.department_name}.</p>
              </div>
            </div>
            {deptLoading && <div className="loading-state py-8">Loading department overview...</div>}
            {deptError && <p className="alert-error">{deptError}</p>}
            {!deptLoading && !deptError && deptItems && (
              <div className="table-shell">
                <table className="pro-table">
                  <thead><tr><th className="!text-left">Staff</th><th className="!text-left">Paper</th><th>Batch</th><th>Semester</th><th>Status</th></tr></thead>
                  <tbody>
                    {deptItems.items.map((item) => {
                      const meta = STATUS_META[item.status] || STATUS_META.not_started;
                      return (
                        <tr key={item.allocation._id}>
                          <td className="!text-left font-medium">{item.staff?.name}</td>
                          <td className="!text-left"><strong>{item.allocation.paperCode}</strong><div className="text-xs text-slate-500">{item.allocation.paperName}</div></td>
                          <td>{batchYear(item.batch)}</td>
                          <td>{item.allocation.semester}</td>
                          <td><span className={`status-chip ${meta.badgeClass}`}>{meta.icon} {meta.label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
