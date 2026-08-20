# MongoDB Data Structure and API Persistence

## Guarantee provided by this version

Data received from the college APIs is written to MongoDB before it is used for attainment work:

1. Staff login response -> `staffs`
2. Current classes/papers -> `batches` and `allocations`
3. Student directory -> `erpstudentcaches`
4. Selected class roster -> `students`
5. Every fetched student/paper report -> `erpstudentreports`
6. Normalised ESE marks for the selected paper -> `esemarks`
7. Normalised CIA components/totals for the selected paper -> `ciamarks`
8. Every synchronization attempt -> `apisyncjobs`

For the legacy CIA/ESE source, this is now an explicit Admin-only, one-time migration. Staff screens do not fetch CIA/ESE from that API. They discover semesters/papers from `erpstudentreports` and materialize marks into the allocation-specific collections from the saved MongoDB evidence.

The portal reads the saved MongoDB records for its normal screens and calculations. The upstream API is therefore not the only copy of retrieved academic data.

> CIA question-wise T1/T2 and activity datasets imported from the official workbook remain in `ciaquestionsets` and `ciaactivitysets`. API CIA totals are additionally preserved in `ciamarks` and `erpstudentreports`; they do not silently replace the verified question-wise workbook source.

## API synchronization flow

### Staff login

- Fetch staff from ERP.
- Upsert by `staff_id` into `staffs`.
- Preserve the complete response in `raw`.
- Record `lastSyncedAt` and `lastSyncJob`.

### Current-class synchronization

- Deduplicate timetable repetitions.
- Upsert one `batches` record for each class/section.
- Upsert one `allocations` record for each staff + class + paper + academic year.
- Preserve each original timetable row in `sourcePayload`.

### Student and marks synchronization

- Upsert directory students by register number into `erpstudentcaches`.
- When a class/paper is prepared, copy its roster into `students`.
- Fetch each selected student's complete report.
- Upsert every paper found in that response into `erpstudentreports`.
- Upsert the selected paper's ESE into `esemarks`.
- Upsert the selected paper's CIA components and total into `ciamarks`.
- Store per-student failures in `apisyncjobs`; successful students remain committed.

## Collection reference

### API source and audit collections

#### `apisyncjobs`

One record per synchronization operation.

Important fields: `jobType`, `status`, `requestedBy`, `academicYear`, `scope`, `counts`, `syncErrors`, `startedAt`, `completedAt`.

Statuses: `RUNNING`, `SUCCESS`, `PARTIAL`, `FAILED`.

#### `erpstudentcaches`

Durable student-directory cache from the attainment API.

Unique key: `rollno`.

Important fields: `rollno`, `name`, `degree`, `course`, `year`, `section`, `dob`, `sourcePayload`, `firstSyncedAt`, `syncedAt`, `lastSyncJob`.

#### `erpstudentreports`

Durable per-student/per-paper API snapshots. This is the recovery copy of every report fetched during class preparation.

Unique key: `rollno + paperCode + academicYear`.

Important fields: `rollno`, `paperCode`, `academicYear`, `admissionYear`, `course`, `studyYear`, `section`, `batch`, `semester`, `paperTitle`, `paperType`, `ese`, `cia`, `sourcePayload`, `firstSyncedAt`, `lastSyncedAt`, `lastSyncJob`.

The batch scope fields prevent NIL/Aided and named sections such as A from being combined. `sourcePayload` preserves the original student API response for audit/recovery. Re-running the same migration upserts `rollno + paperCode + academicYear` and does not create duplicates.

### Identity and academic structure

#### `admins`

Portal administrator credentials: `adminId`, hashed password, name.

#### `departmentaccounts`

One read-only HOD/department login per ERP department.

Unique key: `departmentCode`.

Important fields: `departmentCode`, `departmentName`, `erpDepartmentId`, `programmeAliases`, `passwordHash`, `passwordEncrypted`, `isActive`, `lastSyncedAt`, `lastLoginAt`, `passwordUpdatedAt`, `passwordUpdatedBy`.

The login password format is the normalized department code followed by exactly two digits, for example `AS47`. Authentication uses the bcrypt hash. The separate Admin-display copy is encrypted with AES-256-GCM using `DEPARTMENT_PASSWORD_ENCRYPTION_KEY` (or `JWT_SECRET` as fallback); it is never returned to department users. Keep the encryption key stable and backed up. Changing it does not invalidate login hashes, but Admin cannot display the old passwords and must reset them.

ERP synchronization updates names, program aliases and timestamps without replacing existing passwords. Historical rows matching ERP department/program aliases receive `departmentCode`, allowing the department dashboard to include the correct migrated archive.

#### `staffs`

ERP-backed staff profile plus portal-specific access data.

Unique key: `staff_id`.

The complete ERP response is kept in `raw`. Passwords/API tokens are never saved here.

#### `academicyears`

Academic-year master, for example `2026-2027`.

#### `admissionbatches`

Admission cohorts such as the 2025 UG batch.

#### `batches`

One class/section in one academic year, for example `I BA English - NIL`.

Important isolation fields: `program_id`, `course`, `year`, `section`, `academicYear`, `admissionYear`.

#### `allocations`

One staff-paper-class assignment.

Unique key: `staff_id + batch + academicYear + paperCode`.

This prevents Section A, Section B and NIL/Aided data from sharing the same allocation.

#### `students`

The roster attached to a specific batch.

Unique key: `regNo + batch`.

### Marks and CIA verification

#### `esemarks`

One ESE total per allocation and student.

Unique key: `allocation + student`.

API evidence is retained in `sourcePayload`, with `lastSyncedAt` and `lastSyncJob`.

These allocation-specific rows are created from the already-migrated `erpstudentreports` copy when a staff member prepares that paper. No external marks API request occurs at that point.

#### `ciamarks`

One normalized CIA record per allocation and student.

Unique key: `allocation + student`.

Fields include `componentMarks`, `total`, `calculationReady`, `sourcePayload`, `lastSyncedAt` and `lastSyncJob`. API CIA rows are preserved with `calculationReady: false` when the API does not supply official component maxima; Admin verification/upload changes this to `true`, preventing unverified data from affecting attainment.

Like ESE, these rows are materialized from MongoDB migration evidence during staff preparation, never fetched live in the staff workflow.

#### `ciaquestionsets`

Verified question-wise T1/T2 workbook datasets grouped by department, paper, exam, term and academic year.

#### `ciaactivitysets`

Verified seminar, assignment, innovative and other activity datasets grouped by department, paper, term and academic year.

#### `ciadepartmentimports`

Department-wise import validation, warning summary, version and one-click admin verification history.

#### `ciaverifications`

Staff verification state for T1, T2 and activities for one allocation.

### Attainment configuration and results

#### `matrices`

CO-PO-PSO matrix shared by paper code and academic year.

#### `attainmentsettings`

Paper threshold, target, CIA/ESE weighting, maximum marks and CIA-to-CO configuration.

#### `attainments`

Computed CO, PO and PSO results, final report remarks and completed/pending state.

#### `historicalattainmentrecords`

Read-only archive migrated from the previous `finalbhc.attainment_records` MySQL table. It intentionally remains separate from live `attainments` because the legacy records contain only paper-level expected/observed PO1–PO9 and PSO1–PSO4 values and do not contain the new portal's allocation, student, CO, CIA or ESE evidence IDs.

Unique key: `sourceSystem + legacyId`.

Repeated uploads are safe. Logical duplicates are preserved as versions; `isLatest: true` identifies the newest record displayed by default. Original source rows are retained in `raw`.

Display location: **Admin Console → Historical Attainment**. This page provides JSON migration, academic-year/department/semester/section filters, search, pagination and a read-only expected-versus-observed outcome table.

Department display location: **Department Login → Department Dashboard → Migrated Archive**. The backend applies the authenticated department code and ERP aliases; users cannot request another department's records.

### Legacy/support collections

#### `otps`

Legacy expiring OTP records. MongoDB TTL automatically removes expired records.

## Safe update rules

- Synchronization uses upsert, so a repeated API fetch updates the same logical record instead of creating duplicates.
- Empty/failed API responses do not delete the last successful MongoDB copy.
- Historical academic years are retained.
- Section is part of the batch/allocation identity.
- The raw/source payload is stored for audit and recovery.
- API credentials remain only in environment variables.
- Use MongoDB Atlas backups or scheduled exports for disaster recovery; application persistence is not a substitute for database backups.

## Admin monitoring endpoints

- `GET /api/admin/sync-jobs?limit=50`
- `GET /api/admin/sync-jobs?status=FAILED`
- `GET /api/admin/sync-jobs?jobType=CLASS_PREPARE`
- `GET /api/admin/sync-summary`

These routes require an admin token.

## One-time CIA/ESE migration endpoints

- `GET /api/manual-attainment/admin/migration-options` — MongoDB-cached batches and recent migration history
- `GET /api/manual-attainment/admin/migration-options?refresh=1` — Admin-only student-directory refresh
- `POST /api/manual-attainment/admin/migrate` — fetch and persist the selected exact batch/year and CIA/ESE type

Migration jobs use `jobType: ACADEMIC_DATA_MIGRATION`. Statuses are `SUCCESS`, `PARTIAL` or `FAILED`; individual student failures are retained in `syncErrors`. A failed/empty response never deletes the previous successful MongoDB copy.

## Department-account endpoints

- `POST /api/admin/department-accounts/sync` — pull ERP departments and create/update accounts
- `GET /api/admin/department-accounts` — Admin-only credential list
- `PATCH /api/admin/department-accounts/:id/password` — set or randomly reset password
- `PATCH /api/admin/department-accounts/:id/status` — enable/disable access
- `GET /api/auth/departments` — active choices for the login page (no passwords)
- `POST /api/auth/department-login` — department authentication
- `GET /api/department/academic-years` — years containing that department's records
- `GET /api/department/records?academicYear=2025-2026` — isolated live/archive records
