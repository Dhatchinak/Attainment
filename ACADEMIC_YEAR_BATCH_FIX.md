# Academic Year / Batch Fix

- Historical academic years are no longer deactivated when the app opens.
- CIA workbook import automatically registers detected academic years (for example 2025-2026) as active.
- Previous-batch preparation now derives academic year from admission batch + semester:
  - 2025 batch, Semester 1/2 -> 2025-2026
  - 2025 batch, Semester 3/4 -> 2026-2027
  - 2025 batch, Semester 5/6 -> 2027-2028
- The manual selection screen visibly shows the derived academic year before preparing the paper.
- This fixes CIA matching because imported CIA data is matched by paper code + test + term + academic year.
