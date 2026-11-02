/* ==========================================================
   ARCSLAB — main.js
   ----------------------------------------------------------
   What this file does, in plain words:
   1. Reads the four CSV files in the "data/" folder.
   2. Turns each row into a nice "card" on the page.
   3. Handles small things: the phone menu, the student
      filter buttons, highlighting the current menu item,
      and the fade-in animation.

   You normally do NOT need to edit this file.
   To change the website content, edit the CSV files.
   ========================================================== */

/* ----------------------------------------------------------
   SETTINGS — the only part you might want to change
   ---------------------------------------------------------- */
const SETTINGS = {
  files: {
    team:       "data/team.csv",
    projects:   "data/projects.csv",
    facilities: "data/facilities.csv",
    events:     "data/events.csv",
  },
  // Pictures used when a CSV row has no image
  defaultPersonPhoto:   "assets/images/people/placeholder-person.svg",
  defaultProjectImage:  "assets/images/projects/placeholder-project.svg",
  defaultFacilityImage: "assets/images/facilities/placeholder-facility.svg",
  // Separator used inside a cell for lists (e.g. keywords)
  listSeparator: ";",
};

/* Readable names for the "category" column of team.csv */
const CATEGORY_LABELS = {
  faculty: "Faculty",
  postdoc: "Postdoctoral Researcher",
  phd:     "PhD Student",
  msc:     "MSc Student",
  bsc:     "BSc Student",
  alumni:  "Alumni",
};

/* Academic / social profile links shown under each person.
   "column" = the column name in team.csv, "label" = text on the button.
   Leave a cell empty in the CSV and that button is simply not shown. */
const PROFILE_LINKS = [
  { column: "scholar",      label: "Scholar",      icon: "scholar" },
  { column: "scopus",       label: "Scopus",       icon: "scopus" },
  { column: "orcid",        label: "ORCID",        icon: "orcid" },
  { column: "researchgate", label: "ResearchGate", icon: "rg" },
  { column: "linkedin",     label: "LinkedIn",     icon: "linkedin" },
  { column: "github",       label: "GitHub",       icon: "github" },
  { column: "website",      label: "Website",      icon: "web" },
];

/* Tiny inline icons (simple shapes, no external files needed) */
const ICONS = {
  scholar:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 1 9l11 6 9-4.9V17h2V9z"/><path d="M5 13.2V17c0 1.7 3.1 3 7 3s7-1.3 7-3v-3.8l-7 3.8z"/></svg>',
  scopus:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M17 6.5c-1.2-1-2.8-1.5-4.5-1.5C9.5 5 7 6.8 7 9c0 5 10 3 10 8 0 2.2-2.5 4-5.5 4-1.9 0-3.6-.6-4.8-1.7"/></svg>',
  orcid:    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="currentColor"/><path fill="#fff" d="M7.5 9.5h1.6V17H7.5zm.8-3a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM11 9.5h3c2.3 0 3.8 1.5 3.8 3.75S16.3 17 14 17h-3zm1.6 1.4v4.7H14c1.4 0 2.2-.9 2.2-2.35S15.4 10.9 14 10.9z"/></svg>',
  rg:       '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="2" width="20" height="20" rx="3"/><text x="12" y="16.5" font-size="10" font-family="Arial" font-weight="700" text-anchor="middle" fill="#fff">RG</text></svg>',
  linkedin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3zM9.5 9.5h3.8v1.6h.05c.53-1 1.83-2 3.77-2 4 0 4.78 2.6 4.78 6V21h-4v-5.2c0-1.25 0-2.85-1.75-2.85S14 14.3 14 15.7V21h-4z"/></svg>',
  github:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5A10.5 10.5 0 0 0 8.7 22c.5.1.7-.2.7-.5v-1.9c-2.9.6-3.5-1.3-3.5-1.3-.5-1.2-1.2-1.5-1.2-1.5-.9-.7.1-.6.1-.6 1 .1 1.6 1.1 1.6 1.1.9 1.6 2.5 1.1 3.1.9.1-.7.4-1.1.7-1.4-2.3-.3-4.8-1.2-4.8-5.2 0-1.1.4-2 1.1-2.8-.1-.3-.5-1.4.1-2.8 0 0 .9-.3 2.9 1.1a10 10 0 0 1 5.3 0c2-1.4 2.9-1.1 2.9-1.1.6 1.4.2 2.5.1 2.8.7.8 1.1 1.7 1.1 2.8 0 4-2.5 4.9-4.8 5.2.4.3.7 1 .7 2v3c0 .3.2.6.7.5A10.5 10.5 0 0 0 12 1.5z"/></svg>',
  web:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c2.6 2.6 4 6 4 9.5s-1.4 6.9-4 9.5c-2.6-2.6-4-6-4-9.5s1.4-6.9 4-9.5z"/></svg>',
  mail:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="m3 6 9 7 9-7"/></svg>',
};

/* ==========================================================
   PART 1 — CSV READER
   Reads a CSV text and returns a list of objects, e.g.
   [{name: "Ali", category: "msc", ...}, ...]
   Supports commas and line breaks inside "quoted text".
   ========================================================== */
function parseCSV(text) {
  // Remove an invisible "BOM" character that Excel sometimes adds
  text = text.replace(/^﻿/, "");

  const rows = [];
  let row = [], field = "", inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }   // "" inside quotes = one "
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }

  // First row = column names; skip empty lines and lines starting with #
  const header = rows.shift().map(h => h.trim().toLowerCase());
  return rows
    .filter(r => r.some(cell => cell.trim() !== "") && !r[0].trim().startsWith("#"))
    .map(r => {
      const obj = {};
      header.forEach((h, idx) => { obj[h] = (r[idx] || "").trim(); });
      return obj;
    });
}

/* Downloads one CSV file and returns its rows */
async function loadCSV(path) {
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
  return parseCSV(await response.text());
}

/* ==========================================================
   PART 2 — SMALL HELPERS
   ========================================================== */

/* Makes text safe to put inside HTML (prevents broken layout) */
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* Splits "a; b; c" into ["a","b","c"] */
function splitList(value) {
  return (value || "").split(SETTINGS.listSeparator).map(s => s.trim()).filter(Boolean);
}

/* Builds the row of profile buttons (Scholar, Scopus, ORCID, ...) */
function profileButtons(person) {
  const links = PROFILE_LINKS
    .filter(p => person[p.column])
    .map(p => `<a href="${esc(person[p.column])}" target="_blank" rel="noopener" title="${p.label}">${ICONS[p.icon]}${p.label}</a>`);
  return links.length ? `<div class="socials">${links.join("")}</div>` : "";
}

/* Shows a friendly message inside a section */
function showMessage(containerId, message) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = `<p class="empty">${esc(message)}</p>`;
}

/* Turns "2026-12-05" into a Date object */
function toDate(str) {
  const [y, m, d] = (str || "").split("-").map(Number);
  return y ? new Date(y, (m || 1) - 1, d || 1) : null;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/* ==========================================================
   PART 3 — RENDERING EACH SECTION
   ========================================================== */

/* ---------- PEOPLE (team.csv) ---------- */
function renderPeople(team) {
  const faculty  = team.filter(p => p.category.toLowerCase() === "faculty");
  const students = team.filter(p => p.category.toLowerCase() !== "faculty");

  // Large cards for faculty / founders
  document.getElementById("faculty-list").innerHTML = faculty.map(p => `
    <article class="card faculty-card reveal">
      <div class="photo">
        <img src="${esc(p.photo || SETTINGS.defaultPersonPhoto)}" alt="Photo of ${esc(p.name)}" loading="lazy"
             onerror="this.src='${SETTINGS.defaultPersonPhoto}'">
      </div>
      <div class="body">
        ${p.role ? `<span class="role-tag">${esc(p.role)}</span>` : ""}
        <h3>${esc(p.name)}</h3>
        <p class="person-title">${esc(p.title)}</p>
        ${p.bio ? `<p class="person-bio">${esc(p.bio)}</p>` : ""}
        ${p.interests ? `<div class="chips" style="margin-bottom:14px">${splitList(p.interests).map(i => `<span class="chip olive">${esc(i)}</span>`).join("")}</div>` : ""}
        ${p.email ? `<a class="person-email" href="mailto:${esc(p.email)}">✉ ${esc(p.email)}</a>` : ""}
        ${profileButtons(p)}
      </div>
    </article>`).join("");

  // Small cards for students and alumni
  const list = document.getElementById("student-list");
  if (!students.length) { showMessage("student-list", "Student profiles coming soon."); return; }

  list.innerHTML = students.map(p => {
    const cat = p.category.toLowerCase();
    return `
    <article class="card student-card reveal" data-category="${esc(cat)}">
      <img src="${esc(p.photo || SETTINGS.defaultPersonPhoto)}" alt="Photo of ${esc(p.name)}" loading="lazy"
           onerror="this.src='${SETTINGS.defaultPersonPhoto}'">
      <h4>${esc(p.name)}</h4>
      <p class="person-title">${esc(p.title || CATEGORY_LABELS[cat] || cat)}</p>
      ${p.research_topic ? `<p class="topic">${esc(p.research_topic)}</p>` : ""}
      ${profileButtons(p)}
    </article>`;
  }).join("");

  // Filter buttons (All / PhD / MSc / BSc / Alumni)
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const f = btn.dataset.filter;
      list.querySelectorAll(".student-card").forEach(card => {
        card.style.display = (f === "all" || card.dataset.category === f) ? "" : "none";
      });
    });
  });

  // Hide filter buttons that have no students
  document.querySelectorAll(".filter-btn").forEach(btn => {
    const f = btn.dataset.filter;
    if (f !== "all" && !students.some(s => s.category.toLowerCase() === f)) btn.style.display = "none";
  });

  document.getElementById("stat-people").textContent = team.filter(p => p.category.toLowerCase() !== "alumni").length;
}

/* ---------- PROJECTS (projects.csv) ---------- */
function renderProjects(projects) {
  if (!projects.length) { showMessage("project-list", "Projects will be announced soon."); return; }

  // Order: ongoing first, then planned, then completed
  const order = { ongoing: 0, planned: 1, completed: 2 };
  projects.sort((a, b) => (order[a.status.toLowerCase()] ?? 9) - (order[b.status.toLowerCase()] ?? 9));

  document.getElementById("project-list").innerHTML = projects.map(p => {
    const status = (p.status || "ongoing").toLowerCase();
    const title = p.link
      ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.title)}</a>`
      : esc(p.title);
    return `
    <article class="card project-card reveal">
      <div class="thumb">
        <img src="${esc(p.image || SETTINGS.defaultProjectImage)}" alt="" loading="lazy"
             onerror="this.src='${SETTINGS.defaultProjectImage}'">
      </div>
      <div class="body">
        <span class="status status-${esc(status)}">${esc(status)}</span>
        <h3>${title}</h3>
        <p>${esc(p.summary)}</p>
        ${p.keywords ? `<div class="chips">${splitList(p.keywords).map(k => `<span class="chip">${esc(k)}</span>`).join("")}</div>` : ""}
        <div class="project-meta">
          ${p.student    ? `<div><b>Lead researcher:</b> ${esc(p.student)}</div>` : ""}
          ${p.supervisor ? `<div><b>Supervisor:</b> ${esc(p.supervisor)}</div>` : ""}
          ${p.start      ? `<div><b>Started:</b> ${esc(p.start)}</div>` : ""}
        </div>
      </div>
    </article>`;
  }).join("");

  document.getElementById("stat-projects").textContent =
    projects.filter(p => (p.status || "").toLowerCase() === "ongoing").length;
}

/* ---------- FACILITIES (facilities.csv) ---------- */
function renderFacilities(items) {
  if (!items.length) { showMessage("facility-list", "Facility list coming soon."); return; }

  document.getElementById("facility-list").innerHTML = items.map(f => `
    <article class="card facility-card reveal">
      <div class="thumb">
        <img src="${esc(f.image || SETTINGS.defaultFacilityImage)}" alt="" loading="lazy"
             onerror="this.src='${SETTINGS.defaultFacilityImage}'">
      </div>
      <div class="body">
        ${f.category ? `<span class="category">${esc(f.category)}</span>` : ""}
        <h3>${esc(f.name)}</h3>
        <p>${esc(f.description)}</p>
      </div>
    </article>`).join("");

  document.getElementById("stat-facilities").textContent = items.length;
}

/* ---------- EVENTS (events.csv) ----------
   Events are split automatically into "Upcoming" and "Past"
   using today's date — no need to move rows yourself.       */
function renderEvents(events) {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const withDates = events
    .map(e => ({ ...e, _start: toDate(e.date), _end: toDate(e.end_date) || toDate(e.date) }))
    .filter(e => e._start);

  const upcoming = withDates.filter(e => e._end >= today).sort((a, b) => a._start - b._start);
  const past     = withDates.filter(e => e._end <  today).sort((a, b) => b._start - a._start).slice(0, 6);

  const card = e => {
    const range = e.end_date && e.end_date !== e.date
      ? ` – ${e._end.getDate()} ${MONTHS[e._end.getMonth()]} ${e._end.getFullYear()}` : ` ${e._start.getFullYear()}`;
    const title = e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : esc(e.title);
    return `
    <article class="card event reveal">
      <div class="event-date">
        <span class="d">${e._start.getDate()}</span>
        <span class="m">${MONTHS[e._start.getMonth()]} ${String(e._start.getFullYear()).slice(2)}</span>
      </div>
      <div>
        <h3>${title}</h3>
        ${e.description ? `<p>${esc(e.description)}</p>` : ""}
        <div class="where">📍 ${esc(e.location || "TBA")} · ${e._start.getDate()} ${MONTHS[e._start.getMonth()]}${range}</div>
      </div>
      ${e.type ? `<span class="event-type">${esc(e.type)}</span>` : ""}
    </article>`;
  };

  document.getElementById("events-upcoming").innerHTML =
    upcoming.length ? upcoming.map(card).join("") : `<p class="empty">No upcoming events at the moment.</p>`;
  document.getElementById("events-past").innerHTML =
    past.length ? past.map(card).join("") : `<p class="empty">No past events yet.</p>`;
}

/* ==========================================================
   PART 4 — PAGE BEHAVIOUR (menu, highlighting, animation)
   ========================================================== */
function setupNavigation() {
  const toggle = document.querySelector(".nav-toggle");
  const links  = document.querySelector(".nav-links");

  // Phone menu open / close
  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open);
  });
  links.querySelectorAll("a").forEach(a => a.addEventListener("click", () => links.classList.remove("open")));

  // Highlight the menu item of the section currently on screen
  const sections = document.querySelectorAll("main section[id]");
  const spy = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        links.querySelectorAll("a").forEach(a =>
          a.classList.toggle("active", a.getAttribute("href") === "#" + entry.target.id));
      }
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  sections.forEach(s => spy.observe(s));
}

/* Gentle fade-in of cards as you scroll */
function setupReveal() {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll(".reveal:not(.visible)").forEach(el => io.observe(el));
}

/* ==========================================================
   PART 5 — START EVERYTHING WHEN THE PAGE LOADS
   ========================================================== */
document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("year").textContent = new Date().getFullYear();
  setupNavigation();

  // Each section loads on its own, so one broken CSV doesn't break the others
  const jobs = [
    { file: SETTINGS.files.team,       render: renderPeople,     box: "student-list"   },
    { file: SETTINGS.files.projects,   render: renderProjects,   box: "project-list"   },
    { file: SETTINGS.files.facilities, render: renderFacilities, box: "facility-list"  },
    { file: SETTINGS.files.events,     render: renderEvents,     box: "events-upcoming"},
  ];

  await Promise.all(jobs.map(async job => {
    try {
      job.render(await loadCSV(job.file));
    } catch (err) {
      console.error(err);
      const hint = location.protocol === "file:"
        ? "Data cannot load when the page is opened directly from disk. Use GitHub Pages or a local server (see README)."
        : `Could not load ${job.file}.`;
      showMessage(job.box, hint);
    }
  }));

  setupReveal();
});
