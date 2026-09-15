/**
 * Student OS — Content Store
 *
 * On local dev: reads/writes JSON files to disk (data/*.json) so content
 * persists across restarts.
 *
 * On Vercel (read-only filesystem): falls back to in-memory storage
 * automatically. Content will reset on each cold start, but the app
 * will not crash. Use a real database (e.g. Vercel KV, Supabase, MongoDB
 * Atlas) when you need persistence in production.
 */

const fs   = require("fs");
const path = require("path");

// ── Detect whether the filesystem is writable ───────────────────────────────
const DATA_DIR       = path.join(__dirname);
const IS_WRITABLE    = (() => {
  try {
    const probe = path.join(DATA_DIR, ".write-test");
    fs.writeFileSync(probe, "1", "utf8");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
})();

// In-memory fallback (used on Vercel)
const _mem = { materials: [], examInfo: [], announcements: [] };

// ── File paths ──────────────────────────────────────────────────────────────
const MATERIALS_FILE = path.join(DATA_DIR, "materials.json");
const EXAM_INFO_FILE = path.join(DATA_DIR, "examInfo.json");
const ANNOUNCE_FILE  = path.join(DATA_DIR, "announcements.json");

// ── Low-level helpers ───────────────────────────────────────────────────────
function readJSON(filePath, memKey) {
  if (!IS_WRITABLE) return _mem[memKey];
  try {
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
}

function writeJSON(filePath, memKey, data) {
  if (!IS_WRITABLE) {
    _mem[memKey] = data;
    return;
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function nextId(arr) {
  if (!arr.length) return 1;
  return Math.max(...arr.map(x => x.id || 0)) + 1;
}

function nowISO() {
  return new Date().toISOString();
}

// ── Learning Materials (PDFs) ───────────────────────────────────────────────
const materials = {
  all() {
    return readJSON(MATERIALS_FILE, "materials");
  },

  findById(id) {
    return this.all().find(m => m.id === parseInt(id, 10));
  },

  add(fields) {
    const list = this.all();
    const item = {
      id:           nextId(list),
      title:        fields.title        || "",
      description:  fields.description  || "",
      grade:        fields.grade        || "",
      subject:      fields.subject      || "",
      topic:        fields.topic        || "",
      term:         fields.term         || "",
      year:         fields.year         || "",
      materialType: fields.materialType || "",
      fileName:     fields.fileName     || "",
      fileSize:     fields.fileSize     || "",
      filePath:     fields.filePath     || "",
      uploadDate:   nowISO(),
      published:    true,
      views:        0,
      downloads:    0,
    };
    list.push(item);
    writeJSON(MATERIALS_FILE, "materials", list);
    return item;
  },

  update(id, fields) {
    const list = this.all();
    const idx  = list.findIndex(m => m.id === parseInt(id, 10));
    if (idx === -1) return null;
    const allowed = ["title","description","grade","subject","topic","term","year","materialType","published"];
    allowed.forEach(k => { if (fields[k] !== undefined) list[idx][k] = fields[k]; });
    writeJSON(MATERIALS_FILE, "materials", list);
    return list[idx];
  },

  remove(id) {
    let list = this.all();
    const item = list.find(m => m.id === parseInt(id, 10));
    if (!item) return null;
    list = list.filter(m => m.id !== parseInt(id, 10));
    writeJSON(MATERIALS_FILE, "materials", list);
    return item;
  },

  incrementViews(id) {
    const list = this.all();
    const idx  = list.findIndex(m => m.id === parseInt(id, 10));
    if (idx !== -1) { list[idx].views = (list[idx].views || 0) + 1; writeJSON(MATERIALS_FILE, "materials", list); }
  },

  incrementDownloads(id) {
    const list = this.all();
    const idx  = list.findIndex(m => m.id === parseInt(id, 10));
    if (idx !== -1) { list[idx].downloads = (list[idx].downloads || 0) + 1; writeJSON(MATERIALS_FILE, "materials", list); }
  },

  filter({ grade, subject, materialType, year, search } = {}) {
    let list = this.all().filter(m => m.published);
    if (grade)        list = list.filter(m => m.grade === grade);
    if (subject)      list = list.filter(m => m.subject === subject);
    if (materialType) list = list.filter(m => m.materialType === materialType);
    if (year)         list = list.filter(m => m.year === year);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.subject.toLowerCase().includes(q) ||
        m.topic.toLowerCase().includes(q)
      );
    }
    return list;
  },
};

// ── Exam Information ────────────────────────────────────────────────────────
const examInfo = {
  all() {
    return readJSON(EXAM_INFO_FILE, "examInfo");
  },

  findById(id) {
    return this.all().find(e => e.id === parseInt(id, 10));
  },

  add(fields) {
    const list = this.all();
    const item = {
      id:        nextId(list),
      title:     fields.title     || "",
      category:  fields.category  || "Exam Information",
      grade:     fields.grade     || "All",
      content:   fields.content   || "",
      published: fields.published === "true" || fields.published === true,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    list.push(item);
    writeJSON(EXAM_INFO_FILE, "examInfo", list);
    return item;
  },

  update(id, fields) {
    const list = this.all();
    const idx  = list.findIndex(e => e.id === parseInt(id, 10));
    if (idx === -1) return null;
    const allowed = ["title","category","grade","content","published"];
    allowed.forEach(k => { if (fields[k] !== undefined) list[idx][k] = fields[k]; });
    if (fields.published !== undefined) list[idx].published = fields.published === "true" || fields.published === true;
    list[idx].updatedAt = nowISO();
    writeJSON(EXAM_INFO_FILE, "examInfo", list);
    return list[idx];
  },

  remove(id) {
    let list = this.all();
    const item = list.find(e => e.id === parseInt(id, 10));
    if (!item) return null;
    list = list.filter(e => e.id !== parseInt(id, 10));
    writeJSON(EXAM_INFO_FILE, "examInfo", list);
    return item;
  },

  published() {
    return this.all().filter(e => e.published);
  },
};

// ── Announcements ────────────────────────────────────────────────────────────
const announcements = {
  all() {
    return readJSON(ANNOUNCE_FILE, "announcements");
  },

  findById(id) {
    return this.all().find(a => a.id === parseInt(id, 10));
  },

  add(fields) {
    const list = this.all();
    const item = {
      id:        nextId(list),
      title:     fields.title     || "",
      body:      fields.body      || "",
      grade:     fields.grade     || "All",
      published: fields.published === "true" || fields.published === true,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    list.push(item);
    writeJSON(ANNOUNCE_FILE, "announcements", list);
    return item;
  },

  update(id, fields) {
    const list = this.all();
    const idx  = list.findIndex(a => a.id === parseInt(id, 10));
    if (idx === -1) return null;
    const allowed = ["title","body","grade","published"];
    allowed.forEach(k => { if (fields[k] !== undefined) list[idx][k] = fields[k]; });
    if (fields.published !== undefined) list[idx].published = fields.published === "true" || fields.published === true;
    list[idx].updatedAt = nowISO();
    writeJSON(ANNOUNCE_FILE, "announcements", list);
    return item;
  },

  remove(id) {
    let list = this.all();
    const item = list.find(a => a.id === parseInt(id, 10));
    if (!item) return null;
    list = list.filter(a => a.id !== parseInt(id, 10));
    writeJSON(ANNOUNCE_FILE, "announcements", list);
    return item;
  },

  published() {
    return this.all().filter(a => a.published);
  },
};

module.exports = { materials, examInfo, announcements };
