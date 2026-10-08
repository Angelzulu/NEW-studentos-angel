/**
 * Email notifications for suspicious admin login activity.
 * Configure SMTP_* and SECURITY_ALERT_EMAIL in the deployment environment.
 */
const nodemailer = require("nodemailer");

const ALERT_EMAIL = process.env.SECURITY_ALERT_EMAIL || "Angelzuluitx@gmail.com";
const COOLDOWN_MS = 5 * 60 * 1000;
const lastAlertByIp = new Map();

async function sendFailedAdminLoginAlert({ username, ip, userAgent }) {
  const now = Date.now();
  const key = ip || "unknown";
  const previous = lastAlertByIp.get(key) || 0;

  // Avoid flooding the inbox: at most one alert per IP every five minutes.
  if (now - previous < COOLDOWN_MS) return;
  lastAlertByIp.set(key, now);

  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.warn("[security-alert] SMTP is not configured; failed-login email was not sent.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: String(SMTP_SECURE).toLowerCase() === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const timestamp = new Date().toISOString();
  await transporter.sendMail({
    from: process.env.SECURITY_ALERT_FROM || SMTP_USER,
    to: ALERT_EMAIL,
    subject: "Student OS security alert: failed admin login",
    text: [
      "A failed attempt to log in to the Student OS admin area was detected.",
      "",
      `Username entered: ${String(username || "(empty)").slice(0, 100)}`,
      `Time (UTC): ${timestamp}`,
      `IP address: ${String(ip || "unknown").slice(0, 100)}`,
      `User agent: ${String(userAgent || "unknown").slice(0, 300)}`,
      "",
      "The attempted password has not been recorded or included in this email.",
      "Repeated attempts from the same IP are grouped by a five-minute email cooldown.",
    ].join("\n"),
  });
}

module.exports = { sendFailedAdminLoginAlert };
