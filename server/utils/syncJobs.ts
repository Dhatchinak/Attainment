export {};
const ApiSyncJob = require("../models/ApiSyncJob");

async function startSyncJob(jobType, requestedBy, scope = {}, academicYear = "") {
  return ApiSyncJob.create({ jobType, requestedBy: requestedBy || "SYSTEM", scope, academicYear });
}

async function finishSyncJob(job, status, counts = {}, errors = []) {
  if (!job) return null;
  job.status = status;
  job.counts = { ...job.counts.toObject?.(), ...counts };
  job.syncErrors = errors.slice(0, 100).map((error) => ({
    key: String(error.key || ""),
    message: String(error.message || error).slice(0, 1000),
    at: new Date(),
  }));
  job.completedAt = new Date();
  if (!job.progress) job.progress = {};
  job.progress.processed = job.progress.total || job.progress.processed;
  job.progress.percent = 100;
  job.progress.currentItem = "";
  job.progress.message = status === "SUCCESS" ? "Migration completed" : status === "PARTIAL" ? "Migration completed with some failures" : "Migration failed";
  return job.save();
}

async function updateSyncProgress(jobId, { total, processed, currentItem = "", message = "Migrating" }) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeProcessed = Math.min(safeTotal || Number(processed) || 0, Math.max(0, Number(processed) || 0));
  const percent = safeTotal ? Math.min(99, Math.round((safeProcessed / safeTotal) * 100)) : 0;
  return ApiSyncJob.findByIdAndUpdate(jobId, {
    $set: {
      "progress.total": safeTotal,
      "progress.processed": safeProcessed,
      "progress.percent": percent,
      "progress.currentItem": String(currentItem || ""),
      "progress.message": String(message || "Migrating"),
    },
  }, { new: true });
}

module.exports = { startSyncJob, finishSyncJob, updateSyncProgress };
