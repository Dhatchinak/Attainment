const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

async function sendOtpEmail(toEmail, staffName, otp) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#1e3a8a,#3730a3);padding:20px;color:#fff;">
        <h2 style="margin:0;">CO-PO Attainment Portal</h2>
      </div>
      <div style="padding:24px;">
        <p>Hi ${staffName || "Staff"},</p>
        <p>Your One-Time Password (OTP) for staff login is:</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1e3a8a;margin:16px 0;">${otp}</div>
        <p>This OTP is valid for 5 minutes. Do not share this with anyone.</p>
        <p style="color:#6b7280;font-size:12px;margin-top:24px;">If you did not request this, please ignore this email.</p>
      </div>
    </div>`;

  await transporter.sendMail({
    from: `"Attainment Portal" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `Your OTP: ${otp} - Attainment Portal Login`,
    html,
  });
}

module.exports = { sendOtpEmail };
