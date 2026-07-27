const mongoose = require("mongoose");

const AdminSchema = new mongoose.Schema(
  {
    adminId: { type: String, required: true, unique: true },
    name: { type: String, default: "Administrator" },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Admin", AdminSchema);
