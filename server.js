const express      = require("express");
const path         = require("path");
const os           = require("os");
const fs           = require("fs");
const session      = require("express-session");
const flash        = require("connect-flash");

// ── Validate required environment variables before starting ──────────────────
if (process.env.NODE_ENV === "production") {
  const required = ["SESSION_SECRET", "ADMIN_PASSWORD_HASH"];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

const siteRoutes  = require("./routes/site");
const adminRoutes = require("./routes/admin");
const authRoutes  = require("./routes/auth");

const app  = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// Render (and Vercel, Heroku, etc.) sit behind a reverse proxy that terminates
// HTTPS and forwards requests to this app over plain HTTP, setting an
// "X-Forwarded-Proto: https" header. Without this line, Express has no way
// to know the original request was secure, so express-session's
// `cookie.secure: true` check fails and it silently refuses to set the
// session cookie — the exact cause of "login does nothing" in production.
app.set("trust proxy", 1);

// ── Ensure persistent storage directories exist (local dev only) ──────────────
// Vercel's filesystem is read-only; skip directory creation in production.
if (process.env.NODE_ENV !== "production") {
  const storageDirs = [
    "storage/documents/past-papers",
    "storage/documents/notes",
    "storage/documents/textbooks",
    "storage/documents/revision",
    "storage/documents/exam-papers",
    "storage/documents/study-guides",
    "storage/documents/other",
  ];
  storageDirs.forEach(d => {
    const full = path.join(__dirname, d);
    if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
  });
}

// ── Security headers ─────────────────────────────────────────────────────────
// Set X-Content-Type-Options, X-Frame-Options, etc. without pulling in helmet
// (keeps dependencies lean). Add helmet later for a full CSP policy.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// ── View engine ──────────────────────────────────────────────────────────────
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ── Static assets ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));
// Serve uploaded PDFs locally via /storage/documents/...
app.use("/storage", express.static(path.join(__dirname, "storage")));

// On Vercel, uploaded files go to /tmp — serve them via /tmp-files/:filename
app.get("/tmp-files/:filename", (req, res) => {
  const safe    = path.basename(req.params.filename); // prevent path traversal
  const baseDir = "/tmp/student-os-uploads";
  let found = null;
  try {
    const subdirs = fs.readdirSync(baseDir);
    for (const sub of subdirs) {
      const candidate = path.join(baseDir, sub, safe);
      if (fs.existsSync(candidate)) { found = candidate; break; }
    }
    const direct = path.join(baseDir, safe);
    if (!found && fs.existsSync(direct)) found = direct;
  } catch {}
  if (!found) return res.status(404).send("File not found");
  res.sendFile(found);
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── Sessions ─────────────────────────────────────────────────────────────────
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret && process.env.NODE_ENV === "production") {
  throw new Error("SESSION_SECRET environment variable is required in production.");
}

app.use(session({
  name:   "studentos.sid",
  secret: sessionSecret || "dev-only-insecure-secret-change-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,                                      // no JS access
    secure:   process.env.NODE_ENV === "production",     // HTTPS only in prod
    maxAge:   8 * 60 * 60 * 1000,                        // 8-hour sessions
    sameSite: "lax",
  },
}));

// ── Flash messages (used by auth routes) ─────────────────────────────────────
app.use(flash());

// ── Globals available in all views ───────────────────────────────────────────
app.use((req, res, next) => {
  res.locals.siteName    = "Student OS";
  res.locals.currentPath = req.path;
  next();
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/", siteRoutes);
app.use("/admin", authRoutes);   // login / logout (unprotected)
app.use("/admin", adminRoutes);  // all other admin routes (protected inside)

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render("404", { title: "Page Not Found" });
});

// ── Detect local IP for phone access ─────────────────────────────────────────
function getLocalNetworkIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return null;
}

app.listen(PORT, HOST, () => {
  const lanIP = getLocalNetworkIP();
  console.log(`Student OS is running:`);
  console.log(`  On this PC:        http://localhost:${PORT}`);
  if (lanIP) {
    console.log(`  From your phone:   http://${lanIP}:${PORT}  (same Wi-Fi network)`);
  }
  if (process.env.NODE_ENV !== "production") {
    console.log(`\n  [dev] SESSION_SECRET not set — using insecure default. Set it in .env.`);
  }
});

module.exports = app;
