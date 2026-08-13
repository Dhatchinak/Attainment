# ESE Maximum Mark Fix

## Problem
ESE marks were being saved/calculated with a fallback maximum of 100. For papers whose ESE is out of 50, marks such as 48 were treated as 48%, causing the above-threshold count and attainment level to be wrong.

## Fix
- Added `eseMaxMarks` to paper-level attainment settings (default 50 for legacy records).
- Step 3 now lets staff configure the ESE maximum mark once per paper.
- ESE entry displays the configured maximum and exact threshold mark.
- ESE summary recalculates live while marks are entered.
- Save and Excel upload validate marks against the configured ESE maximum.
- Backend ignores stale `ESEMark.max` values and uses the configured paper maximum when calculating ESE and consolidated CO attainment.
- Legacy records that previously stored `max: 100` are therefore corrected automatically during calculation without requiring every mark to be re-entered.
- `Save & Next` saves marks before navigation so unsaved edits are not lost.

Example: ESE max = 50, threshold = 50%. A score of 48 is now 96%, so it is correctly counted as above threshold.
