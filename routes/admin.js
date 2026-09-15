const express = require("express");
const router  = express.Router();
const path    = require("path");
const fs      = require("fs");
const multer  = require("multer");

// Legacy in-memory data (subjects, grades, users — unchanged)
const data    = require("../data/sampleData");
// New persistent content store
const store   = require("../data/contentStore");

// ── Multer: save PDFs to /tmp on Vercel (read-only fs), or storage/ locally ──
const IS_WRITABLE = (() => {
  try {
    const probe = path.join(__dirname, "..", "data", ".write-test");
    fs.writeFileSync(probe, "1", "utf8");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
})();

const STORAGE_ROOT = IS_WRITABLE
  ? path.join(__dirname, "..", "storage", "documents")
  : "/tmp/student-os-uploads";

// Map materialType values to folder names
function typeToFolder(materialType) {
  const map = {
    "Past Paper":     "past-papers",
    "Notes":          "notes",
    "Textbook":       "textbooks",
    "Revision":       "revision",
    "Exam Paper":     "exam-papers",
    "Study Guide":    "study-guides",
    "Marking Scheme": "past-papers",
    "Other":          "other",
  };
  return map[materialType] || "other";
}

const pdfStorage = multer.diskStorage({
  destination(req, file, cb) {
    const folder = typeToFolder(req.body.materialType || "Other");
    const dest   = path.join(STORAGE_ROOT, folder);
    try {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    } catch (e) {
      // /tmp is writable on Vercel; if this still fails, fall through
    }
    cb(null, dest);
  },
  filename(req, file, cb) {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, Date.now() + "_" + safe);
  },
});

const upload = multer({
  storage: pdfStorage,
  limits:  { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter(_req, file, cb) {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed."));
  },
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024)        return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get("/", (req, res) => {
  const allMaterials = store.materials.all();
  const stats = {
    materials:      allMaterials.length,
    subjects:       data.subjects.length,
    examInfo:       store.examInfo.all().length,
    announcements:  store.announcements.all().length,
    totalViews:     allMaterials.reduce((sum, m) => sum + (m.views || 0), 0),
    totalDownloads: allMaterials.reduce((sum, m) => sum + (m.downloads || 0), 0),
  };
  res.render("admin/dashboard", { title: "Dashboard", activeNav: "dashboard", stats });
});

// ── Students ─────────────────────────────────────────────────────────────────
router.get("/students", (req, res) => {
  res.render("admin/students", { title: "Students", activeNav: "students", users: data.users });
});

// ── Teachers ─────────────────────────────────────────────────────────────────
router.get("/teachers", (req, res) => {
  res.render("admin/teachers", { title: "Teachers", activeNav: "teachers" });
});

// ── Grades ───────────────────────────────────────────────────────────────────
router.get("/grades", (req, res) => {
  res.render("admin/grades", { title: "Grades", activeNav: "grades", grades: data.grades });
});

// ── Subjects ─────────────────────────────────────────────────────────────────
router.get("/subjects", (req, res) => {
  res.render("admin/subjects", { title: "Subjects", activeNav: "subjects", subjects: data.subjects });
});

// ── Content — Learning Materials, Exam Info, Announcements ──────────────────

const MATERIAL_TYPES = [
  "Past Paper",
  "Marking Scheme",
  "Notes",
  "Study Guide",
  "Revision",
  "Textbook",
  "Exam Paper",
  "Other",
];

const EXAM_CATEGORIES = [
  "Exam Information",
  "Exam Dates",
  "Exam Rules",
  "Registration Information",
  "Results Information",
  "Study Tips",
  "Syllabus Information",
  "Subject Information",
];

router.get("/content", (req, res) => {
  const tab = req.query.tab || "materials";
  res.render("admin/content", {
    title:          "Content",
    activeNav:      "content",
    tab,
    grades:         data.grades,
    subjects:       data.subjects,
    years:          data.years,
    materialTypes:  MATERIAL_TYPES,
    examCategories: EXAM_CATEGORIES,
    materials:      store.materials.all(),
    examInfo:       store.examInfo.all(),
    announcements:  store.announcements.all(),
    flash:          req.query.flash    || null,
    flashMsg:       req.query.flashMsg || null,
  });
});

// ── POST: Upload a PDF Learning Material ─────────────────────────────────────
router.post("/content/material", upload.single("pdfFile"), (req, res) => {
  try {
    const { title, description, grade, subject, topic, term, year, materialType } = req.body;

    if (!title || !grade || !materialType || !req.file) {
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return res.redirect("/admin/content?tab=materials&flash=error&flashMsg=Please+fill+in+all+required+fields+and+upload+a+PDF.");
    }

    // On Vercel files land in /tmp — serve them from there via a route below.
    // Locally they're in storage/ and served by the static middleware.
    const folder  = typeToFolder(materialType);
    const webPath = IS_WRITABLE
      ? `/storage/documents/${folder}/${req.file.filename}`
      : `/tmp-files/${req.file.filename}`;

    store.materials.add({
      title,
      description,
      grade,
      subject:      subject || "",
      topic:        topic   || "",
      term:         term    || "",
      year:         year    || "",
      materialType,
      fileName:     req.file.originalname,
      fileSize:     formatBytes(req.file.size),
      filePath:     webPath,
      _diskPath:    req.file.path, // absolute path for downloads on Vercel
    });

    res.redirect("/admin/content?tab=materials&flash=success&flashMsg=Material+uploaded+successfully.");
  } catch (err) {
    console.error("Upload error:", err);
    res.redirect("/admin/content?tab=materials&flash=error&flashMsg=" + encodeURIComponent(err.message));
  }
});

// ── POST: Delete a material ──────────────────────────────────────────────────
router.post("/content/material/:id/delete", (req, res) => {
  const item = store.materials.remove(req.params.id);
  if (item) {
    const absPath = item._diskPath || (item.filePath ? path.join(__dirname, "..", item.filePath) : null);
    if (absPath) {
      try { if (fs.existsSync(absPath)) fs.unlinkSync(absPath); } catch {}
    }
  }
  res.redirect("/admin/content?tab=materials&flash=success&flashMsg=Material+deleted.");
});

// ── POST: Toggle publish status of a material ────────────────────────────────
router.post("/content/material/:id/toggle", (req, res) => {
  const item = store.materials.findById(req.params.id);
  if (item) store.materials.update(req.params.id, { published: !item.published });
  res.redirect("/admin/content?tab=materials&flash=success&flashMsg=Status+updated.");
});

// ── POST: Add Exam Info ──────────────────────────────────────────────────────
router.post("/content/examinfo", (req, res) => {
  const { title, category, grade, content, published } = req.body;
  if (!title || !content) {
    return res.redirect("/admin/content?tab=examinfo&flash=error&flashMsg=Title+and+content+are+required.");
  }
  store.examInfo.add({ title, category, grade, content, published: published === "on" });
  res.redirect("/admin/content?tab=examinfo&flash=success&flashMsg=Exam+information+saved.");
});

// ── POST: Delete Exam Info ───────────────────────────────────────────────────
router.post("/content/examinfo/:id/delete", (req, res) => {
  store.examInfo.remove(req.params.id);
  res.redirect("/admin/content?tab=examinfo&flash=success&flashMsg=Exam+info+deleted.");
});

// ── POST: Toggle publish Exam Info ───────────────────────────────────────────
router.post("/content/examinfo/:id/toggle", (req, res) => {
  const item = store.examInfo.findById(req.params.id);
  if (item) store.examInfo.update(req.params.id, { published: !item.published });
  res.redirect("/admin/content?tab=examinfo&flash=success&flashMsg=Status+updated.");
});

// ── Announcements ─────────────────────────────────────────────────────────────
router.get("/announcements", (req, res) => {
  res.render("admin/announcements", {
    title:         "Announcements",
    activeNav:     "announcements",
    grades:        data.grades,
    announcements: store.announcements.all(),
    flash:         req.query.flash    || null,
    flashMsg:      req.query.flashMsg || null,
  });
});

router.post("/announcements", (req, res) => {
  const { title, body, grade, published } = req.body;
  if (!title || !body) {
    return res.redirect("/admin/announcements?flash=error&flashMsg=Title+and+body+are+required.");
  }
  store.announcements.add({ title, body, grade, published: published === "on" });
  res.redirect("/admin/announcements?flash=success&flashMsg=Announcement+saved.");
});

router.post("/announcements/:id/delete", (req, res) => {
  store.announcements.remove(req.params.id);
  res.redirect("/admin/announcements?flash=success&flashMsg=Announcement+deleted.");
});

router.post("/announcements/:id/toggle", (req, res) => {
  const item = store.announcements.findById(req.params.id);
  if (item) store.announcements.update(req.params.id, { published: !item.published });
  res.redirect("/admin/announcements?flash=success&flashMsg=Status+updated.");
});

// ── Reports ───────────────────────────────────────────────────────────────────
router.get("/reports", (req, res) => {
  res.render("admin/reports", { title: "Reports", activeNav: "reports" });
});

// ── Settings ──────────────────────────────────────────────────────────────────
router.get("/settings", (req, res) => {
  res.render("admin/settings", { title: "Settings", activeNav: "settings" });
});

module.exports = router;
