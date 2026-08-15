# Attainment Portal v6 — Section, Workflow, Login & Final Report Fix

## 1. T1 / T2 section isolation
The imported English CIA workbook can contain multiple sections under the same paper code. Example: U25EG101 contains both NIL (Aided) and Section A rows in the same T1/T2 source dataset.

The staff workflow now scopes question-wise data to the selected Allocation/Batch before calculating attainment:
- Primary match: selected Batch student roster ↔ imported CIA registration numbers.
- Fallback: exact normalized section and course match.
- NIL, blank, AIDED, NULL, NONE, NA and N/A are normalized as the NIL/Aided section.
- The same scoping is applied to T1, T2 and CIA activity data.
- Staff page shows selected-class row count and source workbook row count.

Old T1/T2 verifications are intentionally invalidated once because they were created before class/section scoping. A new scope signature is saved with each verification, so later roster/source changes invalidate stale verification automatically.

## 2. Question-wise vs legacy CIA workflow
Question-wise CIA is enabled only for:
- 2025-2026
- 2026-2027

Older academic years retain the earlier component-total CIA workflow:
Select Course → Matrix → Thresholds → ESE → CIA Marks → Consolidated CO → Final Report.

2025-2026 / 2026-2027 use:
Select Course → Matrix → Thresholds → ESE → T1 Question-wise → T2 Question-wise → CIA Activities → CO Calculation → Final Report.

Dashboard progress, Resume step, cards and HOD checklist now respect the correct workflow.

## 3. Dashboard academic year
Working Academic Year defaults to 2025-2026 when that year exists. Staff can switch to any other available academic year.

## 4. Staff login
Staff login displays the fixed prefix `BHC-STE-00`. Staff enters only the last 3 digits. Example: `460` becomes `BHC-STE-00460`.

## 5. Final report
Final report was redesigned for cleaner alignment and printing. It now includes:
- Course information grid
- CO attainment table appropriate to question-wise or legacy mode
- Bar / Radar chart toggle for Expected vs Observed PO/PSO
- Outcome-wise Remarks / Action Taken field for every PO and PSO row
- General course remarks
- Course Teacher and HOD/Coordinator signature areas

Outcome remarks and general remarks are stored in MongoDB.

## Validation
- Changed backend JavaScript files pass `node --check`.
- All 29 frontend JS/JSX source files pass TypeScript JSX syntax parsing and relative-import checks.
- Full Vite build was not run in this container because the dependency install could not complete; no `node_modules` are included in the deliverable ZIP.
