# CIA Excel Import Fix

The supplied English Department workbook is valid and is supported directly.

Validated source workbook structure:
- ciaobe_level_odd2526
- ciaobe_ques_test_odd2526
- MAJOR_ODD
- PARTII_ODD
- ciaobe_level_even2526
- ciaobe_ques_test_even2526
- MAJOR_EVEN
- PARTII_EVEN

The workbook expands to 108 T1/T2 question datasets and 55 activity datasets.

## Fixes
- Replaced 160+ sequential MongoDB `findOneAndUpdate` calls with batched `bulkWrite` operations.
- Added import-stage reporting so the UI shows whether failure occurred while reading, analysing, saving question datasets, or saving activity datasets.
- Added friendly handling for HTTP 413 upload rejection, MongoDB connection errors, and duplicate/obsolete Mongo indexes.
- Shows the selected workbook size before import.
- Keeps the 20 MB application upload guard.

If a reverse proxy rejects the workbook with HTTP 413, the Node/Multer 20 MB limit is not the problem; the deployment proxy/web-server upload limit must be increased.
