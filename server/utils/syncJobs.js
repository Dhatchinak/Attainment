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
  return job.save();
}

module.exports = { startSyncJob, finishSyncJob };
