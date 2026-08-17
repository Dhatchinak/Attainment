# v7 - Class-scoped Final Report + HOD PDF Checklist

## Final attainment report
- Added a prominent **Attainment Class / Section** block.
- The report now explicitly shows the exact class for which attainment was calculated.
- `NIL` section is displayed as **Aided (NIL)**.
- Added class/section, programme, semester, batch, academic year, course teacher, and completion status to the report header information.
- The server now returns a live `reportContext` with class metadata, so even older computed reports show the correct class without recomputing attainment.
- Existing Bar/Radar toggle and PO/PSO remarks are retained.

## HOD checklist
- Changed the dashboard action from `.xlsx` to a direct **PDF** download.
- PDF contains a submission summary: Total Papers, Completed, Pending, Completion %.
- Added a **Class-wise Completion Summary** showing each class/section and whether it is COMPLETED or PENDING.
- Added a **Paper-wise Attainment Checklist** showing:
  - Class / Section
  - Semester
  - Batch
  - Paper code + title
  - CIA method (Question-wise / Legacy)
  - Status (COMPLETED / PENDING)
  - Current or pending workflow stage
- Added HOD verification / remarks lines, signature, date, academic year, staff, department, page numbers.
- PDF is generated in the browser with no additional package dependency.

## Class naming
- Dashboard and report now display `NIL` as **Aided (NIL)** to prevent confusion with Section A.
- Manual paper selection also carries the friendly class label into the final report.
