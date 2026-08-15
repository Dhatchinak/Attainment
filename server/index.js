require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const connectDB = require("./config/db");
const Admin = require("./models/Admin");

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

app.use((req, res) => res.status(404).json({ message: "Route not found" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Server error", error: err.message });
});

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
  await bootstrapAdmin();
  app.listen(PORT, () => console.log(`[Server] running on http://localhost:${PORT}`));
});
