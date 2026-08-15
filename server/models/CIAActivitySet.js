const mongoose = require("mongoose");

const CIAActivityComponentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    inferredMax: { type: Number, default: 0 }, // legacy/readability alias
    maxMarks: { type: Number, default: 0 },
    maxMarksInferred: { type: Boolean, default: true },
    observedMax: { type: Number, default: 0 },
  },
  { _id: false }
);

const CIAActivityStudentSchema = new mongoose.Schema(
  {
    regNo: { type: String, required: true },
    name: { type: String, default: "" },
    course: { type: String, default: "" },
    result: { type: String, default: "" },
    marks: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

/** Imported non-test CIA components from MAJOR_ODD / MAJOR_EVEN. */
const CIAActivitySetSchema = new mongoose.Schema(
  {
    paperCode: { type: String, required: true },
    paperCodeKey: { type: String, required: true, index: true },
    term: { type: String, enum: ["ODD", "EVEN"], required: true, index: true },
    academicYear: { type: String, default: "", index: true },
    staffName: { type: String, default: "" },
    sourceFileName: { type: String, default: "" },
    sourceSheet: { type: String, default: "" },
    components: { type: [CIAActivityComponentSchema], default: [] },
    students: { type: [CIAActivityStudentSchema], default: [] },
    importedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

CIAActivitySetSchema.index(
  { paperCodeKey: 1, term: 1, academicYear: 1 },
  { unique: true }
);

module.exports = mongoose.model("CIAActivitySet", CIAActivitySetSchema);
