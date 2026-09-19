const express = require("express");
const router  = express.Router();
const path    = require("path");
const fs      = require("fs");

// Legacy in-memory data (grades, subjects etc.)
const data  = require("../data/sampleData");
// Persistent content store
const {
  materials: matStore, examInfo: examStore, announcements: announceStore,
  extractYear, sortPastPapers,
} = require("../data/contentStore");
// Read-only R2 client, used only for streaming PDFs to the viewer/download —
// see utils/r2.js for why this exists (R2_PUBLIC_URL is misconfigured).
const { R2_CONFIGURED, streamR2Object } = require("../utils/r2");

// A material was uploaded to R2 if it has an r2Key. Its stored filePath may
// be a broken link (built from the misconfigured R2_PUBLIC_URL), so for these
// we always stream the object ourselves instead of trusting/redirecting to
// filePath.
function isR2Material(material) {
  return !!(material && material.r2Key && R2_CONFIGURED);
}

// ── Home ─────────────────────────────────────────────────────────────────────
router.get("/", (req, res) => {
  res.render("index", {
    title:         "Home",
    announcements: announceStore.published().slice(0, 3),
  });
});

// ── Grade section — real content, grouped by subject ─────────────────────────
const GRADE_TAGLINES = {
  "7":  "Primary School Leaving Examinations",
  "9":  "Junior Secondary Examinations",
  "12": "School Certificate Examinations",
};

router.get("/grade/:gradeId", (req, res) => {
  const gradeId  = req.params.gradeId;
  const gradeDef = data.grades.find(g => g.id === `grade-${gradeId}`);
  if (!gradeDef) return res.status(404).render("404", { title: "Page Not Found" });

  const gradeName = gradeDef.name; // e.g. "Grade 7"

  const gradeMaterials = matStore
    .all()
    .filter(m => m.published && (m.grade === gradeName || m.grade === "All Grades"));

  const bySubject = {};
  gradeMaterials.forEach(m => {
    const subject = (m.subject && m.subject.trim()) || "General";
    if (!bySubject[subject]) bySubject[subject] = [];
    bySubject[subject].push(m);
  });

  const subjectSections = Object.keys(bySubject)
    .sort((a, b) => a.localeCompare(b))
    .map(subject => ({
      subject,
      count:          bySubject[subject].length,
      pastPaperCount: bySubject[subject].filter(m => m.materialType === "Past Paper").length,
    }));

  res.render("grade", {
    title:       gradeName,
    gradeName,
    gradeNumber: gradeId,
    tagline:     GRADE_TAGLINES[gradeId] || `Learning materials for ${gradeName}`,
    subjectSections,
  });
});

// ── Grade + Subject ───────────────────────────────────────────────────────────
router.get("/grade/:gradeId/:subject", (req, res) => {
  const gradeId  = req.params.gradeId;
  const gradeDef = data.grades.find(g => g.id === `grade-${gradeId}`);
  if (!gradeDef) return res.status(404).render("404", { title: "Page Not Found" });

  const gradeName   = gradeDef.name;
  const subjectName = req.params.subject;

  const subjectMaterials = matStore
    .all()
    .filter(m => m.published &&
      (m.grade === gradeName || m.grade === "All Grades") &&
      ((m.subject && m.subject.trim()) || "General") === subjectName);

  if (subjectMaterials.length === 0) {
    return res.status(404).render("404", { title: "Page Not Found" });
  }

  const pastPapers     = subjectMaterials.filter(m => m.materialType === "Past Paper");
  const otherMaterials = subjectMaterials.filter(m => m.materialType !== "Past Paper");

  // Group by year — using extractYear() rather than the raw `year` field,
  // since bulk-uploaded past papers never set `year` and only carry it
  // inside the title (e.g. "2021 P2 GCE").
  const byYear = {};
  pastPapers.forEach(m => {
    const year = extractYear(m) || "Undated";
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(m);
  });

  const yearSections = Object.keys(byYear)
    .sort((a, b) => (parseInt(b, 10) || 0) - (parseInt(a, 10) || 0))
    .map(year => ({
      year,
      // Within a year, order by paper number (P1, P2, P3...).
      papers: sortPastPapers(byYear[year]),
    }));

  res.render("grade-subject", {
    title:       `${subjectName} — ${gradeName}`,
    gradeName,
    gradeNumber: gradeId,
    subjectName,
    yearSections,
    otherMaterials,
  });
});

// ── Learning Materials — browseable list ─────────────────────────────────────
router.get("/materials", (req, res) => {
  const { grade, subject, materialType, year, search } = req.query;
  const filtered = matStore.filter({ grade, subject, materialType, year, search });
  res.render("materials", {
    title:         "Learning Materials",
    materials:     filtered,
    grades:        data.grades,
    subjects:      data.subjects,
    materialTypes: [
      "Past Paper","Marking Scheme","Notes","Study Guide",
      "Revision","Textbook","Exam Paper","Other",
    ],
    years:   data.years,
    filters: { grade, subject, materialType, year, search },
  });
});

// ── PDF Viewer ───────────────────────────────────────────────────────────────
router.get("/materials/:id/view", (req, res) => {
  const material = matStore.findById(req.params.id);
  if (!material) return res.status(404).render("404", { title: "Page Not Found" });
  matStore.incrementViews(req.params.id);

  // R2-backed files: embed our own streaming proxy (works regardless of
  // R2_PUBLIC_URL/bucket public-access config). Local files: keep serving
  // straight from /storage as before.
  const viewUrl = isR2Material(material)
    ? `/materials/${material.id}/raw`
    : material.filePath;

  res.render("pdf-viewer", { title: material.title, material, viewUrl });
});

// ── PDF Raw stream (R2-backed files only) ─────────────────────────────────────
// Streams the object straight from R2 using our authenticated client, so the
// browser <iframe> always gets the actual PDF bytes instead of a broken link.
router.get("/materials/:id/raw", async (req, res) => {
  const material = matStore.findById(req.params.id);
  if (!material) return res.status(404).render("404", { title: "Page Not Found" });

  if (!isR2Material(material)) {
    return res.status(404).render("404", { title: "File Not Found" });
  }

  try {
    await streamR2Object(material.r2Key, res, {
      filename: material.fileName || "document.pdf",
      disposition: "inline",
    });
  } catch (e) {
    console.error("R2 stream error (view):", e);
    res.status(502).render("404", { title: "File Not Found" });
  }
});

// ── PDF Download ──────────────────────────────────────────────────────────────
// R2-backed files: stream from R2 directly (bypasses the broken
// R2_PUBLIC_URL). Local files: send the file directly, as before.
router.get("/materials/:id/download", async (req, res) => {
  const material = matStore.findById(req.params.id);
  if (!material) return res.status(404).render("404", { title: "Page Not Found" });

  matStore.incrementDownloads(req.params.id);

  if (isR2Material(material)) {
    try {
      return await streamR2Object(material.r2Key, res, {
        filename: material.fileName || path.basename(material.filePath || "document.pdf"),
        disposition: "attachment",
      });
    } catch (e) {
      console.error("R2 stream error (download):", e);
      return res.status(502).render("404", { title: "File Not Found" });
    }
  }

  // Local disk path
  const absPath = path.join(__dirname, "..", material.filePath);
  if (!fs.existsSync(absPath)) {
    return res.status(404).render("404", { title: "File Not Found" });
  }
  res.download(absPath, material.fileName || path.basename(absPath));
});

// ── Past Papers ───────────────────────────────────────────────────────────────
router.get("/papers", (req, res) => {
  const { grade, subject, year } = req.query;
  const filtered = matStore.filter({ grade, subject, year, materialType: "Past Paper" });
  res.render("materials", {
    title:         "Past Papers",
    materials:     filtered,
    grades:        data.grades,
    subjects:      data.subjects,
    materialTypes: ["Past Paper"],
    years:         data.years,
    filters:       { grade, subject, year, materialType: "Past Paper" },
  });
});

// ── Subjects ─────────────────────────────────────────────────────────────────
router.get("/subjects", (req, res) => {
  res.render("subjects", { title: "Subjects", subjects: data.subjects });
});

// ── Exam Information ─────────────────────────────────────────────────────────
router.get("/exams", (req, res) => {
  res.render("exams", {
    title:    "Exam Information",
    examInfo: examStore.published(),
  });
});

// ── Resources ────────────────────────────────────────────────────────────────
router.get("/resources", (req, res) => {
  const filtered = matStore.filter({});
  res.render("materials", {
    title:         "Resources",
    materials:     filtered,
    grades:        data.grades,
    subjects:      data.subjects,
    materialTypes: [
      "Past Paper","Marking Scheme","Notes","Study Guide",
      "Revision","Textbook","Exam Paper","Other",
    ],
    years:   data.years,
    filters: {},
  });
});

// ── Contact ───────────────────────────────────────────────────────────────────
router.get("/contact", (req, res) => {
  res.render("contact", { title: "Contact" });
});

// ── Announcements (student-facing) ───────────────────────────────────────────
router.get("/announcements", (req, res) => {
  res.render("announcements", {
    title:         "Announcements",
    announcements: announceStore.published(),
  });
});

module.exports = router;
