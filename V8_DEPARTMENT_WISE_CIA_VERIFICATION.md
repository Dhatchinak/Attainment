# v8 — Department-wise CIA Import & One-click Verification

## Admin CIA import workflow

The CIA Data Import page is now department-oriented instead of paper-oriented.

1. Admin can select one or many `.xlsx/.xls` department workbooks at the same time.
2. Each workbook is processed independently through the existing `/api/cia-question/import` endpoint.
3. Department name is detected from the ERP `department` column in `MAJOR_* / PARTII_*` sheets. A file-name fallback is also available.
4. Imported source data is grouped by **Department + Academic Year**.
5. Admin sees one professional card per department/year with papers, classes, students, T1/T2 sets and validation issues.
6. `View Department Data` shows the full paper-level source summary.
7. `Verify Entire Department` accepts every usable system-inferred question/activity maximum in one action. There is no longer a need to open every T1/T2/activity dataset and confirm it separately.

## Safe handling of incomplete source data

Department verification does not falsely unlock broken data.

- Valid question/activity datasets are verified in bulk.
- Affected datasets with missing students, missing CO mapping, unresolved maximum marks or missing required activities remain pending.
- The department is shown as `VERIFIED_WITH_ISSUES` when valid data is approved but some source problems remain.
- Staff can continue only on valid allocated papers; affected papers remain blocked until corrected and re-imported.

The supplied English workbook has a small number of source rows where a question was never attempted. v8 now infers a zero-observed question maximum from its optional `a/b` counterpart or nearest matching CO/K-level question when that is possible. Completely missing test datasets are not guessed.

## MongoDB changes

New model:

- `CIADepartmentImport`

CIA question/activity documents now include:

- `departmentName`
- `departmentKey`
- `departmentImportVersion`
- `departmentVerified`
- `departmentVerifiedBy`
- `departmentVerifiedAt`

Unique CIA indexes are now department-aware, so multiple departments can safely import data even when a paper code is reused.

On backend startup, old CIA unique indexes are migrated automatically. Existing v7/older imported data is also grouped into department verification records automatically when Admin opens the CIA import page.

## Staff workflow

Admin department verification confirms source data only. Staff still performs the academic acknowledgement for the selected class:

`ESE → T1 question-wise → staff verify → T2 question-wise → staff verify → CIA Activities → staff verify → calculation → final report`

Class/section filtering introduced in v6 remains unchanged, so NIL/Aided and Section A students are not merged during attainment calculation.
