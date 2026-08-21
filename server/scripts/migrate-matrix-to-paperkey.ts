export {};
/**
 * One-time migration for the "CO-PO-PSO matrix is keyed by paper code" change.
 *
 * Matrix documents used to be keyed by `lockKey` (course+year+section+paperCode
 * +academicYear, copied from the Allocation that created them). They are now
 * keyed by `paperKey` = paperCode + academicYear ONLY (see utils/matrixKey.js),
 * so that every staff teaching the same paper code in the same academic year —
 * even across different courses/batches/sections — shares one matrix.
 *
 * This script:
 *   1. Reads every existing Matrix document (old shape, with `lockKey`).
 *   2. Looks up its `allocation` to get the real paperCode + academicYear.
 *   3. Computes the new `paperKey`.
 *   4. If two OLD matrices collapse onto the SAME new paperKey (e.g. two
 *      sections of the same paper that each got their own matrix before),
 *      the one submitted (locked) EARLIEST wins and is kept; the later
 *      duplicate is skipped (logged, not deleted, so you can review it).
 *
 * Safe to run more than once.
 *
 * Usage (from the server/ folder):
 *   npx tsx scripts/migrate-matrix-to-paperkey.ts
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Matrix = require("../models/Matrix");
const Allocation = require("../models/Allocation");
const { buildMatrixKey } = require("../utils/matrixKey");

async function migrate() {
  await connectDB();

  const matrices = await Matrix.find({}).lean();
  console.log(`Found ${matrices.length} existing matrix document(s).`);

  const keptByNewKey = new Map(); // newPaperKey -> matrix doc chosen to survive

  for (const m of matrices) {
    if (m.paperKey) continue; // already migrated

    const allocation = await Allocation.findById(m.allocation).lean();
    if (!allocation) {
      console.warn(`Skipping matrix ${m._id}: its allocation ${m.allocation} no longer exists.`);
      continue;
    }

    const newKey = buildMatrixKey(allocation);
    const existing = keptByNewKey.get(newKey);

    if (!existing) {
      keptByNewKey.set(newKey, m);
    } else {
      // Two old matrices collapse into one paper code — keep whichever was
      // created first (the original submitter), log the other for manual review.
      const survivor = new Date(existing.createdAt) <= new Date(m.createdAt) ? existing : m;
      const dropped = survivor === existing ? m : existing;
      keptByNewKey.set(newKey, survivor);
      console.warn(
        `Duplicate matrix for paperKey "${newKey}": keeping ${survivor._id} (submitted by ${survivor.submittedBy}), ` +
          `dropping ${dropped._id} (submitted by ${dropped.submittedBy}) — please review manually if needed.`
      );
    }
  }

  let updated = 0;
  for (const [newKey, m] of keptByNewKey.entries()) {
    await Matrix.updateOne(
      { _id: m._id },
      { $set: { paperKey: newKey, academicYear: (await Allocation.findById(m.allocation).lean())?.academicYear } }
    );
    updated++;
  }

  console.log(`Migration complete. ${updated} matrix document(s) updated with a paperKey.`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
