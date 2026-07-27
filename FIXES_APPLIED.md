# Attainment Project – Fixes Applied

## New manual current-year flow
Degree (UG/PG) → Programme → Year of Study → Class/Section → Paper Type → Paper Code.

The academic year is automatically restricted to the current year. For July 2026 it is `2026-2027`. Previous academic years are marked inactive and are not shown in the staff workflow.

## API strategy
- Student API is synchronised into a local cache and de-duplicated by roll number.
- Current students are identified using academic year + year of study + roll-number admission year.
- Five current students are sampled to discover papers through `type=report&rollno=...`.
- When a paper is selected, each class student's report is fetched and the selected paper's ESE/CIA data is upserted.
- The application does not download all 712,143 ESE and 558,575 CIA records.

## Duplicate prevention
- ERP cache: unique roll number.
- Student: unique roll number + batch.
- Allocation: unique staff + batch + academic year + paper code.
- ESE/CIA: unique allocation + student.
- Every import uses MongoDB upsert/bulkWrite, so repeating an import updates rows instead of inserting duplicates.

## Important setup
Add this to `server/.env`:

```env
ATTAINMENT_API_BASE=http://192.168.18.89/hepta/api/attainment_data.php
ATTAINMENT_API_TIMEOUT=30000
```

The Node server must run on a computer that can access `192.168.18.89`.

## First run
1. Start MongoDB.
2. Run `npm install` inside `server` and `client`.
3. Start server: `npm run dev`.
4. Start client: `npm run dev`.
5. Open Staff Dashboard → Select Course. The first load synchronises the student cache.

## Admission Batch selection update
- Added Batch dropdown between Degree and Academic Year.
- Batches are detected from student roll-number admission years and stored locally.
- Added Admin Console > Admission Batches to add, edit, enable, disable, or delete batch options.
- Programme, year, class, paper and marks are now filtered by the selected admission batch.
- The current academic year remains read-only because the attainment workflow is intentionally limited to current-year processing.
