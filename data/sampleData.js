// Student OS — Data Store
// All content is managed through the Admin Panel.
// Add past papers, resources, subjects and exam info via /admin/content

const grades = [
  { id: "grade-7",  name: "Grade 7"  },
  { id: "grade-9",  name: "Grade 9"  },
  { id: "grade-12", name: "Grade 12" },
];

// Subjects are added via Admin → Content
const subjects = [];

// Past papers are added via Admin → Content
const papers = [];

// Years and paper types used in filter dropdowns
const years = [2025, 2024, 2023, 2022, 2021, 2020];
const paperTypes = ["Paper 1", "Paper 2", "Paper 3"];

// Resources (notes, guides, worksheets) added via Admin → Content
const resources = [];

// Exam information added via Admin → Content
const examInfo = [];

// No users yet — will be real registrations
const users = [];

// Stats derived from live data
const stats = {
  users:     users.length,
  papers:    papers.length,
  subjects:  subjects.length,
  resources: resources.length,
};

// Grade sections — populated from papers/resources added via Admin
// Each grade entry is built dynamically from the uploaded content
const gradeSections = {
  "7": {
    grade:      "Grade 7",
    tagline:    "Primary School Leaving Examinations",
    pastPapers: [],
    subjects:   [],
    notes:      [],
    materials:  [],
  },
  "9": {
    grade:      "Grade 9",
    tagline:    "Junior Secondary Examinations",
    pastPapers: [],
    subjects:   [],
    notes:      [],
    materials:  [],
  },
  "12": {
    grade:      "Grade 12",
    tagline:    "School Certificate Examinations",
    pastPapers: [],
    subjects:   [],
    notes:      [],
    materials:  [],
  },
};

module.exports = {
  grades,
  subjects,
  papers,
  years,
  paperTypes,
  resources,
  examInfo,
  users,
  stats,
  gradeSections,
};
