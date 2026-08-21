export {};
// One-time cleanup: delete erp_sync Allocations whose stored `semester` doesn't
// match the semester encoded in their own paperCode (the duplicates created by
// the old sweep-1-to-8 bug). Safe to re-run.
require("dotenv").config();
const mongoose = require("mongoose");
const Allocation = require("../models/Allocation");
const { deriveSemesterFromPaperCode } = require("../utils/erpHelpers");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const docs = await Allocation.find({ source: "erp_sync" });
  let toDelete = [];
  for (const a of docs) {
    const real = deriveSemesterFromPaperCode(a.paperCode);
    if (real && real !== a.semester) toDelete.push(a._id);
  }

  console.log(`Found ${docs.length} erp_sync allocations, ${toDelete.length} are wrong-semester duplicates.`);
  if (toDelete.length) {
    const res = await Allocation.deleteMany({ _id: { $in: toDelete } });
    console.log(`Deleted ${res.deletedCount}.`);
  }

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});