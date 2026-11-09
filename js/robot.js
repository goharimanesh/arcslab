/* ==========================================================
   robot.js — interactive continuum robot on the home page
   ----------------------------------------------------------
   MODEL  Planar 3-section continuum robot, piecewise constant
          curvature. Each section has length L = 100 mm and a
          curvature κᵢ (the "joint" variables q = [κ₁, κ₂, κ₃]).
   TASK   Make the tip follow a circle, square, triangle or
          figure-8 — or follow your mouse / finger.
   CONTROL  Resolved-rate (Jacobian) control:
          ẋ_cmd = ẋ_desired + Kp·(x_desired − x)
          q̇ = J⁺ ẋ_cmd + (I − J⁺J)(−k₀ q)    (damped least squares)
          The null-space term keeps the robot gently straight
          because 3 curvatures are more than the 2 needed for x, y.
          Actuator speed and curvature are limited, so tracking
          error appears when the path is fast or the gain is low.
   Settings you may want to change are in P below.
   ========================================================== */
(function () {
  const canvas = document.getElementById("robotCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const P = {
    L: 100,                 // section length [mm]
    n: 3,                   // number of sections
    kMax: 2.6 / 100,        // max curvature [1/mm] (≈150° bend per section)
    qdMax: 2.4 / 100,       // max curvature rate [1/(mm·s)] (actuator speed limit)
    lambda: 6,              // damping of the least-squares inverse
    k0: 0.6,                // null-space pull towards a straight robot
    center: [0, 185],       // centre of the paths [mm] (base at 0,0)
    size: 62,               // path size [mm]
  };
  const COLORS = { blue: "#1f3d5c", olive: "#6e7b3c", soft: "#8a96a3", line: "#d9dee3", red: "#b5473a" };

  const S = { q: [0.002, 0.001, -0.001], path: "circle", s: 0, period: 8, kp: 6, paused: false,
              trail: [], errs: [], mouse: null, push: 0, t: 0, lapErr: [], rms: 0, ff: true };

  /* ---------- kinematics ---------- */
  function fk(q, samples = 0) {
    let x = 0, y = 0, th = Math.PI / 2; const pts = [[0, 0]], frames = [];
    for (let i = 0; i < P.n; i++) {
      const k = q[i], m = Math.max(samples, 1);
      for (let j = 1; j <= m; j++) {
        const l = P.L * j / m, t = th + k * l;
        let px, py;
        if (Math.abs(k) < 1e-7) { px = x + l * Math.cos(th); py = y + l * Math.sin(th); }
        else { px = x + (Math.sin(t) - Math.sin(th)) / k; py = y + (Math.cos(th) - Math.cos(t)) / k; }
        if (samples) { pts.push([px, py]); frames.push(t); }
        if (j === m) { x = px; y = py; }
      }
      th += k * P.L;
    }
    return { tip: [x, y], pts, frames, th };
  }
  function jacobian(q) {
    const h = 1e-6, f0 = fk(q).tip, J = [[0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) {
      const qq = q.slice(); qq[i] += h; const f = fk(qq).tip;
      J[0][i] = (f[0] - f0[0]) / h; J[1][i] = (f[1] - f0[1]) / h;
    }
    return J;
  }
  // J⁺ = Jᵀ (J Jᵀ + λ² I)⁻¹   (2×2 inverse)
  function pinv(J) {
    const a = J[0][0] ** 2 + J[0][1] ** 2 + J[0][2] ** 2 + P.lambda ** 2;
    const b = J[0][0] * J[1][0] + J[0][1] * J[1][1] + J[0][2] * J[1][2];
    const d = J[1][0] ** 2 + J[1][1] ** 2 + J[1][2] ** 2 + P.lambda ** 2;
    const det = a * d - b * b, inv = [[d / det, -b / det], [-b / det, a / det]];
    return [0, 1, 2].map(i => [J[0][i] * inv[0][0] + J[1][i] * inv[1][0], J[0][i] * inv[0][1] + J[1][i] * inv[1][1]]);
  }

  /* ---------- reference paths (s ∈ [0,1) → [x, y]) ---------- */
  const [cx, cy] = P.center, R = P.size;
  const polygon = (verts, s) => {
    const seg = verts.map((v, i) => { const w = verts[(i + 1) % verts.length]; return Math.hypot(w[0] - v[0], w[1] - v[1]); });
    const total = seg.reduce((a, b) => a + b, 0); let d = (s % 1) * total, i = 0;
    while (d > seg[i]) { d -= seg[i]; i++; }
    const v = verts[i], w = verts[(i + 1) % verts.length], f = d / seg[i];
    return [v[0] + (w[0] - v[0]) * f, v[1] + (w[1] - v[1]) * f];
  };
  const PATHS = {
    circle: s => [cx + R * Math.cos(2 * Math.PI * s), cy + R * Math.sin(2 * Math.PI * s)],
    square: s => polygon([[cx - R * .85, cy - R * .85], [cx + R * .85, cy - R * .85], [cx + R * .85, cy + R * .85], [cx - R * .85, cy + R * .85]], s),
    triangle: s => polygon([0, 1, 2].map(k => [cx + R * 1.1 * Math.cos(Math.PI / 2 + k * 2 * Math.PI / 3), cy - 8 + R * 1.1 * Math.sin(Math.PI / 2 + k * 2 * Math.PI / 3)]), s),
    eight: s => { const t = 2 * Math.PI * s; return [cx + R * 1.15 * Math.sin(t), cy + R * 0.7 * Math.sin(2 * t)]; },
  };
  const desired = () => S.path === "mouse" ? (S.mouse || [cx, cy]) : PATHS[S.path](S.s);

  /* ---------- simulation step ---------- */
  function step(dt) {
    let xd = desired(), vd = [0, 0];
    if (S.path !== "mouse") {
      S.s = (S.s + dt / S.period) % 1;
      const a = PATHS[S.path](S.s), b = PATHS[S.path]((S.s + 1e-3) % 1);
      vd = [(b[0] - a[0]) / (1e-3 * S.period), (b[1] - a[1]) / (1e-3 * S.period)];
      xd = a;
    }
    const x = fk(S.q).tip, e = [xd[0] - x[0], xd[1] - x[1]];
    const f = S.ff ? 1 : 0, v = [f * vd[0] + S.kp * e[0], f * vd[1] + S.kp * e[1]];
    const J = jacobian(S.q), Jp = pinv(J);
    const qd = [0, 1, 2].map(i => Jp[i][0] * v[0] + Jp[i][1] * v[1]);
    // null-space motion: (I − J⁺J)(−k₀ q)
    const z = S.q.map(k => -P.k0 * k);
    const Jz = [J[0][0] * z[0] + J[0][1] * z[1] + J[0][2] * z[2], J[1][0] * z[0] + J[1][1] * z[1] + J[1][2] * z[2]];
    for (let i = 0; i < 3; i++) qd[i] += z[i] - (Jp[i][0] * Jz[0] + Jp[i][1] * Jz[1]);
    // disturbance: a sideways push on the middle section
    if (S.push > 0) { qd[1] += 0.02 * S.push; S.push = Math.max(0, S.push - dt * 1.5); }
    // actuator speed limit: scale the whole command so its direction is kept
    const peak = Math.max(...qd.map(Math.abs)), sc = peak > P.qdMax ? P.qdMax / peak : 1;
    for (let i = 0; i < 3; i++) S.q[i] = Math.max(-P.kMax, Math.min(P.kMax, S.q[i] + qd[i] * sc * dt));
    const err = Math.hypot(e[0], e[1]);
    S.errs.push(err); if (S.errs.length > 240) S.errs.shift();
    S.lapErr.push(err * err); if (S.lapErr.length > 360) S.lapErr.shift();
    S.rms = Math.sqrt(S.lapErr.reduce((a, b) => a + b, 0) / S.lapErr.length);
    S.trail.push(fk(S.q).tip); if (S.trail.length > 260) S.trail.shift();
  }

  /* ---------- drawing ---------- */
  let W = 0, H = 0, scale = 1, ox = 0, oy = 0;
  function resize() {
    const d = Math.min(window.devicePixelRatio || 1, 2), r = canvas.getBoundingClientRect();
    W = r.width; H = r.height; canvas.width = Math.round(W * d); canvas.height = Math.round(H * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    scale = Math.min((H - 70) / 300, W / 330); ox = W / 2; oy = H - 46;
  }
  const X = p => [ox + p[0] * scale, oy - p[1] * scale];
  const toModel = (px, py) => [(px - ox) / scale, (oy - py) / scale];

  function draw() {
    ctx.clearRect(0, 0, W, H);
    // dotted background
    ctx.fillStyle = "#e3e7eb";
    for (let x = 12; x < W; x += 22) for (let y = 12; y < H; y += 22) { ctx.beginPath(); ctx.arc(x, y, 1, 0, 7); ctx.fill(); }

    // desired path
    if (S.path !== "mouse") {
      ctx.strokeStyle = COLORS.olive; ctx.lineWidth = 1.6; ctx.setLineDash([5, 6]); ctx.beginPath();
      for (let i = 0; i <= 200; i++) { const p = X(PATHS[S.path](i / 200)); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    }
    // actual trail
    ctx.lineWidth = 2;
    for (let i = 1; i < S.trail.length; i++) {
      const a = X(S.trail[i - 1]), b = X(S.trail[i]);
      ctx.strokeStyle = `rgba(31,61,92,${(i / S.trail.length) * 0.9})`;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }

    // robot: tendons, backbone, disks
    const k = fk(S.q, 24), w = 11 * scale * 2.2;
    for (const side of [-1, 1]) {
      ctx.strokeStyle = "rgba(110,123,60,.8)"; ctx.lineWidth = 1.4; ctx.beginPath();
      k.pts.forEach((p, i) => {
        const th = i ? k.frames[i - 1] : Math.PI / 2, off = side * (w / scale) * (0.42 - 0.12 * i / k.pts.length);
        const q = X([p[0] - Math.sin(th) * off, p[1] + Math.cos(th) * off]);
        i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
      });
      ctx.stroke();
    }
    ctx.strokeStyle = COLORS.blue; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath();
    k.pts.forEach((p, i) => { const q = X(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke();
    k.pts.forEach((p, i) => {
      if (i === 0 || i % 4) return;
      const th = k.frames[i - 1], half = (w / scale) * (0.5 - 0.14 * i / k.pts.length);
      const a = X([p[0] - Math.sin(th) * half, p[1] + Math.cos(th) * half]), b = X([p[0] + Math.sin(th) * half, p[1] - Math.cos(th) * half]);
      ctx.lineWidth = (i % 24 === 0) ? 7 : 5; ctx.strokeStyle = (i % 24 === 0) ? COLORS.olive : COLORS.blue;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    });
    // base
    const b0 = X([0, 0]); ctx.fillStyle = COLORS.blue;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(b0[0] - 46, b0[1], 92, 14, 5) : ctx.rect(b0[0] - 46, b0[1], 92, 14); ctx.fill();
    ctx.fillStyle = "rgba(31,61,92,.2)"; ctx.fillRect(b0[0] - 66, b0[1] + 14, 132, 8);

    // target and tip
    const xd = X(desired()), tip = X(k.tip);
    ctx.strokeStyle = COLORS.olive; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(xd[0], xd[1], 8, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xd[0] - 12, xd[1]); ctx.lineTo(xd[0] + 12, xd[1]); ctx.moveTo(xd[0], xd[1] - 12); ctx.lineTo(xd[0], xd[1] + 12); ctx.stroke();
    ctx.fillStyle = COLORS.blue; ctx.beginPath(); ctx.arc(tip[0], tip[1], 5, 0, 7); ctx.fill();

    // legend
    ctx.font = "11px ui-monospace, Menlo, monospace"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.strokeStyle = COLORS.olive; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(12, 16); ctx.lineTo(34, 16); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#5b6573"; ctx.fillText(S.path === "mouse" ? "target (your pointer)" : "desired path", 40, 16);
    ctx.strokeStyle = COLORS.blue; ctx.beginPath(); ctx.moveTo(12, 32); ctx.lineTo(34, 32); ctx.stroke(); ctx.fillText("tip trajectory", 40, 32);

    // error strip
    const gx = W - 132, gy = 10, gw = 120, gh = 40, emax = 30;
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(gx - 4, gy - 2, gw + 8, gh + 18);
    ctx.strokeStyle = COLORS.line; ctx.strokeRect(gx, gy, gw, gh);
    ctx.strokeStyle = COLORS.red; ctx.lineWidth = 1.5; ctx.beginPath();
    S.errs.forEach((e, i) => { const px = gx + i / 240 * gw, py = gy + gh - Math.min(e, emax) / emax * gh; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.stroke(); ctx.fillStyle = "#5b6573"; ctx.fillText("tracking error", gx, gy + gh + 9);
  }

  /* ---------- UI ---------- */
  const $ = id => document.getElementById(id);
  const out = { err: $("rbErr"), rms: $("rbRms"), bend: $("rbBend") };
  function readouts() {
    const x = fk(S.q).tip, xd = desired();
    out.err.textContent = Math.hypot(xd[0] - x[0], xd[1] - x[1]).toFixed(1) + " mm";
    out.rms.textContent = S.rms.toFixed(1) + " mm";
    out.bend.textContent = S.q.map(k => Math.round(k * P.L * 180 / Math.PI) + "°").join(" · ");
  }
  document.querySelectorAll("[data-path]").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("[data-path]").forEach(x => x.classList.toggle("on", x === b));
    S.path = b.dataset.path; S.trail = []; S.lapErr = []; S.s = 0;
    canvas.classList.toggle("follow", S.path === "mouse");
  }));
  $("rbSpeed").addEventListener("input", e => { S.period = 16 - +e.target.value; $("rbSpeedVal").textContent = S.period.toFixed(0) + " s/lap"; });
  $("rbGain").addEventListener("input", e => { S.kp = +e.target.value; $("rbGainVal").textContent = S.kp.toFixed(1); });
  $("rbFF").addEventListener("change", e => { S.ff = e.target.checked; S.lapErr = []; });
  $("rbPush").addEventListener("click", () => { S.push = 1; });
  $("rbPause").addEventListener("click", e => { S.paused = !S.paused; e.currentTarget.textContent = S.paused ? "▶ Play" : "❚❚ Pause"; });

  const setMouse = ev => {
    const r = canvas.getBoundingClientRect(), m = toModel(ev.clientX - r.left, ev.clientY - r.top);
    const d = Math.hypot(m[0], m[1]); if (d > 290) { m[0] *= 290 / d; m[1] *= 290 / d; }
    S.mouse = [m[0], Math.max(20, m[1])];
  };
  canvas.addEventListener("pointermove", ev => { if (S.path === "mouse") setMouse(ev); });
  canvas.addEventListener("pointerdown", ev => {
    if (S.path !== "mouse") { const b = document.querySelector('[data-path="mouse"]'); if (b) b.click(); }
    setMouse(ev);
  });

  /* ---------- loop (pauses when off-screen) ---------- */
  let last = 0, visible = true;
  new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible) { last = 0; requestAnimationFrame(loop); } }).observe(canvas);
  function loop(t) {
    if (!visible) return;
    const dt = last ? Math.min((t - last) / 1000, 0.04) : 0; last = t;
    if (!S.paused) { const sub = 4; for (let i = 0; i < sub; i++) step(dt / sub); }
    draw(); readouts();
    requestAnimationFrame(loop);
  }
  window.addEventListener("resize", resize);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { S.paused = true; $("rbPause").textContent = "▶ Play"; }
  resize(); requestAnimationFrame(loop);
})();
