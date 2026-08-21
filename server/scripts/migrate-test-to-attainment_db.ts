export {};
/**
 * One-time migration: copies every collection from the "test" database
 * (where everything landed because the old MONGO_URI had no db name)
 * into "attainment_db" (the properly-named database the app now points at).
 *
 * Safe to run more than once — it upserts by _id, so re-running just
 * re-syncs anything that changed rather than duplicating documents.
 *
 * Usage (from the server/ folder):
 *   npx tsx scripts/migrate-test-to-attainment_db.ts
 *
 * Requires MONGO_URI in your .env (same cluster — this script connects
 * once and just switches which database it reads/writes on that same
 * connection, so it works regardless of which db name is in the URI's path).
 */
require("dotenv").config();
const { MongoClient } = require("mongodb");

const SOURCE_DB = "test";
const TARGET_DB = "attainment_db";

async function migrate() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set in your .env file.");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  console.log(`Connected. Copying "${SOURCE_DB}" -> "${TARGET_DB}"...\n`);

  const sourceDb = client.db(SOURCE_DB);
  const targetDb = client.db(TARGET_DB);

  const collections = await sourceDb.listCollections().toArray();
  if (collections.length === 0) {
    console.log(`No collections found in "${SOURCE_DB}" — nothing to migrate.`);
    await client.close();
    return;
  }

  let totalDocs = 0;

  for (const { name } of collections) {
    const sourceColl = sourceDb.collection(name);
    const targetColl = targetDb.collection(name);

    const docs = await sourceColl.find({}).toArray();
    if (docs.length === 0) {
      console.log(`  ${name}: 0 documents (skipped)`);
      continue;
    }

    const ops = docs.map((doc) => ({
      replaceOne: {
        filter: { _id: doc._id },
        replacement: doc,
        upsert: true,
      },
    }));

    const result = await targetColl.bulkWrite(ops);
    const written = (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0);
    console.log(`  ${name}: ${docs.length} documents copied`);
    totalDocs += docs.length;
  }

  console.log(`\nDone. ${totalDocs} total documents copied into "${TARGET_DB}".`);
  console.log(`You can now safely use "${TARGET_DB}" — restart your server and everything should be there.`);

  await client.close();
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
