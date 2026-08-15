# Question-wise CIA Attainment Update

## What changed

The staff workflow is now:

1. Select Course
2. CO-PO-PSO Matrix
3. Thresholds & CIA Activity Mapping
4. ESE Marks — unchanged, ERP/read-only
5. T1 Question-wise Attainment — verify
6. T2 Question-wise Attainment — verify
7. CIA Activities — Seminar, Assignment, Innovative — verify
8. CO Calculation — automatic
9. Final Report — remarks + completion

The old Student List wizard page is not part of the workflow, and the old staff CIA total-mark entry page is no longer used.

## What was found in the supplied English department workbook

The workbook contains separate ODD/EVEN sheets for:

- question → CO and Bloom/K mapping (`ciaobe_level_*`)
- T1/T2 student question marks (`ciaobe_ques_test_*`)
- activity totals (`MAJOR_*`, `PARTII_*`)
- staff-in-charge name and academic-year/term metadata

The activity sheets include fields such as `SE` (Seminar), `AR` (Assignment), `IT` (Innovative), and may also contain MCQ/LIB/COMP/AT.

The workbook does **not** provide a separate explicit maximum-mark field for every question/activity. For that reason, import derives a likely maximum from observed data and flags it as **Needs confirmation**. Admin must confirm the question and primary activity maxima before staff verification. This prevents a guessed `/5`, `/10`, `/20`, etc. from affecting attainment.

## Admin workflow

Open **Admin Console → CIA Data Import**.

1. Upload the department CIA workbook.
2. Data is stored in MongoDB.
3. Open **Review Questions** for every T1/T2 dataset and confirm:
   - Question → CO
   - K level
   - actual question maximum
4. Open **Review Activities** and confirm the actual maxima for Seminar, Assignment and Innovative.
5. Staff can then open their paper and verify T1, T2 and CIA Activities.

Re-importing or changing a source dataset invalidates its old staff verification automatically. The dashboard returns the paper to the correct stage. A calculation is also treated as stale when its source data changes.

## Question-wise calculation

For each question:

- `Question threshold mark = Question max × Threshold %`
- `Attained students = students scoring at or above the question threshold`
- blanks/NULL optional-question cells are excluded from that question's appeared count
- `Attained % = Attained / Appeared × 100`
- `Question level = min(3, Attained % / Target % × 3)`

For each CO in T1/T2:

- `Test CO level = average of question levels mapped to that CO`

This means staff sees the complete chain: student marks → question result → CO average.

## CIA activities

Seminar, Assignment and Innovative use the same threshold/target level calculation. Their CO coverage is configured on the Thresholds page because the English activity sheets contain marks but not explicit activity-to-CO mapping.

The default reference mapping is:

- Assignment → CO1–CO3
- Seminar → CO4–CO6
- Innovative → CO1–CO6

Staff can change this mapping before calculation if the course CIA plan specifies another coverage.

## Consolidated calculation

The supplied reference workbook uses a 25:75 CIA:ESE structure and splits CIA as 22.5 main internal + 2.5 innovative. The portal preserves that structure but uses the new question-wise CIA evidence:

- Main CIA = average of the available mapped T1/T2 CO level(s) plus mapped regular activity level(s)
- Innovative = separately calculated innovative level
- ESE = existing ERP/read-only ESE outcome level (no question-wise ESE change)
- `Final CO = Main CIA × 22.5% + Innovative × 2.5% + ESE × 75%`

If the configured CIA:ESE split changes, the main/innovative split scales as 90%/10% of the CIA share.

PO/PSO continues as:

- `Expected = average of non-zero mapped CO correlation values`
- `Observed = Expected × Overall CO Attainment Average ÷ 3`

## MongoDB collections

The new source and verification models are:

- `CIAQuestionSet` — T1/T2 questions, mappings, maxima, student question marks, source staff/year/term
- `CIAActivitySet` — activity marks and reviewed maxima
- `CIAVerification` — staff verification state for T1, T2 and Activities
- `Attainment` — frozen calculated summaries used by the final report

The source dataset is matched to a paper by paper code + ODD/EVEN term + academic year. The system does not silently use another academic year's CIA data.
