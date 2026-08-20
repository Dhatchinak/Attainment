import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AcademicYears from "../components/admin/AcademicYears";
import SyncFromErp from "../components/admin/SyncFromErp";
import Batches from "../components/admin/Batches";
import AdmissionBatches from "../components/admin/AdmissionBatches";
import Allocations from "../components/admin/Allocations";
import UploadStudents from "../components/admin/UploadStudents";
import AttainmentRecords from "../components/admin/AttainmentRecords";
import CIADataImport from "../components/admin/CIADataImport";
import HistoricalAttainmentArchive from "../components/admin/HistoricalAttainmentArchive";
import DepartmentAccounts from "../components/admin/DepartmentAccounts";
import AcademicDataMigration from "../components/admin/AcademicDataMigration";

const TABS = [
  { key: "years", label: "Academic Years", Component: AcademicYears },
  { key: "sync", label: "Sync from ERP", Component: SyncFromErp },
  { key: "academic-migration", label: "CIA / ESE Migration", Component: AcademicDataMigration },
  { key: "admission-batches", label: "Admission Batches", Component: AdmissionBatches },
  { key: "batches", label: "Classes", Component: Batches },
  { key: "allocations", label: "Course Allocations", Component: Allocations },
  { key: "students", label: "Upload Students", Component: UploadStudents },
  { key: "cia-data", label: "CIA Data Import", Component: CIADataImport },
  { key: "attainment", label: "Attainment Records", Component: AttainmentRecords },
  { key: "historical-attainment", label: "Historical Attainment", Component: HistoricalAttainmentArchive },
  { key: "department-accounts", label: "Department Logins", Component: DepartmentAccounts },
];

export default function AdminDashboard() {
  const [tab, setTab] = useState("years");
  const { logout } = useAuth();
  const navigate = useNavigate();
  const Active = TABS.find((t) => t.key === tab).Component;

  function doLogout() {
    logout();
    navigate("/admin-login");
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200">
        <div className="h-1 bg-gradient-to-r from-slate-800 via-slate-600 to-slate-800" />
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center p-0.5 shadow-sm shrink-0">
              <img src="/college-logo.webp" alt="College logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="font-display font-bold tracking-tight text-gray-900">Admin Console</h1>
              <p className="text-xs text-gray-500">CO-PO-PSO Attainment Portal</p>
            </div>
          </div>
          <button onClick={doLogout} className="btn btn-ghost">
            Logout
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-5 py-6">
        <div className="flex gap-1.5 mb-5 flex-wrap bg-white p-1.5 rounded-xl shadow-card w-fit">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.key ? "bg-primary text-white shadow-glow" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Active />
      </div>
    </div>
  );
}
