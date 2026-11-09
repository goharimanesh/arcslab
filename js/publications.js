/* ==========================================================
   publications.js — the interactive Publications page
   ----------------------------------------------------------
   Reads data/publications.csv (+ categories, overrides, team)
   and builds: statistics, two charts, "Most cited", search,
   filters, sorting, citation copy (APA/BibTeX), abstracts and
   QR codes. Settings you may change are in CONFIG.
   ========================================================== */
(function () {
  const { loadCSV, loadJSON, esc, list, failText, nameKey, memberIndex, profileURL, setupChrome, copy } = window.ARC;
  const $ = id => document.getElementById(id);

  const CONFIG = {
    me: "masoud-gohari-manesh",      // this person's name is shown in bold
    pageSize: 25,                    // papers shown before "Show more"
    topCited: 5,
    defaultImage: "assets/images/publications/other.svg",
  };
  const TYPE_LABEL = { journal: "Journal article", conference: "Conference paper", book: "Book", chapter: "Book chapter", thesis: "Thesis", other: "Other" };
  const int = v => parseInt(v, 10) || 0;

  let PUBS = [], CATS = {}, MEMBERS = {}, TEAM = [], META = {};
  const state = { q: "", cat: "", year: "", type: "", sort: "new", scope: "", shown: CONFIG.pageSize };

  /* ---------- load everything ---------- */
  async function load() {
    const [pubs, cats, ovr, team, meta] = await Promise.all([
      loadCSV("data/publications.csv"),
      loadCSV("data/publication_categories.csv").catch(() => []),
      loadCSV("data/publication_overrides.csv").catch(() => []),
      loadCSV("data/team.csv").catch(() => []),
      loadJSON("data/publications_meta.json"),
    ]);
    cats.forEach(c => CATS[c.id] = c);
    TEAM = team; MEMBERS = memberIndex(team); META = meta || {};
    const O = {}; ovr.forEach(o => { if (o.key) O[o.key.toLowerCase()] = o; });
    PUBS = pubs.map(p => {
      const o = O[(p.doi || "").toLowerCase()] || O[(p.id || "").toLowerCase()] || {};
      return { ...p, category: o.category || p.category || "other", type: o.type || p.type || "other",
               image: o.image || p.image || "", hidden: /^y/i.test(o.hide || ""), cites: int(p.citations), yr: int(p.year) };
    }).filter(p => !p.hidden);
  }

  /* ---------- helpers ---------- */
  const scoped = () => state.scope ? PUBS.filter(p => list(p.lab_authors).includes(state.scope)) : PUBS;
  const hIndex = arr => arr.map(p => p.cites).sort((a, b) => b - a).filter((c, i) => c >= i + 1).length;
  const doiURL = p => p.doi ? "https://doi.org/" + p.doi : (p.link || "");
  const catOf = p => CATS[p.category] || { label: p.category, color: "#5b6573", image: CONFIG.defaultImage };

  function authorsHTML(p) {
    return list(p.authors).map(a => {
      const m = MEMBERS[nameKey(a)];
      if (!m) return esc(a);
      const inner = m.id === CONFIG.me ? `<strong>${esc(a)}</strong>` : esc(a);
      return `<a class="member" href="${profileURL(m.id)}" title="${esc(m.name)} — ARCSLAB">${inner}</a>`;
    }).join(", ");
  }

  /* ---------- citation formats ---------- */
  function apaAuthor(a) {               // "Akbari A.A." → "Akbari, A. A."
    const parts = a.trim().split(/\s+/), ini = parts.filter(x => /^([A-Z]\.?-?)+$/.test(x));
    const sur = parts.filter(x => !ini.includes(x)).join(" ");
    const initials = ini.join("").replace(/\.?([A-Z])/g, " $1.").replace(/\.\./g, ".").trim();
    return initials ? `${sur}, ${initials}` : sur;
  }
  function apa(p) {
    const A = list(p.authors).map(apaAuthor);
    const authors = A.length > 1 ? A.slice(0, -1).join(", ") + ", & " + A[A.length - 1] : (A[0] || "");
    let src = p.venue || "";
    if (p.volume) src += `, ${p.volume}`;
    if (p.issue) src += `(${p.issue})`;
    if (p.pages) src += `, ${p.pages}`;
    return `${authors} (${p.year}). ${p.title}. ${src}.${p.doi ? " https://doi.org/" + p.doi : ""}`.replace(/\.\./g, ".");
  }
  function bibtex(p) {
    const type = { journal: "article", conference: "inproceedings", book: "book", chapter: "incollection", thesis: "phdthesis" }[p.type] || "misc";
    const venueField = { article: "journal", inproceedings: "booktitle", incollection: "booktitle", book: "publisher", phdthesis: "school" }[type] || "howpublished";
    const authors = list(p.authors).map(a => apaAuthor(a)).join(" and ");
    const f = [["title", `{${p.title}}`], ["author", authors], [venueField, p.venue], ["year", p.year], ["volume", p.volume], ["number", p.issue], ["pages", (p.pages || "").replace("–", "--")], ["doi", p.doi]]
      .filter(([, v]) => v).map(([k, v]) => `  ${k} = {${v}}`);
    return `@${type}{${p.id},\n${f.join(",\n")}\n}`;
  }

  /* ---------- header: scope buttons + stats ---------- */
  function renderScope() {
    const faculty = TEAM.filter(m => (m.category || "").toLowerCase() === "faculty");
    $("scope").innerHTML = [`<button class="filter-btn ${state.scope ? "" : "active"}" data-scope="">Whole lab</button>`]
      .concat(faculty.map(m => `<button class="filter-btn ${state.scope === m.id ? "active" : ""}" data-scope="${esc(m.id)}">${esc(m.name)}</button>`)).join("");
  }
  function renderStats() {
    const P = scoped(), total = P.reduce((s, p) => s + p.cites, 0);
    const i10 = P.filter(p => p.cites >= 10).length, years = P.map(p => p.yr).filter(Boolean);
    $("stats").innerHTML = [[P.length, "Publications"], [total.toLocaleString("en"), "Citations"], [hIndex(P), "h-index"], [i10, "i10-index"],
      [years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "–", "Years"]]
      .map(([v, l]) => `<div class="stat-tile"><strong>${v}</strong><span>${l}</span></div>`).join("");
  }

  /* ---------- charts (two single-series bar charts, shared x-axis, hover tooltips) ---------- */
  function barChart(el, data, color, unit) {
    const W = 560, H = 210, m = { l: 34, r: 8, t: 12, b: 26 };
    const years = data.map(d => d[0]), max = Math.max(1, ...data.map(d => d[1]));
    const step = Math.pow(10, Math.floor(Math.log10(max))) * (max / Math.pow(10, Math.floor(Math.log10(max))) > 5 ? 2 : 1);
    const top = Math.ceil(max / step) * step, bw = (W - m.l - m.r) / Math.max(years.length, 1);
    const y = v => m.t + (H - m.t - m.b) * (1 - v / top);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(unit)} per year">`;
    for (let v = 0; v <= top; v += step) svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${m.l - 6}" y="${y(v) + 4}" class="tick" text-anchor="end">${v}</text>`;
    data.forEach(([yr, v], i) => {
      const x = m.l + i * bw, w = Math.max(2, bw - 2), h = Math.max(0, y(0) - y(v));
      svg += `<g class="bar" data-tip="${yr}: ${v} ${esc(unit)}"><rect class="hit" x="${x}" y="${m.t}" width="${bw}" height="${H - m.t - m.b}" fill="transparent"/>`;
      if (v > 0) svg += `<path d="M${x + 1},${y(0)} v${-Math.max(h - 3, 0)} q0,-3 3,-3 h${w - 6} q3,0 3,3 v${Math.max(h - 3, 0)} z" fill="${color}"/>`;
      svg += `</g>`;
      if (years.length <= 14 || i % Math.ceil(years.length / 12) === 0) svg += `<text x="${x + bw / 2}" y="${H - 8}" class="tick" text-anchor="middle">${String(yr).slice(2) === String(yr).slice(2) && years.length > 10 ? "’" + String(yr).slice(2) : yr}</text>`;
    });
    svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" class="axis"/></svg>`;
    el.innerHTML = svg;
    const tip = $("chart-tip");
    el.querySelectorAll(".bar").forEach(g => {
      const show = e => { tip.textContent = g.dataset.tip; tip.style.opacity = 1; const r = (e.touches ? e.touches[0] : e); tip.style.left = r.clientX + 12 + "px"; tip.style.top = r.clientY - 34 + "px"; g.classList.add("hover"); };
      g.addEventListener("mousemove", show); g.addEventListener("touchstart", show, { passive: true });
      g.addEventListener("mouseleave", () => { tip.style.opacity = 0; g.classList.remove("hover"); });
    });
  }
  function renderCharts() {
    const P = scoped(), ys = P.map(p => p.yr).filter(Boolean);
    if (!ys.length) return;
    const y0 = Math.min(...ys), y1 = Math.max(...ys, new Date().getFullYear()), years = [];
    for (let y = y0; y <= y1; y++) years.push(y);
    const papers = years.map(y => [y, P.filter(p => p.yr === y).length]);
    // citations received per year (OpenAlex) if the weekly sync stored them; otherwise citations of papers by publication year
    const cby = META.citations_by_year || {};
    const ids = state.scope ? [state.scope] : Object.keys(cby);
    let cites, note;
    if (ids.length && ids.every(id => cby[id])) {
      const sum = {}; ids.forEach(id => Object.entries(cby[id]).forEach(([y, v]) => sum[y] = (sum[y] || 0) + v));
      const cy = Object.keys(sum).map(Number);
      const yy = []; for (let y = Math.min(...cy); y <= Math.max(...cy); y++) yy.push(y);
      cites = yy.map(y => [y, sum[y] || 0]);
      $("chart-cites-title").textContent = "Citations received per year";
      note = state.scope ? "OpenAlex" : "OpenAlex · sum of faculty profiles";
    } else {
      cites = years.map(y => [y, P.filter(p => p.yr === y).reduce((s, p) => s + p.cites, 0)]);
      $("chart-cites-title").textContent = "Citations, by year of publication";
      note = "citations of the papers published each year";
    }
    $("chart-cites-note").textContent = note; $("chart-papers-note").textContent = `${P.length} items`;
    barChart($("chart-papers"), papers, "#1f3d5c", "papers");
    barChart($("chart-cites"), cites, "#6e7b3c", "citations");
    const allYears = [...new Set([...papers.map(d => d[0]), ...cites.map(d => d[0])])].sort();
    $("chart-table").innerHTML = `<table><thead><tr><th>Year</th><th>Papers</th><th>Citations</th></tr></thead><tbody>${allYears.map(y =>
      `<tr><td>${y}</td><td>${(papers.find(d => d[0] === y) || [0, 0])[1]}</td><td>${(cites.find(d => d[0] === y) || [0, 0])[1]}</td></tr>`).join("")}</tbody></table>`;
  }

  function renderTop() {
    const top = [...scoped()].sort((a, b) => b.cites - a.cites).slice(0, CONFIG.topCited);
    $("top-cited").innerHTML = top.map((p, i) => {
      const c = catOf(p);
      return `<li class="top-item">
        <span class="rank">${i + 1}</span>
        <img src="${esc(p.image || c.image)}" alt="" loading="lazy">
        <div><a href="${esc(doiURL(p))}" target="_blank" rel="noopener" class="t">${esc(p.title)}</a>
          <span class="a">${authorsHTML(p)}</span><span class="v">${esc(p.venue)} · ${p.year}</span></div>
        <span class="cites"><b>${p.cites}</b> citations</span>
      </li>`;
    }).join("");
  }

  /* ---------- filters ---------- */
  function filtered() {
    const q = state.q.toLowerCase();
    let P = scoped().filter(p =>
      (!state.cat || p.category === state.cat) && (!state.type || p.type === state.type) &&
      (!state.year || String(p.yr) === state.year || (state.year.endsWith("-") && p.yr <= int(state.year))) &&
      (!q || [p.title, p.authors, p.venue, p.keywords, p.doi, p.year].join(" ").toLowerCase().includes(q)));
    const s = { new: (a, b) => b.yr - a.yr || b.cites - a.cites, cited: (a, b) => b.cites - a.cites || b.yr - a.yr, title: (a, b) => a.title.localeCompare(b.title) }[state.sort];
    return P.sort(s);
  }
  function renderFilters() {
    const P = scoped();
    const counts = {}; P.forEach(p => counts[p.category] = (counts[p.category] || 0) + 1);
    const order = Object.values(CATS).sort((a, b) => int(a.priority) - int(b.priority)).map(c => c.id).filter(id => counts[id]);
    $("f-cats").innerHTML = `<button class="cat-chip ${state.cat ? "" : "on"}" data-cat="">All <b>${P.length}</b></button>` +
      order.map(id => `<button class="cat-chip ${state.cat === id ? "on" : ""}" data-cat="${esc(id)}" style="--c:${esc(catOf({ category: id }).color)}"><i></i>${esc(catOf({ category: id }).label)} <b>${counts[id]}</b></button>`).join("");
    const years = [...new Set(P.map(p => p.yr).filter(Boolean))].sort((a, b) => b - a);
    $("f-year").innerHTML = `<option value="">All years</option>` + years.map(y => `<option value="${y}" ${state.year === String(y) ? "selected" : ""}>${y}</option>`).join("") +
      `<option value="2015-" ${state.year === "2015-" ? "selected" : ""}>2015 and earlier</option>`;
  }
  function renderList() {
    const P = filtered(), shown = P.slice(0, state.shown);
    $("count").textContent = `${P.length} publication${P.length === 1 ? "" : "s"}`;
    $("clear").hidden = !(state.q || state.cat || state.year || state.type);
    let html = "", lastYear = null;
    shown.forEach(p => {
      if (state.sort === "new" && p.yr !== lastYear) { lastYear = p.yr; html += `<h3 class="year-head">${p.yr || "—"}</h3>`; }
      const c = catOf(p), url = doiURL(p);
      html += `
      <article class="pub" id="pub-${esc(p.id)}">
        <img class="pub-img" src="${esc(p.image || c.image)}" alt="" loading="lazy" onerror="this.src='${CONFIG.defaultImage}'">
        <div class="pub-body">
          <div class="pub-tags"><span class="cat-tag" style="--c:${esc(c.color)}">${esc(c.label)}</span><span class="type-tag">${TYPE_LABEL[p.type] || esc(p.type)}</span>
            ${p.cites ? `<span class="cite-tag" title="highest count from Scopus / OpenAlex">${p.cites} citations</span>` : ""}</div>
          <h3>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title)}</h3>
          <p class="pub-authors">${authorsHTML(p)}</p>
          <p class="pub-venue"><i>${esc(p.venue)}</i>${p.volume ? `, ${esc(p.volume)}` : ""}${p.issue ? `(${esc(p.issue)})` : ""}${p.pages ? `, ${esc(p.pages)}` : ""} · ${esc(p.year)}</p>
          <div class="pub-actions">
            ${p.doi ? `<a class="act" href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener">DOI ↗</a>` : url ? `<a class="act" href="${esc(url)}" target="_blank" rel="noopener">Link ↗</a>` : ""}
            <button class="act" data-act="apa" data-id="${esc(p.id)}">Copy APA</button>
            <button class="act" data-act="bib" data-id="${esc(p.id)}">Copy BibTeX</button>
            ${p.abstract ? `<button class="act" data-act="abs" data-id="${esc(p.id)}" aria-expanded="false">Abstract ▾</button>` : ""}
            ${url ? `<button class="act" data-act="qr" data-id="${esc(p.id)}" aria-expanded="false">QR code</button>` : ""}
          </div>
          <div class="pub-extra" hidden></div>
        </div>
      </article>`;
    });
    $("pub-list").innerHTML = html || `<p class="empty">No publication matches these filters.</p>`;
    $("more").hidden = P.length <= state.shown;
    $("more").textContent = `Show more (${P.length - state.shown} left)`;
  }
  const renderAll = () => { renderScope(); renderStats(); renderCharts(); renderTop(); renderFilters(); renderList(); writeURL(); };

  /* ---------- URL (so a filtered view can be shared) ---------- */
  function readURL() {
    const u = new URLSearchParams(location.search);
    ["q", "cat", "year", "type", "sort", "scope"].forEach(k => { if (u.get(k)) state[k] = u.get(k); });
    $("q").value = state.q; $("f-type").value = state.type; $("f-sort").value = state.sort;
  }
  function writeURL() {
    const u = new URLSearchParams();
    ["q", "cat", "year", "type", "scope"].forEach(k => { if (state[k]) u.set(k, state[k]); });
    if (state.sort !== "new") u.set("sort", state.sort);
    history.replaceState(null, "", location.pathname + (u.toString() ? "?" + u : "") + location.hash);
  }

  function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 1800); }

  /* ---------- events ---------- */
  function wire() {
    let timer;
    $("q").addEventListener("input", e => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value.trim(); state.shown = CONFIG.pageSize; renderList(); writeURL(); }, 150); });
    $("f-year").addEventListener("change", e => { state.year = e.target.value; state.shown = CONFIG.pageSize; renderList(); writeURL(); });
    $("f-type").addEventListener("change", e => { state.type = e.target.value; state.shown = CONFIG.pageSize; renderList(); writeURL(); });
    $("f-sort").addEventListener("change", e => { state.sort = e.target.value; renderList(); writeURL(); });
    $("f-cats").addEventListener("click", e => { const b = e.target.closest(".cat-chip"); if (!b) return; state.cat = b.dataset.cat; state.shown = CONFIG.pageSize; renderFilters(); renderList(); writeURL(); });
    $("scope").addEventListener("click", e => { const b = e.target.closest("[data-scope]"); if (!b) return; state.scope = b.dataset.scope; state.cat = ""; state.year = ""; state.shown = CONFIG.pageSize; renderAll(); });
    $("clear").addEventListener("click", () => { Object.assign(state, { q: "", cat: "", year: "", type: "", shown: CONFIG.pageSize }); $("q").value = ""; $("f-type").value = ""; renderFilters(); renderList(); writeURL(); });
    $("more").addEventListener("click", () => { state.shown += CONFIG.pageSize; renderList(); });
    $("pub-list").addEventListener("click", async e => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      const p = PUBS.find(x => x.id === b.dataset.id), extra = b.closest(".pub-body").querySelector(".pub-extra");
      if (b.dataset.act === "apa") { await copy(apa(p)); toast("APA reference copied"); }
      if (b.dataset.act === "bib") { await copy(bibtex(p)); toast("BibTeX copied"); }
      if (b.dataset.act === "abs" || b.dataset.act === "qr") {
        const mode = b.dataset.act, open = !(extra.dataset.mode === mode && !extra.hidden);
        b.closest(".pub-actions").querySelectorAll("[aria-expanded]").forEach(x => x.setAttribute("aria-expanded", "false"));
        if (!open) { extra.hidden = true; extra.dataset.mode = ""; return; }
        b.setAttribute("aria-expanded", "true"); extra.dataset.mode = mode; extra.hidden = false;
        if (mode === "abs") extra.innerHTML = `<p class="abstract">${esc(p.abstract)}</p>${p.keywords ? `<div class="chips">${list(p.keywords).map(k => `<span class="chip">${esc(k)}</span>`).join("")}</div>` : ""}`;
        else { const url = doiURL(p); extra.innerHTML = `<div class="qr-box">${window.QR.svg(url, { size: 132 })}<div><b>Scan to open</b><br><span class="mono">${esc(url)}</span></div></div>`; }
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    setupChrome();
    try { await load(); }
    catch (e) { console.error(e); $("pub-list").innerHTML = `<p class="empty">${esc(failText("data/publications.csv"))}</p>`; return; }
    if (META.updated) $("pub-updated").textContent = `last update: ${META.updated}.`;
    readURL(); wire(); renderAll();
  });
})();
