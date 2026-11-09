/* ==========================================================
   main.js — builds the data-driven sections of index.html
   ----------------------------------------------------------
   Every section reads one CSV file from data/ and turns each
   row into a card. To change the content, edit the CSV files;
   you normally never need to edit this program.
   ========================================================== */
(function () {
  const { loadCSV, esc, list, failText, photo, socials, profileURL, nameKey, setupChrome, reveal } = window.ARC;
  const $ = id => document.getElementById(id);
  const CATEGORY_LABELS = { faculty: "Faculty", phd: "PhD Student", msc: "MSc Student", bsc: "BSc Student", alumni: "Alumni" };
  const int = v => parseInt(v, 10) || 0;
  let TEAM = [];

  /* ---------------- People ---------------- */
  function renderPeople(team) {
    const cat = p => (p.category || "").toLowerCase();
    const faculty = team.filter(p => cat(p) === "faculty");
    const others = team.filter(p => cat(p) !== "faculty");

    $("faculty-list").innerHTML = faculty.map(p => `
      <article class="card faculty-card reveal">
        <a class="photo" href="${profileURL(p.id)}" aria-label="Profile of ${esc(p.name)}">${photo(p.photo, "Photo of " + p.name)}</a>
        <div class="body">
          ${p.role ? `<span class="role-tag">${esc(p.role)}</span>` : ""}
          <h3><a href="${profileURL(p.id)}">${esc(p.name)}</a></h3>
          <p class="person-title">${esc(p.title)}</p>
          ${p.bio ? `<p class="person-bio clamp-4">${esc(p.bio)}</p>` : ""}
          ${p.interests ? `<div class="chips" style="margin-bottom:14px">${list(p.interests).map(i => `<span class="chip olive">${esc(i)}</span>`).join("")}</div>` : ""}
          ${p.email ? `<a class="person-email" href="mailto:${esc(p.email)}">✉ ${esc(p.email)}</a>` : ""}
          ${socials(p)}
          <a class="more-link" href="${profileURL(p.id)}">Full profile &amp; publications →</a>
        </div>
      </article>`).join("");

    const box = $("student-list");
    box.innerHTML = others.length ? others.map(p => {
      const c = cat(p);
      return `
      <article class="card student-card reveal" data-category="${esc(c)}">
        ${photo(p.photo, "Photo of " + p.name)}
        <h4><a class="stretched" href="${profileURL(p.id)}">${esc(p.name)}</a></h4>
        <p class="person-title">${esc(p.title || CATEGORY_LABELS[c] || c)}</p>
        ${p.research_topic ? `<p class="topic">${esc(p.research_topic)}</p>` : ""}
        <span class="card-more">View profile →</span>
      </article>`;
    }).join("") : `<p class="empty">Student profiles coming soon.</p>`;

    document.querySelectorAll("#people .filter-btn").forEach(btn => {
      const f = btn.dataset.filter;
      if (f !== "all" && !others.some(s => cat(s) === f)) btn.style.display = "none";
      btn.addEventListener("click", () => {
        document.querySelectorAll("#people .filter-btn").forEach(b => b.classList.toggle("active", b === btn));
        box.querySelectorAll(".student-card").forEach(card => card.style.display = (f === "all" || card.dataset.category === f) ? "" : "none");
      });
    });
    $("stat-people").textContent = team.filter(p => cat(p) !== "alumni").length;
  }

  /* ---------------- Projects ---------------- */
  function renderProjects(projects) {
    const order = { ongoing: 0, planned: 1, completed: 2 };
    projects.sort((a, b) => (order[(a.status || "").toLowerCase()] ?? 9) - (order[(b.status || "").toLowerCase()] ?? 9));
    $("project-list").innerHTML = projects.map(p => {
      const status = (p.status || "ongoing").toLowerCase();
      const title = p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title);
      const student = p.student_id ? `<a href="${profileURL(p.student_id)}">${esc(p.student)}</a>` : esc(p.student);
      return `
      <article class="card project-card reveal" data-kind="${esc(p.kind)}">
        <div class="thumb">${photo(p.image || "assets/images/projects/placeholder-project.svg", "")}</div>
        <div class="body">
          <div class="tag-row"><span class="status status-${esc(status)}">${esc(status)}</span>${p.kind ? `<span class="kind">${esc(p.kind)}</span>` : ""}</div>
          <h3>${title}</h3>
          <p>${esc(p.summary)}</p>
          ${p.keywords ? `<div class="chips">${list(p.keywords).map(k => `<span class="chip">${esc(k)}</span>`).join("")}</div>` : ""}
          <div class="project-meta">
            ${p.student ? `<div><b>Researcher:</b> ${student}</div>` : ""}
            ${p.supervisor ? `<div><b>Supervisor:</b> ${esc(p.supervisor.replace(/;/g, ","))}</div>` : ""}
            ${p.start ? `<div><b>Started:</b> ${esc(p.start)}</div>` : ""}
          </div>
        </div>
      </article>`;
    }).join("");
    document.querySelectorAll("#project-filters .filter-btn").forEach(btn => btn.addEventListener("click", () => {
      document.querySelectorAll("#project-filters .filter-btn").forEach(b => b.classList.toggle("active", b === btn));
      const f = btn.dataset.filter;
      document.querySelectorAll("#project-list .project-card").forEach(c => c.style.display = f === "all" || c.dataset.kind === f ? "" : "none");
    }));
    $("stat-projects").textContent = projects.filter(p => (p.status || "").toLowerCase() === "ongoing").length;
  }

  /* ---------------- Publications teaser ---------------- */
  function renderPubTeaser(pubs, overrides) {
    const hidden = new Set(overrides.filter(o => /^y/i.test(o.hide)).map(o => o.key.toLowerCase()));
    pubs = pubs.filter(p => !hidden.has((p.doi || "").toLowerCase()) && !hidden.has(p.id.toLowerCase()));
    const cites = pubs.map(p => int(p.citations)).sort((a, b) => b - a);
    const h = cites.filter((c, i) => c >= i + 1).length;
    const total = cites.reduce((a, b) => a + b, 0);
    const years = pubs.map(p => int(p.year)).filter(Boolean);
    $("pub-stats").innerHTML = [
      [pubs.length, "Papers & books"], [total.toLocaleString("en"), "Citations"], [h, "h-index (lab)"], [Math.min(...years) + "–" + Math.max(...years), "Years"],
    ].map(([v, l]) => `<div class="stat-tile"><strong>${v}</strong><span>${l}</span></div>`).join("");
    const item = p => `<li><a href="${esc(p.link || (p.doi ? "https://doi.org/" + p.doi : "publications.html"))}" target="_blank" rel="noopener">${esc(p.title)}</a>
      <span>${esc(p.venue)} · ${esc(p.year)}${int(p.citations) ? ` · <b>${p.citations}</b> citations` : ""}</span></li>`;
    $("pub-top").innerHTML = [...pubs].sort((a, b) => int(b.citations) - int(a.citations)).slice(0, 4).map(item).join("");
    $("pub-latest").innerHTML = [...pubs].sort((a, b) => int(b.year) - int(a.year) || int(b.citations) - int(a.citations)).slice(0, 4).map(item).join("");
    $("stat-papers").textContent = pubs.length;
    $("stat-citations").textContent = total.toLocaleString("en");
    return pubs;
  }

  /* ---------------- Teaching ---------------- */
  function renderCourses(courses) {
    $("course-list").innerHTML = courses.map(c => {
      const img = `assets/images/teaching/${esc(c.id)}.svg`;
      const link = c.link ? `<a class="btn btn-primary btn-sm" href="${esc(c.link)}" target="_blank" rel="noopener">Open course hub ↗</a>` : `<span class="soon">Hub link coming soon</span>`;
      return `
      <article class="card course-card reveal">
        <div class="thumb">${photo(img, "")}</div>
        <div class="body">
          <div class="tag-row"><span class="kind">${esc(c.level)}</span>${c.kind && c.kind.toLowerCase() !== (c.level || "").toLowerCase() ? `<span class="kind">${esc(c.kind)}</span>` : ""}</div>
          <h3>${esc(c.title)}</h3>
          ${c.title_fa ? `<p class="fa" lang="fa" dir="rtl">${esc(c.title_fa)}</p>` : ""}
          <p>${esc(c.description)}</p>
          <p class="instructor">${esc(c.instructor)}</p>
          ${link}
        </div>
      </article>`;
    }).join("");
    const btn = $("academy-toggle"), frame = $("academy-frame");
    btn.addEventListener("click", () => {
      const open = frame.hidden;
      if (open && !frame.innerHTML) frame.innerHTML = `<iframe src="https://goharimanesh.github.io/aparat-academy/" title="Goharimanesh Video Academy" loading="lazy"></iframe>`;
      frame.hidden = !open; btn.setAttribute("aria-expanded", open); btn.textContent = open ? "Close ▴" : "Browse here ▾";
    });
  }

  /* ---------------- Facilities ---------------- */
  function renderFacilities(items) {
    $("facility-list").innerHTML = items.map(f => `
      <article class="card facility-card reveal">
        <div class="thumb">${photo(f.image || "assets/images/facilities/placeholder-facility.svg", "")}</div>
        <div class="body">
          ${f.category ? `<span class="category">${esc(f.category)}</span>` : ""}
          <h3>${esc(f.name)}</h3>
          <p>${esc(f.description)}</p>
        </div>
      </article>`).join("");
  }

  /* ---------------- Collaborations ---------------- */
  function renderCollabs(rows, pubs) {
    $("collab-list").innerHTML = rows.map(c => {
      const key = nameKey(c.match_author || "");
      const joint = c.match_author ? pubs.filter(p => list(p.authors).some(a => nameKey(a) === key)) : [];
      return `
      <article class="card collab-card reveal">
        <div class="collab-badge">${esc(c.short || c.name.slice(0, 4))}</div>
        <div class="body">
          <h3>${esc(c.name)}</h3>
          <p class="person-title">${esc(c.institution)}${c.director ? ` · Director: ${esc(c.director)}` : ""}</p>
          <p>${esc(c.description)}</p>
          ${joint.length ? `<p class="joint"><b>${joint.length}</b> joint publications —
            <a href="publications.html?q=${encodeURIComponent(c.match_author.split(" ")[0])}">see them →</a></p>` : ""}
          ${c.link ? `<a class="btn btn-ghost btn-sm" href="${esc(c.link)}" target="_blank" rel="noopener">Visit ${esc(c.short || "lab")} ↗</a>` : ""}
        </div>
      </article>`;
    }).join("");
  }

  /* ---------------- Benefactors ---------------- */
  function renderBenefactors(rows) {
    $("benefactor-list").innerHTML = rows.map(b => {
      const mem = /^y/i.test(b.in_memoriam);
      return `
      <article class="card benefactor-card ${mem ? "memoriam" : ""} reveal">
        ${photo(b.photo, b.name)}
        <div class="body">
          ${mem ? `<span class="memo">In loving memory</span>` : ""}
          <h3>${mem ? "The late " : ""}${esc(b.name)}</h3>
          <p>${esc(b.contribution)}</p>
        </div>
      </article>`;
    }).join("");
  }

  /* ---------------- News & events ---------------- */
  function renderEvents(events) {
    const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const d = s => { const [y, m, dd] = (s || "").split("-").map(Number); return y ? new Date(y, (m || 1) - 1, dd || 1) : null; };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const ev = events.map(e => ({ ...e, _s: d(e.date), _e: d(e.end_date) || d(e.date) })).filter(e => e._s);
    const card = e => `
      <article class="card event reveal">
        <div class="event-date"><span class="d">${e._s.getDate()}</span><span class="m">${M[e._s.getMonth()]} ${String(e._s.getFullYear()).slice(2)}</span></div>
        <div><h3>${e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : esc(e.title)}</h3>
          ${e.description ? `<p>${esc(e.description)}</p>` : ""}
          <div class="where">📍 ${esc(e.location || "TBA")}</div></div>
        ${e.type ? `<span class="event-type">${esc(e.type)}</span>` : ""}
      </article>`;
    const up = ev.filter(e => e._e >= today).sort((a, b) => a._s - b._s);
    const past = ev.filter(e => e._e < today).sort((a, b) => b._s - a._s).slice(0, 6);
    $("events-upcoming").innerHTML = up.length ? up.map(card).join("") : `<p class="empty">No upcoming events at the moment.</p>`;
    $("events-past").innerHTML = past.length ? past.map(card).join("") : `<p class="empty">No past events yet.</p>`;
  }

  /* ---------------- highlight the current menu item ---------------- */
  function scrollSpy() {
    const links = document.querySelectorAll(".nav-links a");
    const spy = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) links.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
    }), { rootMargin: "-45% 0px -50% 0px" });
    document.querySelectorAll("main section[id]").forEach(s => spy.observe(s));
  }

  /* ---------------- start ---------------- */
  document.addEventListener("DOMContentLoaded", async () => {
    setupChrome(); scrollSpy();
    const safe = async (file, fn, box) => {
      try { return await fn(await loadCSV(file)); }
      catch (err) { console.error(err); if (box && $(box)) $(box).innerHTML = `<p class="empty">${esc(failText(file))}</p>`; return null; }
    };
    TEAM = (await safe("data/team.csv", t => { renderPeople(t); return t; }, "student-list")) || [];
    let pubs = [];
    try {
      const [p, o] = await Promise.all([loadCSV("data/publications.csv"), loadCSV("data/publication_overrides.csv").catch(() => [])]);
      pubs = renderPubTeaser(p, o);
    } catch (e) { console.error(e); $("pub-top").innerHTML = `<li class="empty">${esc(failText("data/publications.csv"))}</li>`; }
    await Promise.all([
      safe("data/projects.csv", renderProjects, "project-list"),
      safe("data/courses.csv", renderCourses, "course-list"),
      safe("data/facilities.csv", renderFacilities, "facility-list"),
      safe("data/collaborations.csv", rows => renderCollabs(rows, pubs), "collab-list"),
      safe("data/benefactors.csv", renderBenefactors, "benefactor-list"),
      safe("data/events.csv", renderEvents, "events-upcoming"),
    ]);
    reveal();
    if (location.hash) { const t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
  });
})();
