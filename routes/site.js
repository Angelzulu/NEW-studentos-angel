const express = require("express");
const router  = express.Router();
const path    = require("path");
const fs      = require("fs");

// Legacy in-memory data (grades, subjects etc.)
const data  = require("../data/sampleData");
// Persistent content store
const store = require("../data/contentStore");

// ── Home ─────────────────────────────────────────────────────────────────────
router.get("/", (req, res) => {
  res.render("index", {
    title:         "Home",
    announcements: store.announcements.published().slice(0, 3),
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

  // Only published materials that belong to this grade (or tagged for all grades)
  const gradeMaterials = store.materials
    .all()
    .filter(m => m.published && (m.grade === gradeName || m.grade === "All Grades"));

  // Group into subject sections — only subjects that actually have content
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
      materials: bySubject[subject].sort((a, b) => {
        const yearDiff = (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0);
        return yearDiff !== 0 ? yearDiff : a.title.localeCompare(b.title);
      }),
    }));

  res.render("grade", {
    title:       gradeName,
    gradeName,
    gradeNumber: gradeId,
    tagline:     GRADE_TAGLINES[gradeId] || `Learning materials for ${gradeName}`,
    subjectSections,
  });
});

// ── Learning Materials — browseable list ─────────────────────────────────────
router.get("/materials", (req, res) => {
  const { grade, subject, materialType, year, search } = req.query;
  const filtered = store.materials.filter({ grade, subject, materialType, year, search });
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

// ── PDF Viewer — opens PDF inside Student OS ─────────────────────────────────
router.get("/materials/:id/view", (req, res) => {
  const material = store.materials.findById(req.params.id);
  if (!material) return res.status(404).render("404", { title: "Page Not Found" });
  store.materials.incrementViews(req.params.id);
  res.render("pdf-viewer", { title: material.title, material });
});

// ── PDF Download ──────────────────────────────────────────────────────────────
router.get("/materials/:id/download", (req, res) => {
  const material = store.materials.findById(req.params.id);
  if (!material) return res.status(404).render("404", { title: "Page Not Found" });

  const absPath = path.join(__dirname, "..", material.filePath);
  if (!fs.existsSync(absPath)) {
    return res.status(404).render("404", { title: "File Not Found" });
  }

  store.materials.incrementDownloads(req.params.id);
  res.download(absPath, material.fileName || path.basename(absPath));
});

// ── Past Papers (legacy route — shows materials of type "Past Paper") ─────────
router.get("/papers", (req, res) => {
  const { grade, subject, year } = req.query;
  const filtered = store.materials.filter({
    grade, subject, year, materialType: "Past Paper",
  });
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
    examInfo: store.examInfo.published(),
  });
});

// ── Resources (legacy alias → materials) ────────────────────────────────────
router.get("/resources", (req, res) => {
  const filtered = store.materials.filter({});
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

// ── Announcements (student-facing) ──────────────────────────────────────────
router.get("/announcements", (req, res) => {
  res.render("announcements", {
    title:         "Announcements",
    announcements: store.announcements.published(),
  });
});

module.exports = router;
