# Historical Attainment Migration

The supplied phpMyAdmin JSON contains 3,656 completed ESE attainment rows from the old `finalbhc.attainment_records` table.

## Recommended migration

1. Log in as Admin.
2. Open **Historical Attainment**.
3. Choose the phpMyAdmin `.json` export.
4. Click **Migrate to MongoDB**.
5. Review totals and filter the archive by year, department, semester or section.

The upload is repeat-safe. Existing legacy IDs are updated instead of duplicated.

For server-side migration:

```bash
cd server
npm run migrate:historical -- /absolute/path/attainment-export.json
```

## Why it is a separate archive

The old data uses PO1–PO9 and PSO1–PSO4 and contains only expected/observed paper-level results. The current portal uses live MongoDB allocations, student/CIA/ESE evidence, CO rows, PO1–PO12 and PSO1–PSO2. Combining both schemas would create incorrect reports and progress statuses.

The archive is therefore read-only and does not affect current dashboard completion counts or attainment calculations.
