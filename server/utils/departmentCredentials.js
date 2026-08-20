const crypto = require("crypto");

function encryptionKey() {
  const secret = process.env.DEPARTMENT_PASSWORD_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error("DEPARTMENT_PASSWORD_ENCRYPTION_KEY or JWT_SECRET is required");
  return crypto.createHash("sha256").update(String(secret)).digest();
}

function encryptPassword(password) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(password), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((value) => value.toString("base64url")).join(".");
}

function decryptPassword(payload) {
  const [ivText, tagText, encryptedText] = String(payload || "").split(".");
  if (!ivText || !tagText || !encryptedText) throw new Error("Stored department credential is invalid");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

function normalizeDepartmentCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function generateDepartmentPassword(departmentCode) {
  const code = normalizeDepartmentCode(departmentCode);
  const suffix = crypto.randomInt(10, 100);
  return `${code}${suffix}`;
}

function validDepartmentPassword(password, departmentCode) {
  const code = normalizeDepartmentCode(departmentCode);
  return new RegExp(`^${code}\\d{2}$`).test(String(password || "").trim().toUpperCase());
}

module.exports = {
  encryptPassword,
  decryptPassword,
  generateDepartmentPassword,
  normalizeDepartmentCode,
  validDepartmentPassword,
};
