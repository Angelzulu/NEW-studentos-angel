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
// SEO: shared site URL/description constants (see config/seo.js)
const { SITE_URL } = require("../config/seo");

// Capitalises each word — used ONLY for <title>/<meta description> text so
// that e.g. subject "mathematics" reads as "Mathematics" in search results.
// Never used for on-page headings, so no visible content changes.
function titleCase(str) {
  return String(str || "")
    .split(" ")
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// A material was uploaded to R2 if it has an r2Key. Its stored filePath is
// always a broken link (built from the misconfigured R2_PUBLIC_URL — the
// Cloudflare dashboard URL, not an actual public object URL), so for any
// material with an r2Key we always route through /raw (our authenticated
// streaming proxy) regardless of whether R2 is configured in this process.
// Not checking R2_CONFIGURED here ensures we never fall back to the broken
// filePath — /raw will return a proper 503 if R2 env vars are missing.
function isR2Material(material) {
  return !!(material && material.r2Key);
}

// Local PDF path from the material's saved code, or null if it has none.
function localPdfPath(material) {
  const code = material && material.pdfCode;
  if (!code || !/^[a-z0-9_-]+$/i.test(code)) return null;
  return path.join(__dirname, "..", "public", "materials", `${code}.pdf`);
}

// ── Home ─────────────────────────────────────────────────────────────────────
router.get("/", (req, res) => {
  res.render("index", {
    title:         "Home",
    metaTitle:     "Student OS Zambia — Free Grade 7 & Grade 12 Past Papers, Notes & Study Resources",
    metaDescription:
      "Student OS Zambia is a free platform for Grade 7 and Grade 12 past papers, " +
      "Mathematics, English and other subject resources, exam information and " +
      "revision notes for Zambian students.",
    canonicalUrl:  SITE_URL + "/",
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
    metaTitle:   `Grade ${gradeId} Past Papers Zambia — Subjects & Study Resources | Student OS`,
    metaDescription:
      `Find Grade ${gradeId} past papers in Zambia for all subjects — Mathematics, ` +
      `English and more — plus notes and revision resources on Student OS.`,
    canonicalUrl: `${SITE_URL}/grade/${gradeId}`,
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

  const subjectTitleCased = titleCase(subjectName);

  res.render("grade-subject", {
    title:       `${subjectName} — ${gradeName}`,
    metaTitle:   `Zambia ${subjectTitleCased} Past Papers — ${gradeName} | Student OS`,
    metaDescription:
      `Download Zambia ${subjectTitleCased} past papers for ${gradeName}, sorted by ` +
      `year, with real exam questions to help you revise.`,
    canonicalUrl: `${SITE_URL}/grade/${gradeId}/${encodeURIComponent(subjectName)}`,
    gradeName,
    gradeNumber: gradeId,
    subjectName,
    subjectTitleCased,
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
    metaTitle:     "Learning Materials Zambia — Past Papers, Notes & Study Guides | Student OS",
    metaDescription:
      "Browse Grade 7, Grade 9 and Grade 12 learning materials in Zambia — past " +
      "papers, notes, textbooks and revision guides for Mathematics, English and " +
      "other subjects.",
    canonicalUrl:  `${SITE_URL}/materials`, // filters are excluded — avoids duplicate-content URLs
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

  // PDFs are served from public/materials/<id>.pdf via /raw (R2 no longer used for viewing).
  const viewUrl = `/materials/${material.id}/raw`;

  const tags = [material.subject, material.grade].filter(Boolean).join(" ");
  res.render("pdf-viewer", {
    title:      material.title,
    metaTitle:  `${material.title}${tags ? " — " + tags : ""} | Student OS`,
    metaDescription:
      `View and download ${material.title}` +
      `${material.grade ? " for " + material.grade : ""}` +
      `${material.subject ? " " + material.subject : ""} — free on Student OS Zambia.`,
    canonicalUrl: `${SITE_URL}/materials/${material.id}/view`,
    material,
    viewUrl,
  });
});

// ── PDF Raw stream (local storage or Cloudflare R2) ────────────────────────────
// Prefer a local copy, but fall back to R2 for files that are not on Render's
// ephemeral filesystem. This prevents valid R2-backed materials returning 404.
router.get("/materials/:id/raw", async (req, res) => {
  const material = matStore.findById(req.params.id);
  if (!material) return res.status(404).render("404", { title: "Page Not Found" });

  const filename = (material.fileName || "document.pdf").replace(/"/g, "");
  const absPath = localPdfPath(material);
  if (absPath && fs.existsSync(absPath)) {
    res.type("application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    return res.sendFile(absPath);
  }

  if (material.r2Key) {
    if (!R2_CONFIGURED) {
      console.error("[/raw] R2-backed PDF cannot be streamed: R2 is not configured");
      return res.status(503).render("404", { title: "Storage Not Available" });
    }
    try {
      return await streamR2Object(material.r2Key, res, {
        filename,
        disposition: "inline",
      });
    } catch (err) {
      console.error("[/raw] R2 stream failed:", err.message);
      if (!res.headersSent) {
        const missing = err.name === "NoSuchKey" || err.name === "NotFound" || err.$metadata?.httpStatusCode === 404;
        return res.status(missing ? 404 : 502).render("404", {
          title: missing ? "File Not Found" : "Storage Error",
        });
      }
      return res.end();
    }
  }

  // Legacy materials may still point to a valid local filePath.
  if (material.filePath && fs.existsSync(material.filePath)) {
    res.type("application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    return res.sendFile(path.resolve(material.filePath));
  }

  console.error(`[/raw] Missing PDF for material ${req.params.id}`);
  return res.status(404).render("404", { title: "File Not Found" });
});

// ── PDF Download ──────────────────────────────────────────────────────────────
// R2-backed files: stream from R2 directly (bypasses the broken
// R2_PUBLIC_URL). Local files: send the file directly, as before.
router.get("/materials/:id/download", async (req, res) => {
  const material = matStore.findById(req.params.id);
  if (!material) return res.status(404).render("404", { title: "Page Not Found" });

  matStore.incrementDownloads(req.params.id);

  // Local PDF saved under the material's code (preferred; R2 not used).
  const localPath = localPdfPath(material);
  if (localPath && fs.existsSync(localPath)) {
    return res.download(localPath, material.fileName || path.basename(localPath));
  }

  // R2-backed material (has an r2Key, regardless of R2_CONFIGURED).
  if (material.r2Key) {
    // If R2 credentials are missing, surface a clear error instead of
    // falling through to the local-disk path — filePath is the broken
    // dashboard URL, so the disk lookup always 404s for these files.
    if (!R2_CONFIGURED) {
      console.error(`[/download] R2 not configured — cannot stream key: ${material.r2Key}`);
      return res.status(503).render("404", { title: "Storage Not Available" });
    }

    try {
      return await streamR2Object(material.r2Key, res, {
        filename: material.fileName || path.basename(material.filePath || "document.pdf"),
        disposition: "attachment",
      });
    } catch (e) {
      const status = e.statusCode === 404 ? 404 : 502;
      console.error(`R2 stream error (download) [${status}]:`, e.message);
      return res.status(status).render("404", {
        title: status === 404 ? "File Not Found" : "Storage Error",
      });
    }
  }

  // Local disk path (materials uploaded without R2 configured).
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
    metaTitle:     "Zambia Past Papers — Grade 7, Grade 9 & Grade 12 | Student OS",
    metaDescription:
      "Free Zambia past examination papers for Grade 7, Grade 9 and Grade 12 — " +
      "Mathematics, English, Science and other subjects, updated regularly.",
    canonicalUrl:  `${SITE_URL}/papers`, // filters are excluded — avoids duplicate-content URLs
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
  res.render("subjects", {
    title: "Subjects",
    metaTitle: "Subjects — Zambia Mathematics, English & More Past Papers | Student OS",
    metaDescription:
      "Explore all subjects available on Student OS Zambia, including Mathematics " +
      "past papers, English past papers and other subjects for Grade 7, Grade 9 " +
      "and Grade 12.",
    canonicalUrl: `${SITE_URL}/subjects`,
    subjects: data.subjects,
  });
});

// ── Exam Information ─────────────────────────────────────────────────────────
router.get("/exams", (req, res) => {
  res.render("exams", {
    title:    "Exam Information",
    metaTitle: "Zambia Exam Information — ECZ Dates & Notices | Student OS",
    metaDescription:
      "ECZ exam dates, registration information, rules and notices for Grade 7, " +
      "Grade 9 and Grade 12 students in Zambia.",
    canonicalUrl: `${SITE_URL}/exams`,
    examInfo: examStore.published(),
  });
});

// ── Resources ────────────────────────────────────────────────────────────────
router.get("/resources", (req, res) => {
  const filtered = matStore.filter({});
  res.render("materials", {
    title:         "Resources",
    metaTitle:     "Study Resources Zambia — Notes & Revision Guides | Student OS",
    metaDescription:
      "Free study guides, notes and revision resources for Zambian students in " +
      "Grade 7, Grade 9 and Grade 12, covering Mathematics, English and other " +
      "subjects.",
    canonicalUrl:  `${SITE_URL}/resources`,
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
  res.render("contact", {
    title: "Contact",
    metaTitle: "About & Contact — Student OS Zambia",
    metaDescription:
      "Learn about Student OS, a Zambian student platform for past papers and " +
      "study resources, and get in touch via WhatsApp, phone or email.",
    canonicalUrl: `${SITE_URL}/contact`,
  });
});

// ── Announcements (student-facing) ───────────────────────────────────────────
router.get("/announcements", (req, res) => {
  res.render("announcements", {
    title:         "Announcements",
    metaTitle:     "Announcements — Student OS Zambia",
    metaDescription:
      "Latest notices and updates from Student OS, the Zambian student platform " +
      "for past papers and study resources.",
    canonicalUrl:  `${SITE_URL}/announcements`,
    announcements: announceStore.published(),
  });
});

// ── Sitemap ───────────────────────────────────────────────────────────────────
// Dynamic: rebuilt from live data on every request, so newly-added grades/
// subjects/papers show up automatically. Intentionally excludes everything
// under /admin (login, dashboard, etc.) — those are also blocked in
// robots.txt and never worth showing to Google.
// Escapes the five XML special characters. Subject names such as
// "Design & Technology" would otherwise produce invalid XML in <loc>.
function xmlEscape(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Returns YYYY-MM-DD, or undefined if the date is missing/invalid
// (new Date(bad).toISOString() throws a RangeError, which would 500 the sitemap).
function safeLastmod(value) {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

router.get("/sitemap.xml", (req, res) => {
  const urls = [];
  const addUrl = (loc, opts = {}) => {
    urls.push({ loc: `${SITE_URL}${loc}`, ...opts });
  };

  // Core public pages
  addUrl("/",             { changefreq: "daily",   priority: "1.0" });
  addUrl("/papers",       { changefreq: "daily",   priority: "0.9" });
  addUrl("/subjects",     { changefreq: "weekly",  priority: "0.7" });
  addUrl("/materials",    { changefreq: "daily",   priority: "0.8" });
  addUrl("/resources",    { changefreq: "weekly",  priority: "0.7" });
  addUrl("/exams",        { changefreq: "weekly",  priority: "0.6" });
  addUrl("/announcements",{ changefreq: "weekly",  priority: "0.5" });
  addUrl("/contact",      { changefreq: "monthly", priority: "0.4" });

  const allMaterials = matStore.all().filter(m => m.published);

  // Grade pages + grade/subject pages, built the same way the /grade routes
  // group real content, so the sitemap only lists subject pages that
  // actually have published material on them.
  data.grades.forEach(gradeDef => {
    const gradeId   = gradeDef.id.replace("grade-", "");
    const gradeName = gradeDef.name;
    addUrl(`/grade/${gradeId}`, { changefreq: "weekly", priority: "0.8" });

    const subjectsForGrade = new Set(
      allMaterials
        .filter(m => m.grade === gradeName || m.grade === "All Grades")
        .map(m => (m.subject && m.subject.trim()) || "General")
    );
    subjectsForGrade.forEach(subject => {
      addUrl(`/grade/${gradeId}/${encodeURIComponent(subject)}`, {
        changefreq: "weekly",
        priority:   "0.7",
      });
    });
  });

  // Individual past-paper / material view pages — these are the actual
  // content pages people search for by paper name.
  allMaterials.forEach(m => {
    addUrl(`/materials/${m.id}/view`, {
      changefreq: "monthly",
      priority:   "0.6",
      lastmod:    safeLastmod(m.uploadDate),
    });
  });

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u =>
      `  <url>\n` +
      `    <loc>${xmlEscape(u.loc)}</loc>\n` +
      (u.lastmod    ? `    <lastmod>${u.lastmod}</lastmod>\n`       : "") +
      (u.changefreq ? `    <changefreq>${u.changefreq}</changefreq>\n` : "") +
      (u.priority   ? `    <priority>${u.priority}</priority>\n`    : "") +
      `  </url>\n`
    ).join("") +
    `</urlset>\n`;

  res.set("Content-Type", "application/xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.status(200).send(xml);
});

module.exports = router;
