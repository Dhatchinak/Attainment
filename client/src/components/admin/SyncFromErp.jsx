import React, { useEffect, useState } from "react";
import api from "../../api/axios";

export default function SyncFromErp() {
  const [years, setYears] = useState([]);
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState(1);

  const [departments, setDepartments] = useState([]);
  const [loadingErp, setLoadingErp] = useState(false);
  const [erpError, setErpError] = useState("");

  const [departmentCode, setDepartmentCode] = useState("");
  const [programId, setProgramId] = useState("");
  const [year, setYear] = useState("");
  const [sectionName, setSectionName] = useState("");

  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/admin/academic-years").then((res) => setYears(res.data));
  }, []);

  async function loadErpTree() {
    setLoadingErp(true);
    setErpError("");
    setDepartments([]);
    try {
      const res = await api.get("/admin/erp/departments");
      setDepartments(res.data || []);
    } catch (err) {
      setErpError(err.response?.data?.message || "Could not reach the ERP. Check the college network / referer.");
    } finally {
      setLoadingErp(false);
    }
  }

  const dept = departments.find((d) => d.department_code === departmentCode);
  const program = dept?.programs?.find((p) => p.program_id === programId);
  const yearBlock = program?.years?.find((y) => String(y.year) === String(year));
  const sections = yearBlock?.sections || [];

  async function sync() {
    if (!academicYear || !semester || !departmentCode || !programId || !year || !sectionName) {
      setError("Fill in every field before syncing.");
      return;
    }
    setSyncing(true);
    setError("");
    setResult(null);
    try {
      const res = await api.post("/admin/erp/sync-batch", {
        department_code: departmentCode,
        program_id: programId,
        year,
        section_name: sectionName,
        academicYear,
        semester: Number(semester),
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-card p-6">
      <h2 className="text-lg font-semibold text-brand mb-1">Sync Batches & Course Allocation from ERP</h2>
      <p className="text-sm text-gray-500 mb-5">
        Pulls a section's live timetable straight from the college ERP and creates its batch plus every
        staff → paper allocation automatically — no manual typing.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Academic Year</label>
          <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} className="border rounded-lg px-3 py-2 min-w-[160px]">
            <option value="">-- Select --</option>
            {years.map((y) => <option key={y._id} value={y._id}>{y.year}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Semester</label>
          <input type="number" min="1" max="12" value={semester} onChange={(e) => setSemester(e.target.value)} className="border rounded-lg px-3 py-2 w-24" />
        </div>
        <button onClick={loadErpTree} disabled={loadingErp} className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-700">
          {loadingErp ? "Fetching from ERP..." : departments.length ? "Refresh from ERP" : "Fetch Departments from ERP"}
        </button>
      </div>

      {erpError && <p className="text-sm text-red-600 mb-4">{erpError}</p>}

      {departments.length > 0 && (
        <div className="grid md:grid-cols-4 gap-3 mb-5">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
            <select
              value={departmentCode}
              onChange={(e) => { setDepartmentCode(e.target.value); setProgramId(""); setYear(""); setSectionName(""); }}
              className="w-full border rounded-lg px-2 py-2"
            >
              <option value="">-- Select --</option>
              {departments.map((d) => (
                <option key={d.department_code} value={d.department_code}>{d.department_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Programme</label>
            <select
              value={programId}
              onChange={(e) => { setProgramId(e.target.value); setYear(""); setSectionName(""); }}
              disabled={!dept}
              className="w-full border rounded-lg px-2 py-2 disabled:bg-gray-100"
            >
              <option value="">-- Select --</option>
              {dept?.programs?.map((p) => (
                <option key={p.program_id} value={p.program_id}>{p.program_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
            <select
              value={year}
              onChange={(e) => { setYear(e.target.value); setSectionName(""); }}
              disabled={!program}
              className="w-full border rounded-lg px-2 py-2 disabled:bg-gray-100"
            >
              <option value="">-- Select --</option>
              {program?.years?.map((y) => (
                <option key={y.year} value={y.year}>Year {y.year}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Section</label>
            <select
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              disabled={!yearBlock}
              className="w-full border rounded-lg px-2 py-2 disabled:bg-gray-100"
            >
              <option value="">-- Select --</option>
              {sections.map((s) => (
                <option key={s.section_name} value={s.section_name}>
                  Section {s.section_name} {s.section_shift ? `(${s.section_shift})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {sectionName && (
        <button onClick={sync} disabled={syncing} className="bg-accent text-white px-6 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50">
          {syncing ? "Syncing..." : `Sync ${program?.program_name} · Year ${year} · Section ${sectionName}`}
        </button>
      )}

      {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

      {result && (
        <div className="mt-5 bg-green-50 border border-green-200 rounded-lg p-4 text-sm">
          <p className="font-semibold text-green-800 mb-1">Synced: {result.batch?.displayName}</p>
          <p className="text-green-700">
            {result.papersFound} papers found in ERP timetable · {result.allocationsCreated} allocations created ·{" "}
            {result.allocationsUpdated} updated · {result.staffCached} new staff cached
          </p>
        </div>
      )}
    </div>
  );
}
