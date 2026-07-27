import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useLocation, Link } from "react-router-dom";
import StepSelectCourse from "../components/steps/StepSelectCourse";
import StepMatrix from "../components/steps/StepMatrix";
import StepSettings from "../components/steps/StepSettings";
import StepStudents from "../components/steps/StepStudents";
import StepESE from "../components/steps/StepESE";
import StepCIA from "../components/steps/StepCIA";
import StepConsolidated from "../components/steps/StepConsolidated";
import StepReport from "../components/steps/StepReport";

const STEPS = [
  "Select Course",
  "CO-PO-PSO Matrix",
  "Set Thresholds",
  "Student List",
  "ESE Mark Entry",
  "CIA Mark Entry",
  "Consolidated CO",
  "PO/PSO Report",
];

export default function Dashboard() {
  const { staff, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const incoming = location.state || null;

  const initialStep = incoming?.allocation ? incoming.initialStep ?? 1 : 0;
  const [activeStep, setActiveStep] = useState(initialStep);
  // Keep the furthest reached step separate from the step currently being viewed.
  // Going back to review an earlier section must not remove completion ticks.
  const [maxReachedStep, setMaxReachedStep] = useState(initialStep);
  const [context, setContext] = useState({
    academicYear: incoming?.academicYear || null,
    programme: incoming?.programme || null,
    batch: incoming?.batch || null,
    batchLabel: incoming?.batchLabel || null,
    allocation: incoming?.allocation || null, // selected paper allocation (semester+paper)
    completed: incoming?.completed || false,
    progress: incoming?.progress || {},
  });

  function goTo(step, markReached = false) {
    setActiveStep(step);
    if (markReached) setMaxReachedStep((current) => Math.max(current, step));
  }

  function updateContext(patch) {
    setContext((c) => ({ ...c, ...patch }));
  }

  function doLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200">
        <div className="h-1 bg-gradient-to-r from-brand via-indigo-500 to-brand-dark" />
        <div className="max-w-[1500px] mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center p-0.5 shadow-sm shrink-0">
              <img src="/college-logo.webp" alt="College logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg tracking-tight text-gray-900 flex items-center gap-2.5">
                CO-PO-PSO Attainment Portal
                {context.completed && (
                  <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                    ✓ Completed
                  </span>
                )}
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {staff?.salute} {staff?.name} · {staff?.designation} · {staff?.department_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/overview" className="btn btn-ghost">
              ← My Classes
            </Link>
            <button onClick={doLogout} className="btn btn-ghost">
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1500px] mx-auto px-5 py-5">
        <div className="card-surface p-4">
          <div className="flex items-center w-full">
            {STEPS.map((label, idx) => (
              <React.Fragment key={label}>
                <button
                  onClick={() => idx <= maxReachedStep && goTo(idx)}
                  disabled={idx > maxReachedStep}
                  className="flex flex-col items-center gap-1.5 shrink-0 group"
                >
                  <span
                    className={`step-pill ${
                      idx === activeStep
                        ? "bg-brand text-white shadow-glow scale-110"
                        : idx < maxReachedStep
                        ? "bg-emerald-500 text-white"
                        : "bg-gray-100 text-gray-400 group-disabled:cursor-not-allowed"
                    }`}
                  >
                    {idx < maxReachedStep ? "✓" : idx + 1}
                  </span>
                  <span
                    className={`hidden sm:block text-[10px] md:text-[11px] font-medium whitespace-nowrap transition-colors ${
                      idx === activeStep ? "text-brand" : idx < maxReachedStep ? "text-emerald-600" : "text-gray-400"
                    }`}
                  >
                    {label}
                  </span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-1 md:mx-2 rounded-full transition-colors ${idx < maxReachedStep ? "bg-emerald-400" : "bg-gray-200"}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-[1500px] mx-auto px-5 pb-14">
        {activeStep === 0 && (
          <StepSelectCourse context={context} updateContext={updateContext} onNext={(resumeStep) => goTo(resumeStep || 1, true)} />
        )}
        {activeStep === 1 && (
          <StepMatrix context={context} onNext={() => goTo(2, true)} onBack={() => goTo(0)} />
        )}
        {activeStep === 2 && (
          <StepSettings context={context} onNext={() => goTo(3, true)} onBack={() => goTo(1)} />
        )}
        {activeStep === 3 && (
          <StepStudents context={context} onNext={() => goTo(4, true)} onBack={() => goTo(2)} />
        )}
        {activeStep === 4 && (
          <StepESE context={context} onNext={() => goTo(5, true)} onBack={() => goTo(3)} />
        )}
        {activeStep === 5 && (
          <StepCIA context={context} onNext={() => goTo(6, true)} onBack={() => goTo(4)} />
        )}
        {activeStep === 6 && (
          <StepConsolidated context={context} onNext={() => goTo(7, true)} onBack={() => goTo(5)} />
        )}
        {activeStep === 7 && (
          <StepReport context={context} onBack={() => goTo(6)} />
        )}
      </main>
    </div>
  );
}
