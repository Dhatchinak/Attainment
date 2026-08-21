export {};
/**
 * Direct CLI importer (alternative to Admin -> Historical Attainment upload).
 * Usage: npm run migrate:historical -- /absolute/path/export.json
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { importHistoricalAttainment } = require("../utils/historicalAttainmentImport");

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("Provide the phpMyAdmin JSON path");
  const absolute = path.resolve(input);
  const buffer = fs.readFileSync(absolute);
  await connectDB();
  const result = await importHistoricalAttainment(buffer, {
    fileName: path.basename(absolute),
    importedBy: "CLI_ADMIN",
  });
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message || error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
