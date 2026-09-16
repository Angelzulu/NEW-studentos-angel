const express = require("express");
const router  = express.Router();
const path    = require("path");
const fs      = require("fs");
const multer  = require("multer");
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const dotenv  = require("dotenv");

dotenv.config();

// ── Cloudflare R2 client ─────────────────────────────────────────────────────
// Files are uploaded here for persistent, production-grade storage.
// Locally, files fall back to disk if R2 credentials are not set.
const R2_CONFIGURED =
  process.env.R2_ENDPOINT &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME;

const r2 = R2_CONFIGURED
  ? new S3Client({
      region:   "auto",
      endpoint: process.env.R2_ENDPOINT,   // e.g. https://ACCOUNT_ID.r2.cloudflarestorage.com
      forcePathStyle: true,                // recommended for R2 S3-compat endpoints
      credentials: {
        accessKeyId:     process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

const R2_BUCKET     = process.env.R2_BUCKET_NAME  || null;
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL  || "").replace(/\/$/, "");

if (!R2_CONFIGURED) {
  console.warn("[admin] R2 not configured — uploads will be stored on local disk.");
}

// ── Auth middleware ───────────────────────────────────────────────────────────
const { requireLogin, requireOwner } = require("../middleware/auth");

// Every route in this file requires a valid session.
// The login/logout routes live in routes/auth.js and are NOT protected.
router.use(requireLogin);

// Legacy in-memory data (subjects, grades, users — unchanged)
const data  = require("../data/sampleData");
// New persistent content store — also exports IS_WRITABLE
const { materials: matStore, examInfo: examStore, announcements: announceStore, IS_WRITABLE } =
  require("../data/contentStore");

// ── Multer: buffer in memory, then stream to R2 or save to disk ──────────────
// We use memoryStorage so we can pipe the buffer to R2 without a temp file
// race condition. For large files (> ~50 MB) you may want diskStorage + stream.
const upload = multer({
  storage: multer.memoryStorage(),
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

function safeName(originalName) {
  return originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get("/", (req, res) => {
  const allMaterials = matStore.all();
  const stats = {
    materials:      allMaterials.length,
    subjects:       data.subjects.length,
    examInfo:       examStore.all().length,
    announcements:  announceStore.all().length,
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
    materials:      matStore.all(),
    examInfo:       examStore.all(),
    announcements:  announceStore.all(),
    flash:          req.query.flash    || null,
    flashMsg:       req.query.flashMsg || null,
  });
});

// ── POST: Upload a PDF Learning Material ─────────────────────────────────────
router.post("/content/material", requireOwner, upload.single("pdfFile"), async (req, res) => {
  try {
    const { title, description, grade, subject, topic, term, year, materialType } = req.body;

    if (!title || !grade || !materialType || !req.file) {
      return res.redirect(
        "/admin/content?tab=materials&flash=error&flashMsg=Please+fill+in+all+required+fields+and+upload+a+PDF."
      );
    }

    const folder   = typeToFolder(materialType);
    const filename = Date.now() + "_" + safeName(req.file.originalname);
    let filePath, r2Key = null;

    if (R2_CONFIGURED) {
      // ── Upload to Cloudflare R2 ──────────────────────────────────────────
      r2Key    = `documents/${folder}/${filename}`;
      filePath = `${R2_PUBLIC_URL}/${r2Key}`;

      await r2.send(new PutObjectCommand({
        Bucket:      R2_BUCKET,
        Key:         r2Key,
        Body:        req.file.buffer,
        ContentType: "application/pdf",
      }));
    } else {
      // ── Local disk fallback (dev only) ───────────────────────────────────
      const STORAGE_ROOT = IS_WRITABLE
        ? path.join(__dirname, "..", "storage", "documents")
        : "/tmp/student-os-uploads";

      const dest = path.join(STORAGE_ROOT, folder);
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

      const diskPath = path.join(dest, filename);
      fs.writeFileSync(diskPath, req.file.buffer);

      filePath = IS_WRITABLE
        ? `/storage/documents/${folder}/${filename}`
        : `/tmp-files/${filename}`;
    }

    matStore.add({
      title,
      description,
      grade,
      subject:      subject      || "",
      topic:        topic        || "",
      term:         term         || "",
      year:         year         || "",
      materialType,
      fileName:     req.file.originalname,
      fileSize:     formatBytes(req.file.size),
      filePath,
      r2Key,
    });

    res.redirect("/admin/content?tab=materials&flash=success&flashMsg=Material+uploaded+successfully.");
  } catch (err) {
    console.error("Upload error:", err);
    res.redirect("/admin/content?tab=materials&flash=error&flashMsg=" + encodeURIComponent(err.message));
  }
});

// ── POST: Delete a material ──────────────────────────────────────────────────
router.post("/content/material/:id/delete", requireOwner, async (req, res) => {
  const item = matStore.remove(req.params.id);
  if (item) {
    if (item.r2Key && R2_CONFIGURED) {
      // Delete from R2
      try {
        await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: item.r2Key }));
      } catch (e) {
        console.error("R2 delete error:", e);
      }
    } else if (item.filePath && !item.filePath.startsWith("http")) {
      // Delete from local disk
      const absPath = path.join(__dirname, "..", item.filePath);
      try { if (fs.existsSync(absPath)) fs.unlinkSync(absPath); } catch {}
    }
  }
  res.redirect("/admin/content?tab=materials&flash=success&flashMsg=Material+deleted.");
});

// ── POST: Toggle publish status of a material ────────────────────────────────
router.post("/content/material/:id/toggle", requireOwner, (req, res) => {
  const item = matStore.findById(req.params.id);
  if (item) matStore.update(req.params.id, { published: !item.published });
  res.redirect("/admin/content?tab=materials&flash=success&flashMsg=Status+updated.");
});

// ── POST: Add Exam Info ──────────────────────────────────────────────────────
router.post("/content/examinfo", requireOwner, (req, res) => {
  const { title, category, grade, content, published } = req.body;
  if (!title || !content) {
    return res.redirect("/admin/content?tab=examinfo&flash=error&flashMsg=Title+and+content+are+required.");
  }
  examStore.add({ title, category, grade, content, published: published === "on" });
  res.redirect("/admin/content?tab=examinfo&flash=success&flashMsg=Exam+information+saved.");
});

// ── POST: Delete Exam Info ───────────────────────────────────────────────────
router.post("/content/examinfo/:id/delete", requireOwner, (req, res) => {
  examStore.remove(req.params.id);
  res.redirect("/admin/content?tab=examinfo&flash=success&flashMsg=Exam+info+deleted.");
});

// ── POST: Toggle publish Exam Info ───────────────────────────────────────────
router.post("/content/examinfo/:id/toggle", requireOwner, (req, res) => {
  const item = examStore.findById(req.params.id);
  if (item) examStore.update(req.params.id, { published: !item.published });
  res.redirect("/admin/content?tab=examinfo&flash=success&flashMsg=Status+updated.");
});

// ── Announcements ─────────────────────────────────────────────────────────────
router.get("/announcements", (req, res) => {
  res.render("admin/announcements", {
    title:         "Announcements",
    activeNav:     "announcements",
    grades:        data.grades,
    announcements: announceStore.all(),
    flash:         req.query.flash    || null,
    flashMsg:      req.query.flashMsg || null,
  });
});

router.post("/announcements", requireOwner, (req, res) => {
  const { title, body, grade, published } = req.body;
  if (!title || !body) {
    return res.redirect("/admin/announcements?flash=error&flashMsg=Title+and+body+are+required.");
  }
  announceStore.add({ title, body, grade, published: published === "on" });
  res.redirect("/admin/announcements?flash=success&flashMsg=Announcement+saved.");
});

router.post("/announcements/:id/delete", requireOwner, (req, res) => {
  announceStore.remove(req.params.id);
  res.redirect("/admin/announcements?flash=success&flashMsg=Announcement+deleted.");
});

router.post("/announcements/:id/toggle", requireOwner, (req, res) => {
  const item = announceStore.findById(req.params.id);
  if (item) announceStore.update(req.params.id, { published: !item.published });
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
