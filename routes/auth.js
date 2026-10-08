/**
 * routes/auth.js
 * Handles GET /admin/login, POST /admin/login, POST /admin/logout.
 * Passwords are compared with bcrypt — never exposed to the client.
 */

const express   = require("express");
const crypto    = require("crypto");
const router    = express.Router();
const bcrypt    = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const ADMIN_USERS = require("../data/adminUsers");
const { sendFailedAdminLoginAlert } = require("../utils/securityAlerts");

// ── Brute-force protection: max 10 attempts per 15 min per IP ────────────────
const loginLimiter = rateLimit({
  windowMs:         15 * 60 * 1000, // 15 minutes
  max:              10,
  message:          "Too many login attempts. Please wait 15 minutes and try again.",
  standardHeaders:  true,
  legacyHeaders:    false,
  skipSuccessfulRequests: true,
});

// ── GET /admin/login ─────────────────────────────────────────────────────────
router.get("/login", (req, res) => {
  // Never let an existing session bypass the login screen. Visiting the login
  // page is treated as a fresh authentication boundary.
  if (req.session && req.session.adminUser) {
    req.session.destroy(() => {
      res.clearCookie("studentos.sid");
      res.redirect("/admin/login");
    });
    return;
  }
  // Issue a one-time token for this login form. A submitted form can only be
  // processed once, so pressing Enter twice cannot submit a stale form again.
  req.session.loginFormToken = crypto.randomBytes(32).toString("hex");
  const error   = req.flash("loginError")[0]   || null;
  const success = req.flash("loginSuccess")[0] || null;
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  req.session.save(() => {
    res.render("admin/login", {
      title: "Admin Login",
      error,
      success,
      loginFormToken: req.session.loginFormToken,
    });
  });
});

// ── POST /admin/login ────────────────────────────────────────────────────────
router.post("/login", loginLimiter, async (req, res) => {
  const { username, password, loginFormToken } = req.body;

  // Reject duplicate/replayed submissions. This is especially important when
  // a user presses Enter twice: the second request must not be able to create
  // a new authenticated session from an old form submission.
  const expectedToken = req.session && req.session.loginFormToken;
  if (!expectedToken || !loginFormToken || !crypto.timingSafeEqual(
    Buffer.from(String(expectedToken)),
    Buffer.from(String(loginFormToken))
  )) {
    req.flash("loginError", "This login form has expired. Please try again.");
    return res.redirect("/admin/login");
  }
  delete req.session.loginFormToken;

  // A login attempt must always authenticate again. Do not let an existing
  // admin session turn an incorrect password into a successful login.
  if (req.session && req.session.adminUser) {
    await new Promise(resolve => req.session.destroy(() => resolve()));
    res.clearCookie("studentos.sid");
  }

  if (!username || !password) {
    // Explicitly remove any authenticated identity before returning an error.
    req.session.adminUser = null;
    req.flash("loginError", "Username and password are required.");
    return req.session.save(() => res.redirect("/admin/login"));
  }

  const normalizedUsername = String(username).trim().slice(0, 100);
  const user = ADMIN_USERS.find(
    u => u.username.toLowerCase() === normalizedUsername.toLowerCase()
  );

  // Constant-time comparison even on username miss (prevents timing attacks).
  const dummyHash = "$2b$12$invalidhashpadding00000000000000000000000000000000000";
  const hashToCheck = user ? user.passwordHash : dummyHash;
  const match = await bcrypt.compare(password, hashToCheck);

  if (!user || !match) {
    // Never log or email the password. Email delivery failures must not affect login.
    sendFailedAdminLoginAlert({
      username: normalizedUsername || "(empty)",
      ip: req.ip,
      userAgent: req.get("user-agent"),
    }).catch(err => console.error("[security-alert] Could not send failed-login email:", err.message));

    // A failed authentication must leave the session unauthenticated. Save
    // that state before redirecting so a second Enter/submit cannot reuse a
    // stale authenticated session.
    req.session.adminUser = null;
    req.flash("loginError", "Invalid username or password.");
    return req.session.save(() => res.redirect("/admin/login"));
  }

  // Regenerate session to prevent session-fixation.
  req.session.regenerate(err => {
    if (err) {
      req.flash("loginError", "Login failed. Please try again.");
      return res.redirect("/admin/login");
    }
    req.session.adminUser = {
      id:          user.id,
      username:    user.username,
      displayName: user.displayName,
      role:        user.role,
    };
    const dest = req.session.returnTo || "/admin";
    delete req.session.returnTo;
    res.redirect(dest);
  });
});

// ── POST /admin/logout ───────────────────────────────────────────────────────
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("studentos.sid");
    res.redirect("/admin/login");
  });
});

module.exports = router;
