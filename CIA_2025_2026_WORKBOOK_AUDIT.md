# CIA 2025-2026 Master Workbook Audit

Source analysed: `f23c48f3-6feb-465e-be64-dfed0d81a1e2.xlsx`  
File size: 58,472,495 bytes  
Scope: College-wide CIA data for academic year 2025-2026, ODD and EVEN terms

## Verified workbook inventory

- 16 worksheets
- 29 departments plus one `Unassigned Source` review bucket
- 11,900 distinct register numbers
- 1,816 distinct paper codes across question and CIA-total sources
- 2,479 department/paper/term/exam T1/T2 datasets
- 165,870 T1/T2 question rows
- 2,306 department/paper/term CIA activity datasets
- 159,886 MAJOR/PARTII CIA total/activity rows

Supported sheet families:

- `ciaobe_level_odd2526`, `ciaobe_ques_test_odd2526`
- `ciaobe_level_even2526`, `ciaobe_ques_test_even2526`
- Actuarial `ciaobe_level_act_*`, `ciaobe_ques_act_*`
- MBA `ciaobe_level_mba_*`, `ciaobe_ques_mba_*`
- `MAJOR_ODD`, `PARTII_ODD`, `MAJOR_EVEN`, `PARTII_EVEN`

## Source conditions found

- `PARTII_EVEN` has no header row. The importer applies the official 16-column PARTII schema and records a warning.
- The two general `ciaobe_level_odd/even2526` exports do not contain a complete `PAPERCODE + Q1C/Q1K...` mapping layout. Question marks are stored exactly, but affected datasets remain `MAPPING REVIEW REQUIRED`; CO mappings are not invented.
- The ODD Actuarial and MBA mapping worksheets are empty. Their available marks are retained and marked for mapping review.
- 72 question rows cannot be assigned confidently to a department from paper/register/course evidence. They are retained under `Unassigned Source`.
- 2,902 repeated source rows are represented by one calculation row while every conflicting duplicate is preserved in `duplicateSourceRows` audit data.
- 1,671 rows have a supplied total different from a simple sum of visible question/component cells. The workbook-supplied total is preserved unchanged.
- MAJOR/PARTII component totals themselves reconciled without a detected arithmetic mismatch in the audit.

## Import guarantees in this version

1. The 58 MB workbook is processed with a streaming reader instead of loading millions of cells into memory at once.
2. Academic year is selected explicitly and stored as `2025-2026`.
3. ODD and EVEN are isolated on every question/activity document.
4. Department, paper, course, section and register-number evidence is used to separate records.
5. Original totals, marks, duplicates, source sheets and data-quality counts are retained.
6. Question data without a valid CO mapping is never calculation-ready.
7. One `ciaworkbookimports` audit record links the source file to every department verification record.
8. A successful new college-master import replaces older datasets only after the new datasets have been stored.

## Availability meanings

- **Complete**: verified T1, T2 and Activities cover the paper/roster, or verified/manual CIA marks cover the roster.
- **Review Required**: all CIA sources exist but verification or CO mapping is incomplete.
- **Partial**: only some CIA sources or students are available.
- **Missing**: no usable CIA source is stored.
- ESE is **Complete** only when stored ESE rows cover the full roster; any non-zero shortfall is shown as **Partial**, not Complete.
