/**
 * config/seo.js
 *
 * Central place for SEO-related constants so server.js and routes/site.js
 * don't drift out of sync. Nothing here changes any existing behaviour —
 * it only feeds <title>/<meta>/canonical tags and the sitemap.
 */

// The live production domain. Can be overridden with an env var if the
// domain ever changes, without needing another code edit.
const SITE_URL = (process.env.SITE_URL || "https://new-studentos-angel.onrender.com")
  .replace(/\/+$/, ""); // strip any trailing slash

const SITE_NAME = "Student OS";

const DEFAULT_META_DESCRIPTION =
  "Student OS Zambia — free Grade 7, Grade 9 and Grade 12 past papers, " +
  "Mathematics, English and other subject resources, exam information " +
  "and revision notes for Zambian students.";

module.exports = { SITE_URL, SITE_NAME, DEFAULT_META_DESCRIPTION };
