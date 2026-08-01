# ERP staff-class duplicate fix

## Why duplicate cards appeared

The staff profile `class_attend` array contains one row for every timetable day and hour. A paper taught five times per cycle therefore appears five times. The old dashboard also called the sync endpoint eight times, once for each semester. Paper codes such as `P25CS307`, `P25CS3P5`, `U24CS506` and `U24CS5P6` were not supported by the old semester parser, so they were saved under several semesters.

## Fixes included

- Staff ERP is fetched once per academic year.
- Timetable rows are deduplicated by programme + year + section + paper code.
- Semester is derived from the first curriculum digit after the subject letters.
- Batches use ERP `program_id`, year, section and academic year as their canonical identity.
- Existing duplicate allocations and empty duplicate ERP batches are cleaned during the next sync.
- The overview endpoint also deduplicates defensively before rendering cards.
- Batch labels are calculated from academic year and year of study.

## After installing

1. Restart the server.
2. Login as staff.
3. Select the current academic year.
4. Click **Fetch my classes for this year** once.

The sync response reports how many old duplicates were removed.
