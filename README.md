# Student OS — v0.2 Demo

A Zambian student platform for past papers, exam information and study resources.
This is still an early demo: layout, navigation and UI, backed by sample data.
No authentication, database, real file uploads, or payments yet.

## What's new in this update
- Homepage is now a simple "What grade are you in?" landing page with two large
  choices: **Grade 7** and **Grade 12**.
- Each grade has its own section page (`/grade/7`, `/grade/12`) with Past Papers,
  Subjects, Notes and Other Study Materials — using demo content, structured so
  real data can be swapped in later.
- Dark theme applied across the public site.
- The Admin link/button has been removed from the public website. The admin
  panel code still exists under `/admin` for now, but is no longer linked from
  the site — it will become a separate project later.

## Stack
- Node.js + Express
- EJS templates (server-rendered HTML)
- Plain CSS + vanilla JS (no framework, no build step)

## Running it locally (Windows-friendly)

```bash
npm install
npm start
```

The server listens on `0.0.0.0`, so it's reachable both on your PC and from
other devices on the same Wi-Fi network:

- On your PC: **http://localhost:3000**
- From your phone (same Wi-Fi): the terminal will print something like
  **http://192.168.x.x:3000** — use that address in your phone's browser.

If the LAN address doesn't show or doesn't work, run `ipconfig` in a Windows
terminal and look for your Wi-Fi adapter's "IPv4 Address".

For auto-reload while developing:

```bash
npm run dev
```

No build step, no database, no extra setup — just `npm install` and `npm start`.

## Project structure

```
student-os/
├── server.js                # Express app entry point (listens on 0.0.0.0)
├── routes/
│   ├── site.js               # Public routes: /, /grade/:gradeId, /papers, /subjects, /exams, /resources
│   └── admin.js               # Admin panel routes (not linked from the public site yet)
├── data/
│   └── sampleData.js         # Placeholder data, including gradeSections (Grade 7 & 12 demo content)
├── views/
│   ├── partials/              # Shared header/footer for public site + admin
│   ├── index.ejs               # Grade-picker landing page
│   ├── grade.ejs                # Grade section page (papers, subjects, notes, materials)
│   ├── admin/                   # Admin panel pages
│   └── *.ejs                     # Other public site pages
└── public/
    ├── css/                     # style.css (dark theme, public site), admin.css (admin panel)
    └── js/                      # main.js (public site), admin.js (admin panel)
```

## Notes
- All data in `data/sampleData.js` is placeholder/sample data.
- `gradeSections["7"]` and `gradeSections["12"]` are structured per grade
  (`pastPapers`, `subjects`, `notes`, `materials`) so real content can replace
  the demo entries later without changing `views/grade.ejs`.
- Add/Edit/Delete buttons in the admin panel are UI-only for now.
