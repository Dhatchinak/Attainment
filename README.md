# CO-PO-PSO Attainment Portal (MERN + TypeScript)

Full dynamic replacement for the old attainment website (login → matrix → CIA → report).

API-fetched staff, classes, students, CIA and ESE data are durably synchronized to MongoDB. See [MONGODB_DATA_STRUCTURE.md](MONGODB_DATA_STRUCTURE.md) for the complete collection map, unique keys, sync rules and admin monitoring endpoints.

Completed records from the previous PHP/MySQL portal can be migrated from **Admin Console → Historical Attainment**. See [HISTORICAL_ATTAINMENT_MIGRATION.md](HISTORICAL_ATTAINMENT_MIGRATION.md).

Department/HOD read-only access is available at `/department-login`. In **Admin Console → Department Logins**, synchronize the ERP department master, view the generated code-plus-two-digit credentials, reset passwords, and enable or disable accounts. A department session can see only its mapped current and migrated attainment records.

For the legacy CIA/ESE API, use **Admin Console → CIA / ESE Migration**. Select the exact admission batch/class, academic year and CIA/ESE type, then migrate once. The original API evidence and normalized paper records are saved in MongoDB. Staff semester, paper and preparation screens subsequently read the MongoDB copy only; they do not call the legacy marks API.

The migration page also supports **All Batches** in one click and shows CIA/ESE availability for every migrated or allocated paper. Admin can edit both CIA and ESE for allocated papers; allocated staff can enter missing CIA from their workflow, while ESE remains staff read-only. Current portal and previous-system results are shown together under **All Attainment Records** with separate source views.

Migration runs as a background job. The Admin page shows an accurate student-by-student percentage, saved/failed progress and an estimated remaining time. Data is checkpointed during long migrations instead of waiting until the entire batch finishes.

For the official CIA Excel export, use **Admin Console → CIA Data Import**. Upload one college-wide academic-year master workbook (up to 100 MB) instead of separate department files. The streamed importer supports ODD and EVEN terms, MAJOR/PARTII, Actuarial and MBA sheets, automatically separates all departments, preserves supplied totals, audits duplicate rows and never fabricates missing CO mappings. Each detected department still receives its own review/verification card.

Large production uploads may also require the reverse proxy to allow at least 100 MB (for example, Nginx `client_max_body_size 100m`).
Nothing is hardcoded: academic years, batches/classes, staff-paper allocations, students and
marks are all managed via the Admin console or pulled live from the college ERP.

## Stack
- MongoDB + Mongoose
- Express REST API written in TypeScript
- React 18 + TypeScript + Vite + Tailwind CSS
- Recharts for the attainment chart
- Nodemailer (Gmail) for OTP email
- Multer + xlsx for bulk Excel uploads

## Folder structure
```
server/   TypeScript Express API, MongoDB models and business logic
client/   React TypeScript frontend (staff wizard + admin console)
```

## 1. Backend setup
```bash
cd server
npm install
cp .env.example .env
# edit .env:
#   MONGO_URI            -> your MongoDB connection string
#   JWT_SECRET            -> any long random string
#   DEPARTMENT_PASSWORD_ENCRYPTION_KEY -> a stable long random string
#   STAFF_API_BASE            -> https://apierp.bhc.edu.in/api/staff (already set)
#   STAFF_PROFILE_API_REFERER -> http://117.232.64.75                 (already set)
#   DEPARTMENTS_API_REFERER   -> http://10.240.151.162                (already set)
#   GMAIL_USER / GMAIL_APP_PASSWORD -> a Gmail account + App Password (not your normal password)
#     Create one at https://myaccount.google.com/apppasswords
#   ADMIN_ID / ADMIN_PASSWORD -> first-run bootstrap admin credentials
npm run dev
```
Server runs on http://localhost:5000. On first boot it auto-creates one Admin account
from ADMIN_ID / ADMIN_PASSWORD in your .env (only if no admin exists yet).

For a production server build, run `npm run build` followed by `npm start`.
Use `npm run typecheck` to validate the TypeScript source without generating files.

## 2. Frontend setup
```bash
cd client
npm install
npm run dev
```
App runs on http://localhost:5173 and proxies /api to the backend.
Use `npm run typecheck` for TypeScript validation and `npm run build` for the
production frontend bundle.

## 3. How the flow works end-to-end

1. **Admin** logs in at `/admin-login` and:
   - Opens **Department Logins** and synchronizes the ERP department API. The first
     sync creates one account per department with a password such as `AS47` (the
     department code plus two random digits). Admin can view, reset or disable it.
   - Opens **CIA / ESE Migration**, refreshes the student directory, selects one
     exact batch/section and academic year, and imports CIA, ESE or both. The page
     shows success/partial/failure history and saved/failed counts.
   - Creates Academic Years (e.g. "2025-2026")
   - Creates Batches/Classes (e.g. PG · MSC CS · Year I · Section A) — this generates
     the display name "I MSC CS A" automatically.
   - Creates Course Allocations: assigns a **Staff ID** (verified live against the ERP
     API) to a Batch + Semester + Paper Code + Paper Name + Type (Theory/Practical/
     Language 1/Language 2/Elective). This is what makes each staff's dropdowns show
     only the classes/papers they actually teach.
   - Uploads the student roster (Excel: regNo, name, email, phone) per batch.

2. **Department/HOD** logs in at `/department-login`, chooses the department and
   enters its assigned password. The dashboard is read-only and contains only that
   department's current allocations/results and migrated historical records.

3. **Staff** logs in at `/login`:
   - Enters the Staff ID only. The backend verifies it against ERP, stores the current
     staff profile in MongoDB and issues the staff session.
   - Wizard: Academic Year → Programme (UG/PG) → Batch/Class → Semester & Paper
     (only allocations belonging to that staff_id are listed).
   - **CO-PO-PSO Matrix**: staff fills correlation values (0-3) between each CO and
     PO1-PO12 / PSO1-PSO2, then **Submit & Lock**. Once locked, any other staff
     handling a different section (B, C...) of the *same* paper/batch/semester sees
     it as read-only — enforced server-side via a shared `lockKey`.
   - **Student List**: pulled from the admin-uploaded roster for that batch.
   - **CIA Evidence**: for 2025-2026 and 2026-2027, staff verifies imported T1/T2
     question-wise evidence and CIA activities. Missing CIA can be entered by staff;
     admin retains edit access. Older records continue through the legacy CIA flow.
   - **Consolidated CO Attainment**: staff locks the marks threshold and CIA/ESE
     weights. The backend calculates the percentage of students crossing the
     threshold and maps it to the 0-3 attainment level.
   - **PO/PSO Report**: final course-wise attainment table + bar chart, generated by
     weighting each CO's final attainment level by its CO→PO/PSO correlation
     strength from the matrix — matching the reference "Course-wise PO-PSO
     Attainment" report layout.

## Notes
- All dropdown data (years, batches, papers) is queried live from MongoDB — there is
  no hardcoded "1 MSC CS A" anywhere in the code.
- The ERP `Referer` header and base URL are read from `.env`, matching the values you
  provided.
- Attainment formulas live in `server/utils/attainmentCalc.ts` — this is the single
  place to adjust thresholds/levels if your college's OBE policy differs.
