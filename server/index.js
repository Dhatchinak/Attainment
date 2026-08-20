require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const connectDB = require("./config/db");
const Admin = require("./models/Admin");
const CIAQuestionSet = require("./models/CIAQuestionSet");
const CIAActivitySet = require("./models/CIAActivitySet");

const authRoutes = require("./routes/authRoutes");
const metaRoutes = require("./routes/metaRoutes");
const matrixRoutes = require("./routes/matrixRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const studentRoutes = require("./routes/studentRoutes");
const eseRoutes = require("./routes/eseRoutes");
const ciaRoutes = require("./routes/ciaRoutes");
const ciaQuestionRoutes = require("./routes/ciaQuestionRoutes");
const attainmentRoutes = require("./routes/attainmentRoutes");
const adminRoutes = require("./routes/adminRoutes");
const manualAttainmentRoutes = require("./routes/manualAttainmentRoutes");
const departmentRoutes = require("./routes/departmentRoutes");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date() }));

app.use("/api/auth", authRoutes);
app.use("/api/meta", metaRoutes);
app.use("/api/matrix", matrixRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/ese", eseRoutes);
app.use("/api/cia", ciaRoutes);
app.use("/api/cia-question", ciaQuestionRoutes);
app.use("/api/attainment", attainmentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/manual-attainment", manualAttainmentRoutes);
app.use("/api/department", departmentRoutes);

app.use((req, res) => res.status(404).json({ message: "Route not found" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Server error", error: err.message });
});


async function migrateCIAIndexes() {
  const migrations = [
    {
      model: CIAQuestionSet,
      oldKeys: ["paperCodeKey", "exam", "term", "academicYear"],
      newKeys: { departmentKey: 1, paperCodeKey: 1, exam: 1, term: 1, academicYear: 1 },
      newName: "cia_department_question_unique",
    },
    {
      model: CIAActivitySet,
      oldKeys: ["paperCodeKey", "term", "academicYear"],
      newKeys: { departmentKey: 1, paperCodeKey: 1, term: 1, academicYear: 1 },
      newName: "cia_department_activity_unique",
    },
  ];

  for (const migration of migrations) {
    let indexes = [];
    try {
      indexes = await migration.model.collection.indexes();
    } catch (err) {
      if (err?.codeName !== "NamespaceNotFound" && err?.code !== 26) throw err;
    }
    for (const index of indexes) {
      const keys = Object.keys(index.key || {});
      const isOld = index.unique && keys.length === migration.oldKeys.length && migration.oldKeys.every((key, i) => keys[i] === key);
      if (isOld && index.name !== migration.newName) {
        try {
          await migration.model.collection.dropIndex(index.name);
          console.log(`[Migration] Dropped legacy CIA index ${index.name}`);
        } catch (err) {
          if (err?.codeName !== "IndexNotFound") throw err;
        }
      }
    }
    await migration.model.collection.createIndex(migration.newKeys, { unique: true, name: migration.newName });
  }
}

async function bootstrapAdmin() {
  const count = await Admin.countDocuments();
  if (count === 0 && process.env.ADMIN_ID && process.env.ADMIN_PASSWORD) {
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    await Admin.create({ adminId: process.env.ADMIN_ID, passwordHash, name: "Administrator" });
    console.log(`[Bootstrap] Default admin created -> ID: ${process.env.ADMIN_ID}`);
  }
}

const PORT = process.env.PORT || 5000;
connectDB().then(async () => {
  await migrateCIAIndexes();
  await bootstrapAdmin();
  app.listen(PORT, () => console.log(`[Server] running on http://localhost:${PORT}`));
});
