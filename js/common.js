/* ==========================================================
   common.js — small helpers shared by every page
   ----------------------------------------------------------
   • reading CSV files            ARC.loadCSV("data/team.csv")
   • safe text for HTML           ARC.esc(text)
   • lists inside a cell          ARC.list("a; b; c")
   • profile-link buttons         ARC.socials(person)
   • photos with fallback         ARC.photo(src, alt)
   • author names → lab members   ARC.memberIndex(team)
   • phone menu, footer year, fade-in animation
   You do not need to edit this file.
   ========================================================== */
window.ARC = (function () {

  /* ---------- CSV reader (handles "quoted, text" and line breaks) ---------- */
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    const rows = []; let row = [], field = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') q = false;
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    const head = rows.shift().map(h => h.trim().toLowerCase());
    return rows
      .filter(r => r.some(x => x.trim() !== "") && !r[0].trim().startsWith("#"))
      .map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
  }
  async function loadCSV(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
    return parseCSV(await res.text());
  }
  async function loadJSON(path) {
    try { const r = await fetch(path, { cache: "no-cache" }); return r.ok ? r.json() : {}; } catch (e) { return {}; }
  }

  const esc = v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const list = v => (v || "").split(";").map(s => s.trim()).filter(Boolean);
  const failText = file => location.protocol === "file:"
    ? "Data cannot load when the page is opened directly from disk. Use GitHub Pages or a local server (see README)."
    : `Could not load ${file}.`;

  /* ---------- photos: photo.jpg → photo.svg in the same folder → default ---------- */
  const DEFAULT_PHOTO = "assets/images/people/placeholder-person.svg";
  function photo(src, alt, cls = "") {
    src = src || DEFAULT_PHOTO;
    return `<img class="${cls}" src="${esc(src)}" alt="${esc(alt || "")}" loading="lazy" onerror="ARC.photoFallback(this)">`;
  }
  function photoFallback(img) {
    const s = img.getAttribute("src") || "";
    if (/\.(jpe?g|png|webp)$/i.test(s) && !img.dataset.tried) { img.dataset.tried = 1; img.src = s.replace(/\.(jpe?g|png|webp)$/i, ".svg"); }
    else if (!s.endsWith(DEFAULT_PHOTO)) { img.onerror = null; img.src = DEFAULT_PHOTO; }
  }

  /* ---------- academic / social profile buttons ---------- */
  const LINKS = [
    ["scholar", "Scholar", '<path d="M12 3 1 9l11 6 9-4.9V17h2V9z"/><path d="M5 13.2V17c0 1.7 3.1 3 7 3s7-1.3 7-3v-3.8l-7 3.8z"/>'],
    ["scopus", "Scopus", '<path fill="none" stroke="currentColor" stroke-width="2.4" d="M17 6.5c-1.2-1-2.8-1.5-4.5-1.5C9.5 5 7 6.8 7 9c0 5 10 3 10 8 0 2.2-2.5 4-5.5 4-1.9 0-3.6-.6-4.8-1.7"/>'],
    ["orcid", "ORCID", '<circle cx="12" cy="12" r="11"/><path fill="#fff" d="M7.5 9.5h1.6V17H7.5zm.8-3a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM11 9.5h3c2.3 0 3.8 1.5 3.8 3.75S16.3 17 14 17h-3zm1.6 1.4v4.7H14c1.4 0 2.2-.9 2.2-2.35S15.4 10.9 14 10.9z"/>'],
    ["researchgate", "ResearchGate", '<rect x="2" y="2" width="20" height="20" rx="3"/><text x="12" y="16.5" font-size="10" font-family="Arial" font-weight="700" text-anchor="middle" fill="#fff">RG</text>'],
    ["linkedin", "LinkedIn", '<path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3zM9.5 9.5h3.8v1.6c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.2c0-1.3 0-2.9-1.8-2.9S14 14.3 14 15.7V21h-4z"/>'],
    ["github", "GitHub", '<path d="M12 1.5A10.5 10.5 0 0 0 8.7 22c.5.1.7-.2.7-.5v-1.9c-2.9.6-3.5-1.3-3.5-1.3-.5-1.2-1.2-1.5-1.2-1.5-.9-.7.1-.6.1-.6 1 .1 1.6 1.1 1.6 1.1.9 1.6 2.5 1.1 3.1.9.1-.7.4-1.1.7-1.4-2.3-.3-4.8-1.2-4.8-5.2 0-1.1.4-2 1.1-2.8-.1-.3-.5-1.4.1-2.8 0 0 .9-.3 2.9 1.1a10 10 0 0 1 5.3 0c2-1.4 2.9-1.1 2.9-1.1.6 1.4.2 2.5.1 2.8.7.8 1.1 1.7 1.1 2.8 0 4-2.5 4.9-4.8 5.2.4.3.7 1 .7 2v3c0 .3.2.6.7.5A10.5 10.5 0 0 0 12 1.5z"/>'],
    ["aparat", "Aparat videos", '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="m10 8 6 4-6 4z"/>'],
    ["website", "Website", '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" d="M2.5 12h19M12 2.5c2.6 2.6 4 6 4 9.5s-1.4 6.9-4 9.5c-2.6-2.6-4-6-4-9.5s1.4-6.9 4-9.5z"/>'],
    ["cv", "CV (PDF)", '<path fill="none" stroke="currentColor" stroke-width="2" d="M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h6"/>'],
  ];
  function socials(p) {
    const a = LINKS.filter(([c]) => p[c]).map(([c, label, svg]) =>
      `<a href="${esc(p[c])}" target="_blank" rel="noopener" title="${label}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${svg}</svg>${label}</a>`);
    return a.length ? `<div class="socials">${a.join("")}</div>` : "";
  }

  /* ---------- matching author names ("Goharimanesh M.") to lab members ----------
     team.csv column "pub_names" lists how a member appears in papers, e.g.
     "Goharimanesh M.; Gohari-Manesh M."  — surname + first initial is compared. */
  function nameKey(s) {
    s = (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").trim();
    let surname, first;
    if (s.includes(",")) { [surname, first] = s.split(",", 2); }
    else { const p = s.split(/\s+/); const initials = p.filter(x => /^([A-Z]\.?-?)+$/.test(x)); surname = p.filter(x => !initials.includes(x)).join(" "); first = initials.join(""); if (!surname) { surname = p.pop(); first = p.join(" "); } }
    return (surname || "").toLowerCase().replace(/[^a-z]/g, "") + "|" + ((first || "").trim()[0] || "").toLowerCase();
  }
  function memberIndex(team) {
    const idx = {};
    team.forEach(m => list(m.pub_names).forEach(n => { idx[nameKey(n)] = m; }));
    return idx;
  }
  const profileURL = id => `profile.html?id=${encodeURIComponent(id)}`;

  /* ---------- page chrome ---------- */
  function setupChrome() {
    const y = document.getElementById("year"); if (y) y.textContent = new Date().getFullYear();
    const toggle = document.querySelector(".nav-toggle"), links = document.querySelector(".nav-links");
    if (toggle && links) {
      toggle.addEventListener("click", () => toggle.setAttribute("aria-expanded", links.classList.toggle("open")));
      links.querySelectorAll("a").forEach(a => a.addEventListener("click", () => links.classList.remove("open")));
    }
  }
  function reveal() {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); } }), { threshold: 0.08 });
    document.querySelectorAll(".reveal:not(.visible)").forEach(el => io.observe(el));
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) { const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return ok; }
  }

  return { parseCSV, loadCSV, loadJSON, esc, list, failText, photo, photoFallback, socials, nameKey, memberIndex, profileURL, setupChrome, reveal, copy, DEFAULT_PHOTO };
})();
