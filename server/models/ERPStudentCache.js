const mongoose = require("mongoose");

const ERPStudentCacheSchema = new mongoose.Schema({
  rollno: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  degree: { type: String, enum: ["UG", "PG"], required: true, index: true },
  course: { type: String, required: true, index: true },
  year: { type: Number, required: true, index: true },
  section: { type: String, default: "NIL", index: true },
  dob: String,
  syncedAt: { type: Date, default: Date.now },
}, { timestamps: true });

ERPStudentCacheSchema.index({ degree: 1, course: 1, year: 1, section: 1 });
module.exports = mongoose.model("ERPStudentCache", ERPStudentCacheSchema);
