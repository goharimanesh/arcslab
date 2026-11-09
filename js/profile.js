/* ==========================================================
   profile.js — builds profile.html?id=<member id>
   ----------------------------------------------------------
   Shows the member's photo, role, biography, research topic,
   skills, links, projects (data/projects.csv) and publications
   (data/publications.csv, matched by the pub_names column of
   data/team.csv). Nothing to edit here — edit the CSV files.
   ========================================================== */
(function () {
  const { loadCSV, esc, list, failText, photo, socials, nameKey, memberIndex, profileURL, setupChrome } = window.ARC;
  const LABEL = { faculty: "Faculty", phd: "PhD Student", msc: "MSc Student", bsc: "BSc Student", alumni: "Alumni" };
  const int = v => parseInt(v, 10) || 0;

  document.addEventListener("DOMContentLoaded", async () => {
    setupChrome();
    const root = document.getElementById("profile");
    const id = new URLSearchParams(location.search).get("id");
    let team, projects, pubs, cats;
    try {
      let ovr;
      [team, projects, pubs, cats, ovr] = await Promise.all([loadCSV("data/team.csv"), loadCSV("data/projects.csv").catch(() => []),
        loadCSV("data/publications.csv").catch(() => []), loadCSV("data/publication_categories.csv").catch(() => []),
        loadCSV("data/publication_overrides.csv").catch(() => [])]);
      pubs = window.ARC.visiblePubs(pubs, cats, ovr);
    } catch (e) { root.innerHTML = `<section class="page-hero"><div class="container"><p class="empty">${esc(failText("data/team.csv"))}</p></div></section>`; return; }

    const m = team.find(x => x.id === id);
    if (!m) {
      root.innerHTML = `<section class="page-hero"><div class="container"><h1>Profile not found</h1>
        <p class="section-lead">No member with id “${esc(id || "")}”. <a href="index.html#people">Back to People →</a></p></div></section>`;
      return;
    }
    document.title = `${m.name} | ARCSLAB`;
    const cat = (m.category || "").toLowerCase();
    const keys = new Set(list(m.pub_names).map(nameKey));
    const members = memberIndex(team);
    const CAT = {}; cats.forEach(c => CAT[c.id] = c);

    // publications where one of this member's name forms appears
    const mine = pubs.filter(p => list(p.authors).some(a => keys.has(nameKey(a))))
      .sort((a, b) => int(b.year) - int(a.year) || int(b.citations) - int(a.citations));
    const cites = mine.map(p => int(p.citations)).sort((a, b) => b - a);
    const h = cites.filter((c, i) => c >= i + 1).length;

    // projects: as researcher (student_id) or as supervisor (name appears in "supervisor")
    const surname = m.name.replace(/^Dr\.?\s*/, "").split(" ").pop();
    const asStudent = projects.filter(p => p.student_id === m.id);
    const asSupervisor = cat === "faculty" ? projects.filter(p => (p.supervisor || "").includes(surname)) : [];

    const authorList = p => list(p.authors).map(a => {
      const x = members[nameKey(a)];
      if (!x) return esc(a);
      return x.id === m.id ? `<strong>${esc(a)}</strong>` : `<a class="member" href="${profileURL(x.id)}">${esc(a)}</a>`;
    }).join(", ");

    const projectCard = p => `
      <article class="card project-card">
        <div class="thumb">${photo(p.image || "assets/images/projects/placeholder-project.svg", "")}</div>
        <div class="body">
          <div class="tag-row"><span class="status status-${esc((p.status || "").toLowerCase())}">${esc(p.status)}</span>${p.kind ? `<span class="kind">${esc(p.kind)}</span>` : ""}</div>
          <h3>${esc(p.title)}</h3><p>${esc(p.summary)}</p>
          ${p.keywords ? `<div class="chips">${list(p.keywords).map(k => `<span class="chip">${esc(k)}</span>`).join("")}</div>` : ""}
          <div class="project-meta">${p.student ? `<div><b>Researcher:</b> ${p.student_id && p.student_id !== m.id ? `<a href="${profileURL(p.student_id)}">${esc(p.student)}</a>` : esc(p.student)}</div>` : ""}
            ${p.supervisor ? `<div><b>Supervisor:</b> ${esc(p.supervisor.replace(/;/g, ","))}</div>` : ""}</div>
        </div>
      </article>`;

    root.innerHTML = `
      <section class="page-hero profile-hero">
        <div class="container profile-grid">
          <div class="profile-photo">${photo(m.photo, "Photo of " + m.name)}</div>
          <div>
            <p class="eyebrow"><a href="index.html#people">← People</a> · ${esc(LABEL[cat] || cat)}</p>
            ${m.role ? `<span class="role-tag">${esc(m.role)}</span>` : ""}
            <h1 class="profile-name">${esc(m.name)}</h1>
            <p class="person-title">${esc(m.title)}</p>
            ${m.research_topic ? `<p class="profile-topic"><b>Research:</b> ${esc(m.research_topic)}</p>` : ""}
            ${m.bio ? `<p class="profile-bio">${esc(m.bio)}</p>` : `<p class="profile-bio muted">A short biography will be added soon.</p>`}
            ${m.email ? `<p><a class="person-email" href="mailto:${esc(m.email)}">✉ ${esc(m.email)}</a></p>` : ""}
            ${socials(m)}
            ${mine.length ? `<div class="stat-tiles small">
              <div class="stat-tile"><strong>${mine.length}</strong><span>Publications</span></div>
              <div class="stat-tile"><strong>${cites.reduce((a, b) => a + b, 0).toLocaleString("en")}</strong><span>Citations</span></div>
              <div class="stat-tile"><strong>${h}</strong><span>h-index</span></div></div>` : ""}
          </div>
        </div>
      </section>

      <section class="section section-tight">
        <div class="container profile-body">
          ${m.interests ? `<div><h2 class="block-title">Research interests</h2><div class="chips">${list(m.interests).map(i => `<span class="chip olive">${esc(i)}</span>`).join("")}</div></div>` : ""}
          ${m.skills ? `<div><h2 class="block-title">Skills &amp; tools</h2><div class="chips">${list(m.skills).map(i => `<span class="chip">${esc(i)}</span>`).join("")}</div></div>` : ""}
          ${asStudent.length ? `<div class="wide"><h2 class="block-title">Project</h2><div class="project-grid">${asStudent.map(projectCard).join("")}</div></div>` : ""}
          ${asSupervisor.length ? `<div class="wide"><h2 class="block-title">Supervised projects</h2><div class="project-grid">${asSupervisor.map(projectCard).join("")}</div></div>` : ""}
          ${mine.length ? `<div class="wide"><h2 class="block-title">Publications <small>(${mine.length})</small></h2>
            <ol class="profile-pubs">${mine.slice(0, 12).map(p => `<li>
              <img src="${esc(p.image || (CAT[p.category] || {}).image || "assets/images/publications/other.svg")}" alt="" loading="lazy">
              <div><a class="t" href="${esc(p.doi ? "https://doi.org/" + p.doi : p.link)}" target="_blank" rel="noopener">${esc(p.title)}</a>
                <span class="a">${authorList(p)}</span><span class="v"><i>${esc(p.venue)}</i> · ${esc(p.year)}${int(p.citations) ? ` · <b>${p.citations}</b> citations` : ""}</span></div></li>`).join("")}</ol>
            ${cat === "faculty" ? `<a class="btn btn-primary" href="publications.html?scope=${encodeURIComponent(m.id)}">All publications, charts &amp; citations →</a>`
              : mine.length > 12 ? `<a class="btn btn-ghost" href="publications.html?q=${encodeURIComponent(surname)}">See all →</a>` : ""}</div>` : ""}
        </div>
      </section>`;
  });
})();
