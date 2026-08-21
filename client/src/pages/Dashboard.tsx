import React, { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useLocation, Link } from "react-router-dom";
import StepSelectCourse from "../components/steps/StepSelectCourse";
import StepMatrix from "../components/steps/StepMatrix";
import StepSettings from "../components/steps/StepSettings";
import StepESE from "../components/steps/StepESE";
import StepCIA from "../components/steps/StepCIA";
import StepCIATest from "../components/steps/StepCIATest";
import StepCIAActivities from "../components/steps/StepCIAActivities";
import StepConsolidated from "../components/steps/StepConsolidated";
import StepReport from "../components/steps/StepReport";
import { isQuestionWiseAcademicYear } from "../utils/workflowMode";

const QUESTION_STEPS = [
  "Select Course",
  "CO-PO-PSO Matrix",
  "Set Thresholds",
  "ESE Marks",
  "T1 Question-wise",
  "T2 Question-wise",
  "CIA Activities",
  "CO Calculation",
  "Final Report",
];

const LEGACY_STEPS = [
  "Select Course",
  "CO-PO-PSO Matrix",
  "Set Thresholds",
  "ESE Marks",
  "CIA Marks",
  "Consolidated CO",
  "Final Report",
];

export default function Dashboard() {
  const { staff, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const incoming = location.state || null;

  const incomingQuestionWise = incoming?.allocation
    ? isQuestionWiseAcademicYear(incoming?.academicYearLabel || incoming?.progress?.academicYear)
    : true;
  const incomingSteps = incomingQuestionWise ? QUESTION_STEPS : LEGACY_STEPS;
  const initialStep = incoming?.allocation
    ? Math.min(incoming.initialStep ?? 1, incomingSteps.length - 1)
    : 0;

  const [activeStep, setActiveStep] = useState(initialStep);
  const [maxReachedStep, setMaxReachedStep] = useState(initialStep);
  const [context, setContext] = useState({
    academicYear: incoming?.academicYear || null,
    academicYearLabel: incoming?.academicYearLabel || null,
    programme: incoming?.programme || null,
    batch: incoming?.batch || null,
    batchLabel: incoming?.batchLabel || null,
    admissionYear: incoming?.admissionYear || null,
    allocation: incoming?.allocation || null,
    completed: incoming?.completed || false,
    progress: incoming?.progress || {},
  });

  const questionWise = context.allocation
    ? isQuestionWiseAcademicYear(context.academicYearLabel || context.progress?.academicYear)
    : true;
  const steps = useMemo(() => (questionWise ? QUESTION_STEPS : LEGACY_STEPS), [questionWise]);

  function goTo(step, markReached = false) {
    const bounded = Math.max(0, Math.min(step, steps.length - 1));
    setActiveStep(bounded);
    if (markReached) setMaxReachedStep((current) => Math.max(current, bounded));
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
      <header className="portal-header">
        <div className="max-w-[1500px] mx-auto px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="h-12 w-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-0.5 shadow-sm shrink-0">
              <img src="/college-logo.webp" alt="College logo" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display font-bold text-lg tracking-tight text-slate-900">CO-PO-PSO Attainment</h1>
                {context.completed && <span className="status-chip status-success">✓ Completed</span>}
                {context.allocation && (
                  <span className={`status-chip ${questionWise ? "status-admin" : "status-neutral"}`}>
                    {questionWise ? "Question-wise CIA" : "Legacy CIA"}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {staff?.salute} {staff?.name} · {staff?.designation} · {staff?.department_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link to="/overview" className="btn btn-ghost">← Dashboard</Link>
            <button onClick={doLogout} className="btn btn-ghost">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-[1500px] mx-auto px-5 pt-5">
        {context.allocation && (
          <div className="workflow-context-bar">
            <div>
              <span>Paper</span>
              <strong>{context.allocation.paperCode}</strong>
            </div>
            <div>
              <span>Semester</span>
              <strong>{context.allocation.semester}</strong>
            </div>
            <div>
              <span>Batch</span>
              <strong>{context.admissionYear || context.batchLabel || "—"}</strong>
            </div>
            <div>
              <span>Academic Year</span>
              <strong>{context.academicYearLabel || "Current"}</strong>
            </div>
          </div>
        )}

        <div className="workflow-stepper mt-4">
          <div className={`flex items-center w-full ${questionWise ? "min-w-[1120px]" : "min-w-[900px]"}`}>
            {steps.map((label, idx) => (
              <React.Fragment key={label}>
                <button
                  onClick={() => idx <= maxReachedStep && goTo(idx)}
                  disabled={idx > maxReachedStep}
                  className="flex flex-col items-center gap-1.5 shrink-0 group"
                >
                  <span className={`step-pill ${
                    idx === activeStep
                      ? "bg-brand text-white shadow-glow scale-110"
                      : idx < maxReachedStep
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-100 text-slate-400 group-disabled:cursor-not-allowed"
                  }`}>
                    {idx < maxReachedStep ? "✓" : idx + 1}
                  </span>
                  <span className={`text-[10px] md:text-[11px] font-semibold whitespace-nowrap ${
                    idx === activeStep ? "text-brand" : idx < maxReachedStep ? "text-emerald-600" : "text-slate-400"
                  }`}>
                    {label}
                  </span>
                </button>
                {idx < steps.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-2 rounded-full ${idx < maxReachedStep ? "bg-emerald-400" : "bg-slate-200"}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-[1500px] mx-auto px-5 pb-14 pt-5">
        {activeStep === 0 && (
          <StepSelectCourse context={context} updateContext={updateContext} onNext={(resumeStep) => goTo(resumeStep || 1, true)} />
        )}
        {activeStep === 1 && <StepMatrix context={context} onNext={() => goTo(2, true)} onBack={() => goTo(0)} />}
        {activeStep === 2 && (
          <StepSettings
            context={context}
            questionWise={questionWise}
            onNext={() => goTo(3, true)}
            onBack={() => goTo(1)}
          />
        )}
        {activeStep === 3 && (
          <StepESE
            context={context}
            nextLabel={questionWise ? "Next: T1 Question-wise →" : "Next: CIA Marks →"}
            onNext={() => goTo(4, true)}
            onBack={() => goTo(2)}
          />
        )}

        {questionWise ? (
          <>
            {activeStep === 4 && <StepCIATest exam="T1" stepNumber={5} context={context} onNext={() => goTo(5, true)} onBack={() => goTo(3)} />}
            {activeStep === 5 && <StepCIATest exam="T2" stepNumber={6} context={context} onNext={() => goTo(6, true)} onBack={() => goTo(4)} />}
            {activeStep === 6 && <StepCIAActivities context={context} onNext={() => goTo(7, true)} onBack={() => goTo(5)} />}
            {activeStep === 7 && <StepConsolidated context={context} questionWise onNext={() => goTo(8, true)} onBack={() => goTo(6)} />}
            {activeStep === 8 && <StepReport context={context} questionWise onBack={() => goTo(7)} />}
          </>
        ) : (
          <>
            {activeStep === 4 && <StepCIA context={context} onNext={() => goTo(5, true)} onBack={() => goTo(3)} />}
            {activeStep === 5 && <StepConsolidated context={context} questionWise={false} onNext={() => goTo(6, true)} onBack={() => goTo(4)} />}
            {activeStep === 6 && <StepReport context={context} questionWise={false} onBack={() => goTo(5)} />}
          </>
        )}
      </main>
    </div>
  );
}
